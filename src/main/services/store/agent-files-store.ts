/*
 * Reads and writes the signature and the voice profile.
 *
 * The IO shell around agent-files.ts: every decision about what may be stored, and
 * which file a request means, lives in that pure module. This knows about bytes.
 *
 * No safeStorage anywhere here, deliberately. These files hold nothing secret, and the
 * agent reads them straight off disk by path: sealing them would make them unreadable
 * to the only thing that uses them.
 */
import { agentFilePath, parseAgentFileDoc, validateAgentFileText } from '../../../shared/agent-files.ts';
import type { AgentFileError } from '../../../shared/agent-files.ts';
import { readTextFile, writeTextFileAtomic } from './json-file.ts';
import type { Result } from '../../../shared/result.ts';
import { err, ok } from '../../../shared/result.ts';

export type AgentFilesStoreDeps = {
  readonly userData: string;
};

export type AgentFilesStore = {
  // A document that has never been written is empty, not missing: the panel shows an
  // empty editor either way, and "not found" would be a distinction with no meaning.
  readonly get: (doc: unknown) => Promise<Result<string, AgentFileError>>;
  readonly save: (doc: unknown, text: unknown) => Promise<Result<string, AgentFileError>>;
};

export const createAgentFilesStore = (deps: AgentFilesStoreDeps): AgentFilesStore => {
  const get = async (doc: unknown): Promise<Result<string, AgentFileError>> => {
    const checked = parseAgentFileDoc(doc);
    if (!checked.ok) return checked;

    const text = await readTextFile(agentFilePath(deps.userData, checked.value));
    if (!text.ok && text.error.kind === 'not-found') return ok('');
    if (!text.ok) return err({ kind: 'unreadable', message: text.error.message });
    return ok(text.value);
  };

  const save = async (doc: unknown, text: unknown): Promise<Result<string, AgentFileError>> => {
    const checked = parseAgentFileDoc(doc);
    if (!checked.ok) return checked;

    const contents = validateAgentFileText(text);
    if (!contents.ok) return contents;

    const written = await writeTextFileAtomic(agentFilePath(deps.userData, checked.value), contents.value);
    if (!written.ok) return err({ kind: 'write-failed', message: written.error.message });
    return ok(contents.value);
  };

  return { get, save };
};
