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
import { mkdir, readdir, rm } from 'node:fs/promises';
import { conversationId, newConversationId } from '../../../shared/conversation-id.ts';
import { byMostRecentlyUpdated, newConversation, parseConversation, serialiseConversation, toMeta } from '../../../shared/conversation-doc.ts';
import { conversationFilePath, conversationsDir, workspaceDir } from '../../../shared/paths.ts';
import { readJsonFile, removeFile, writeJsonFileAtomic } from './json-file.ts';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { CreateConversationInput, RenameConversationInput, StoreError } from '../../../shared/ipc-contract.ts';
import type { Conversation, ConversationMeta } from '../../../shared/types.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type ConversationsStoreDeps = {
  readonly userData: string;
  // Injected rather than read from the system clock, so the composition root stays
  // testable (references/architecture.md, parameterise every state-source).
  readonly now: () => string;
};

export type ConversationsStore = {
  readonly list: () => Promise<Result<readonly ConversationMeta[], StoreError>>;
  readonly create: (input: CreateConversationInput) => Promise<Result<Conversation, StoreError>>;
  readonly get: (id: string) => Promise<Result<Conversation, StoreError>>;
  readonly rename: (input: RenameConversationInput) => Promise<Result<ConversationMeta, StoreError>>;
  readonly remove: (id: string) => Promise<Result<null, StoreError>>;
  readonly workspaceFor: (id: string) => Promise<Result<string, StoreError>>;
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

  const create = async (input: CreateConversationInput): Promise<Result<Conversation, StoreError>> => {
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

  return { list, create, get: readOne, rename, remove, workspaceFor, save: writeOne };
};
