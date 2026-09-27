/*
 * The Claude plan IO shell: the production `run` that launches Claude Code. The policy
 * (which command, deadlines, single-flight, parsing) is the pure claude-plan-service; this
 * file only touches child processes, so it carries no unit tests, like office-io.
 *
 * The binary is resolved on first use rather than at launch: it comes from an optional,
 * per-platform package, and a machine without one should see a sign-in that cannot start,
 * not an app that cannot open. spawn runs without a shell and every argument is fixed, and
 * the path comes from the app's own node_modules, not from the user (rule 12).
 */
import { spawn } from 'node:child_process';
import { formatError } from '../../../shared/utilities/format-error.ts';
import type { ClaudeRun, ClaudeRunOutcome } from './claude-plan-service.ts';

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
