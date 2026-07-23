/*
 * The two files the user writes about themselves: their email signature and how they
 * write.
 *
 * Both live in the agent's own config folder, so the drafting skill opens them by a
 * fixed path and neither needs a tool of its own. They are plain files on purpose:
 * nothing in either is secret, and sealing them would only make them unreadable to the
 * agent that exists to use them.
 *
// The document id is a whitelist, never a path. It crosses IPC as an untrusted string
 * and ends up in a join(), so only the named values are allowed.
 *
 * Pure: zero electron imports, so `bun test` covers the checkpoint.
 */
import { globalContextFilePath, signatureFilePath, voiceProfileFilePath } from './paths.ts';
import type { Result } from './result.ts';
import { err, ok } from './result.ts';

export type AgentFileDoc = 'signature' | 'voice-profile' | 'global-context';

//   invalid      what arrived cannot be stored (not a document, not text, too big)
//   unreadable   the file on disk could not be read
//   write-failed the write could not complete
//   unavailable  regenerating is not possible right now (no sign-in, no provider)
export type AgentFileError =
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unreadable'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string };

// Generous for a signature with inline images, far short of anything that could fill a
// disk or a prompt.
export const AGENT_FILE_MAX_BYTES = 262_144;

const DOCS: readonly AgentFileDoc[] = ['signature', 'voice-profile', 'global-context'];

export const parseAgentFileDoc = (raw: unknown): Result<AgentFileDoc, AgentFileError> => {
  const matched = DOCS.find((doc) => doc === raw);
  if (matched === undefined) return err({ kind: 'invalid', message: 'that is not a document this app stores' });
  return ok(matched);
};

export const validateAgentFileText = (raw: unknown): Result<string, AgentFileError> => {
  if (typeof raw !== 'string') return err({ kind: 'invalid', message: 'that is not text' });
  // Bytes, not characters: an inline image is base64 and a signature full of accents
  // is longer than it looks.
  if (new TextEncoder().encode(raw).length > AGENT_FILE_MAX_BYTES) return err({ kind: 'invalid', message: 'that is too long to store (the limit is 256 KB)' });
  return ok(raw);
};

// The three files, each by its fixed path. global-context is what the user writes about
// themselves ("who I am, what matters to me"), read into every system prompt.
export const agentFilePath = (userData: string, doc: AgentFileDoc): string => {
  if (doc === 'signature') return signatureFilePath(userData);
  if (doc === 'voice-profile') return voiceProfileFilePath(userData);
  return globalContextFilePath(userData);
};
