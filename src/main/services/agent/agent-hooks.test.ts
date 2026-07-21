import { describe, expect, test } from 'bun:test';
import { buildAgentHooks } from './agent-hooks.ts';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';

const WORKSPACE = '/data/workspaces/conv-1';

const hooks = buildAgentHooks({ workspaceDir: WORKSPACE, disabledOfficeCategories: ['calendar'], officeCommandCategories: new Map([['list-events', 'calendar']]) });

const bashInput = (command: unknown): HookInput =>
  ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    tool_use_id: 't1',
    session_id: 's1',
    transcript_path: '/data/transcript.jsonl',
    cwd: WORKSPACE,
    permission_mode: 'bypassPermissions',
  }) as unknown as HookInput;

const run = async (input: HookInput): Promise<Record<string, unknown>> => {
  const callback = hooks.PreToolUse?.[0]?.hooks[0];
  if (callback === undefined) throw new Error('no hook registered');
  return await callback(input, 't1', { signal: new AbortController().signal });
};

describe('gating the agent’s shell', () => {
  test('the hook is registered for Bash and nothing else', () => {
    expect(hooks.PreToolUse?.[0]?.matcher).toBe('Bash');
  });

  test('an ordinary command gets no opinion, so the turn is untouched', async () => {
    expect(await run(bashInput('ls -la'))).toEqual({});
  });

  test('a command that would delete outside the workspace is denied with a reason', async () => {
    const output = await run(bashInput('rm -rf ~/Documents'));

    expect(output['hookSpecificOutput']).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' });
  });

  test('the reason reaches the model, so it can say what happened rather than retrying', async () => {
    const output = await run(bashInput('rm -rf ~/Documents'));
    const specific = output['hookSpecificOutput'] as { permissionDecisionReason?: string };

    expect(specific.permissionDecisionReason).toContain('outside this conversation');
  });

  test('a Microsoft 365 category the user switched off is refused here too', async () => {
    const output = await run(bashInput('ask-marcel-office list-events'));

    expect(output['hookSpecificOutput']).toMatchObject({ permissionDecision: 'deny' });
  });

  test('a Bash call with no command string is not judged', async () => {
    expect(await run(bashInput(undefined))).toEqual({});
  });

  test('a tool input that is not an object at all is not judged', async () => {
    const input = { ...(bashInput('x') as unknown as Record<string, unknown>), tool_input: 'nope' } as unknown as HookInput;

    expect(await run(input)).toEqual({});
  });

  test('an event that is not PreToolUse is not judged', async () => {
    const input = { ...(bashInput('rm -rf ~') as unknown as Record<string, unknown>), hook_event_name: 'PostToolUse' } as unknown as HookInput;

    expect(await run(input)).toEqual({});
  });
});
