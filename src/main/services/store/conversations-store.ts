/*
 * The conversations store: the IO shell around src/shared/conversation-doc.ts.
 *
 * One file per conversation (<userData>/conversations/<id>.json) plus a workspace
 * folder per conversation (<userData>/workspaces/<id>), which becomes the agent's
 * cwd in M2. Listing reads every file but returns only metas, so the sidebar never
 * carries message bodies.
 *
 * Every id crossing this boundary goes through conversationId() first: it is the
 * checkpoint that stops '../../etc/passwd' from reaching a join(). The branded type
 * is what makes that non-optional — paths.ts will not accept a bare string.
 */
import { basename, join } from 'node:path';
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { conversationId, newConversationId } from '../../../shared/conversation-id.ts';
import { byMostRecentlyUpdated, newConversation, parseConversation, serialiseConversation, toMeta } from '../../../shared/conversation-doc.ts';
import { conversationFilePath, conversationsDir, importsDir, workspaceDir } from '../../../shared/paths.ts';
import { readJsonFile, removeFile, writeJsonFileAtomic } from './json-file.ts';
import { parseModelRef } from '../../../shared/model-ref.ts';
import { MAX_IMPORT_BYTES, resolveCollision, safeImportName } from '../../../shared/import-plan.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { ImportError, ImportPathsInput, ImportedFile, RenameConversationInput, SetConversationModelInput, StoreError } from '../../../shared/ipc-contract.ts';
import type { Conversation, ConversationMeta } from '../../../shared/types.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type ConversationsStoreDeps = {
  readonly userData: string;
  // Injected rather than read from the system clock, so the composition root stays
  // testable (references/architecture.md, parameterise every state-source).
  readonly now: () => string;
};

// What create needs once main has decided: a model reference that definitely exists. The
// IPC input's model is optional and untrusted; this one has been through the checkpoint.
export type ResolvedCreateInput = { readonly model: string };

export type ConversationsStore = {
  readonly list: () => Promise<Result<readonly ConversationMeta[], StoreError>>;
  // A RESOLVED model, unlike the optional one on the IPC input: main decides which model a
  // new conversation opens on (model-ref.ts) and the store is handed the answer.
  readonly create: (input: ResolvedCreateInput) => Promise<Result<Conversation, StoreError>>;
  readonly get: (id: string) => Promise<Result<Conversation, StoreError>>;
  readonly rename: (input: RenameConversationInput) => Promise<Result<ConversationMeta, StoreError>>;
  // Takes effect from the next message: the runtime reads the model per send.
  readonly setModel: (input: SetConversationModelInput) => Promise<Result<ConversationMeta, StoreError>>;
  readonly remove: (id: string) => Promise<Result<null, StoreError>>;
  readonly workspaceFor: (id: string) => Promise<Result<string, StoreError>>;
  // Copies files the user picked or dropped into the conversation's workspace, under
  // imports/. They go when the conversation goes, and the agent opens them by a short
  // relative path.
  readonly importPaths: (input: ImportPathsInput) => Promise<Result<readonly ImportedFile[], ImportError>>;
  // The same, for a file that exists only as bytes (an attachment dragged out of a
  // mail client has no path on disk).
  readonly importBytes: (input: { readonly id: string; readonly name: string; readonly bytes: Uint8Array }) => Promise<Result<ImportedFile, ImportError>>;
  // Writes a whole conversation back. The agent runtime calls this once per turn end
  // (risk R11: one write per turn, one in-flight turn per conversation).
  readonly save: (conversation: Conversation) => Promise<Result<Conversation, StoreError>>;
};

export const createConversationsStore = (deps: ConversationsStoreDeps): ConversationsStore => {
  const readOne = async (rawId: string): Promise<Result<Conversation, StoreError>> => {
    const checked = conversationId(rawId);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });

    const raw = await readJsonFile(conversationFilePath(deps.userData, checked.value));
    if (!raw.ok && raw.error.kind === 'not-found') return err({ kind: 'not-found', message: `no conversation ${rawId}` });
    if (!raw.ok) return err({ kind: 'unreadable', message: raw.error.message });

    const parsed = parseConversation(raw.value);
    if (!parsed.ok) return err({ kind: 'unreadable', message: parsed.error.message });
    return ok(parsed.value);
  };

  const writeOne = async (conversation: Conversation): Promise<Result<Conversation, StoreError>> => {
    const written = await writeJsonFileAtomic(conversationFilePath(deps.userData, conversation.id), serialiseConversation(conversation));
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    return ok(conversation);
  };

  const list = async (): Promise<Result<readonly ConversationMeta[], StoreError>> => {
    let entries: string[];
    try {
      entries = await readdir(conversationsDir(deps.userData));
    } catch (e) {
      // First launch: the folder does not exist yet, which is an empty list rather
      // than a failure. Anything else is real.
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ENOENT') return ok([]);
      return err({ kind: 'unreadable', message: formatError(e) });
    }

    const metas: ConversationMeta[] = [];
    for (const entry of entries.filter((name) => name.endsWith('.json'))) {
      const one = await readOne(entry.replace(/\.json$/, ''));
      // A single corrupt or half-written file must not take the whole sidebar down;
      // it simply does not list. The conversation itself still errors when opened.
      if (one.ok) metas.push(toMeta(one.value));
    }
    return ok([...metas].sort(byMostRecentlyUpdated));
  };

  const create = async (input: ResolvedCreateInput): Promise<Result<Conversation, StoreError>> => {
    const conversation = newConversation(newConversationId(), input.model, deps.now());
    return writeOne(conversation);
  };

  const rename = async (input: RenameConversationInput): Promise<Result<ConversationMeta, StoreError>> => {
    const existing = await readOne(input.id);
    if (!existing.ok) return existing;

    const title = input.title.trim();
    if (title.length === 0) return err({ kind: 'invalid', message: 'a conversation title cannot be blank' });

    const written = await writeOne({ ...existing.value, title, updatedAt: deps.now() });
    if (!written.ok) return written;
    return ok(toMeta(written.value));
  };

  const setModel = async (input: SetConversationModelInput): Promise<Result<ConversationMeta, StoreError>> => {
    const existing = await readOne(input.id);
    if (!existing.ok) return existing;

    // Shape only. Whether the reference names something the user actually has set up
    // is a settings question, answered at the IPC boundary where settings are readable.
    const parsed = parseModelRef(input.model);
    if (!parsed.ok) return err({ kind: 'invalid', message: parsed.error.message });

    const written = await writeOne({ ...existing.value, model: input.model, updatedAt: deps.now() });
    if (!written.ok) return written;
    return ok(toMeta(written.value));
  };

  const remove = async (rawId: string): Promise<Result<null, StoreError>> => {
    const checked = conversationId(rawId);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });

    const deleted = await removeFile(conversationFilePath(deps.userData, checked.value));
    if (!deleted.ok && deleted.error.kind === 'not-found') return err({ kind: 'not-found', message: `no conversation ${rawId}` });
    if (!deleted.ok) return err({ kind: 'write-failed', message: deleted.error.message });

    // The workspace holds whatever the agent wrote. It goes with the conversation;
    // leaving it behind would silently grow userData forever.
    await rm(workspaceDir(deps.userData, checked.value), { recursive: true, force: true }).catch(() => undefined);
    return ok(null);
  };

  const workspaceFor = async (rawId: string): Promise<Result<string, StoreError>> => {
    const checked = conversationId(rawId);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });

    const dir = workspaceDir(deps.userData, checked.value);
    try {
      await mkdir(dir, { recursive: true });
      return ok(dir);
    } catch (e) {
      return err({ kind: 'write-failed', message: `could not create the workspace for ${rawId}: ${formatError(e)}` });
    }
  };

  // Everything imported lands here, named safely and never overwriting what is already
  // there. Returns the folder plus what it already holds, so a batch can be named
  // against a list that grows as it goes.
  const openImports = async (rawId: string): Promise<Result<{ readonly dir: string; readonly existing: string[] }, ImportError>> => {
    const checked = conversationId(rawId);
    if (!checked.ok) return err({ kind: 'malformed-id', message: checked.error.message });

    const dir = importsDir(deps.userData, checked.value);
    try {
      await mkdir(dir, { recursive: true });
      return ok({ dir, existing: await readdir(dir) });
    } catch (e) {
      return err({ kind: 'write-failed', message: `could not prepare the attachments folder: ${formatError(e)}` });
    }
  };

  const importPaths = async (input: ImportPathsInput): Promise<Result<readonly ImportedFile[], ImportError>> => {
    const opened = await openImports(input.id);
    if (!opened.ok) return opened;

    const { dir, existing } = opened.value;
    const imported: ImportedFile[] = [];
    for (const source of input.paths) {
      let size: number;
      try {
        size = (await stat(source)).size;
      } catch (e) {
        return err({ kind: 'unreadable', message: `could not read ${basename(source)}: ${formatError(e)}` });
      }
      // Checked before the copy, so an oversized file is refused rather than half
      // written and then rejected.
      if (size > MAX_IMPORT_BYTES) return err({ kind: 'too-large', message: `${basename(source)} is too big to attach (the limit is 25 MB)` });

      const name = resolveCollision(existing, safeImportName(source));
      try {
        await copyFile(source, join(dir, name));
      } catch (e) {
        return err({ kind: 'write-failed', message: `could not attach ${name}: ${formatError(e)}` });
      }
      existing.push(name);
      imported.push({ name, relativePath: `imports/${name}`, size });
    }
    return ok(imported);
  };

  const importBytes = async (input: { readonly id: string; readonly name: string; readonly bytes: Uint8Array }): Promise<Result<ImportedFile, ImportError>> => {
    if (input.bytes.byteLength > MAX_IMPORT_BYTES) return err({ kind: 'too-large', message: `${input.name} is too big to attach (the limit is 25 MB)` });

    const opened = await openImports(input.id);
    if (!opened.ok) return opened;

    const name = resolveCollision(opened.value.existing, safeImportName(input.name));
    try {
      await writeFile(join(opened.value.dir, name), input.bytes);
    } catch (e) {
      return err({ kind: 'write-failed', message: `could not attach ${name}: ${formatError(e)}` });
    }
    return ok({ name, relativePath: `imports/${name}`, size: input.bytes.byteLength });
  };

  return { list, create, get: readOne, rename, setModel, remove, workspaceFor, importPaths, importBytes, save: writeOne };
};
