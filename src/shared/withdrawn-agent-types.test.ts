/*
 * Pins the Task() deny rules that keep the bundled CLI's generic subagents (general-purpose,
 * Explore, ...) out of the app. The only sanctioned delegations are the shipped readers; a
 * generic agent would re-open the undisciplined read paths the readers exist to close.
 */
import { describe, expect, test } from 'bun:test';
import { WITHDRAWN_AGENT_TYPES, withdrawnTaskRules } from './agents-doc.ts';

describe('withdrawn generic agent types', () => {
  test('every bundled generic agent is denied as a Task rule', () => {
    expect(withdrawnTaskRules()).toEqual(['Task(claude)', 'Task(claude-code-guide)', 'Task(Explore)', 'Task(general-purpose)', 'Task(Plan)', 'Task(statusline-setup)']);
  });

  test('the shipped readers are not on the withdrawn list', () => {
    expect(WITHDRAWN_AGENT_TYPES).not.toContain('doc-reader');
    expect(WITHDRAWN_AGENT_TYPES).not.toContain('mail-reader');
  });
});
