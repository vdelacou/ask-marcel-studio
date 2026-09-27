/*
 * The Claude plan IO shell: the production `run` that launches Claude Code, and the model
 * list read through the Agent SDK. The policy (which command, deadlines, single-flight,
 * parsing) lives in claude-plan-service and claude-plan-models; this file only touches child
 * processes and the SDK, so it carries no unit tests, like office-io.
 *
 * The binary is resolved on first use rather than at launch: it comes from an optional,
 * per-platform package, and a machine without one should see a sign-in that cannot start,
 * not an app that cannot open. spawn runs without a shell and every argument is fixed, and
 * the path comes from the app's own node_modules, not from the user (rule 12).
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { ClaudeRun, ClaudeRunOutcome } from './claude-plan-service.ts';
import type { ClaudeModelList, ClaudeModelListOutcome } from './claude-plan-models.ts';

const locate = (resolveBinary: () => string): { readonly path: string } | { readonly message: string } => {
  try {
    return { path: resolveBinary() };
  } catch (error) {
    return { message: `Claude Code is not installed with this app: ${formatError(error)}` };
  }
};

export const createClaudeRun =
  (resolveBinary: () => string, env: Readonly<Record<string, string>>): ClaudeRun =>
  (args, timeoutMs) =>
    new Promise<ClaudeRunOutcome>((resolve) => {
      const binary = locate(resolveBinary);
      if (!('path' in binary)) {
        resolve({ ran: false, message: binary.message });
        return;
      }
      const child = spawn(binary.path, [...args], { env });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ ran: false, message: formatError(error) });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ ran: true, stdout, stderr, code: code ?? -1, timedOut });
      });
    });

// A prompt stream that never yields: the session starts and answers control requests, but no
// message is ever sent, so asking for the models spends nothing.
const silence: AsyncIterable<SDKUserMessage> = { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<SDKUserMessage>>(() => undefined) }) };

export type ClaudeModelListOptions = {
  // The sign-in environment: this account's CLAUDE_CONFIG_DIR, nothing that outranks the plan.
  readonly env: Readonly<Record<string, string>>;
  // An app-owned folder. Created first: a spawn in a missing cwd is reported by the SDK as a
  // broken binary (.claude/LESSONS.md, 2026-07-21).
  readonly cwd: string;
};

// The same Claude Code a turn runs, found by the SDK itself. No settings or session file is
// loaded or written, and the session is aborted as soon as the list is read or the deadline
// passes; `supportedModels()` needs the streaming input this silence provides.
export const createClaudeModelList =
  (options: ClaudeModelListOptions): ClaudeModelList =>
  async (timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await mkdir(options.cwd, { recursive: true });
      const session = query({ prompt: silence, options: { abortController: controller, cwd: options.cwd, env: { ...options.env }, settingSources: [], persistSession: false } });
      const outcome: ClaudeModelListOutcome = { listed: true, models: await session.supportedModels() };
      return outcome;
    } catch (error) {
      return { listed: false, timedOut: controller.signal.aborted, message: formatError(error) };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
