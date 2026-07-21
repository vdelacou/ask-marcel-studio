/*
 * Wires the bash guard into the SDK as a PreToolUse hook.
 *
 * A hook denial short-circuits regardless of permission mode, which is what lets the
 * app keep `bypassPermissions` (no approval prompts anywhere, by design) while still
 * refusing the handful of commands that cannot be undone. The denial reason goes to the
 * MODEL, not the user: the agent reads it, explains it in its own words, and carries on.
 *
 * `import type` only, so this file never pulls the SDK into the runtime graph and the
 * bun runner can cover it.
 */
import { evaluateBashCommand } from '../../../shared/bash-guard.ts';
import type { Options } from '@anthropic-ai/claude-agent-sdk';

export type AgentHooksInput = {
  readonly workspaceDir: string;
  readonly disabledOfficeCategories: readonly string[];
  readonly officeCommandCategories: ReadonlyMap<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const buildAgentHooks = (input: AgentHooksInput): NonNullable<Options['hooks']> => ({
  PreToolUse: [
    {
      matcher: 'Bash',
      hooks: [
        // The SDK's hook signature returns a promise; nothing here awaits, because the
        // check is a pure function over the command string.
        (hookInput) => {
          // A Bash call with no command string is nothing this can judge, and a thrown
          // hook would fail the whole turn, so both fall through to no opinion.
          if (hookInput.hook_event_name !== 'PreToolUse') return Promise.resolve({});
          const toolInput = hookInput.tool_input;
          const command = isRecord(toolInput) ? toolInput['command'] : undefined;
          if (typeof command !== 'string') return Promise.resolve({});

          const verdict = evaluateBashCommand(command, {
            workspaceDir: input.workspaceDir,
            disabledOfficeCategories: input.disabledOfficeCategories,
            officeCommandCategories: input.officeCommandCategories,
          });
          if (verdict.allow) return Promise.resolve({});
          return Promise.resolve({ hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: verdict.reason } });
        },
      ],
    },
  ],
});
