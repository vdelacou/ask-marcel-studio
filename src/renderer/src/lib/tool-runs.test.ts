import { describe, expect, test } from 'bun:test';
import { groupToolRuns } from './tool-runs.ts';
import type { UngroupedPart } from './tool-runs.ts';
import type { ToolCallStatus } from '../components/molecules/tool-call-card/index.tsx';

const call = (id: string, status: ToolCallStatus = 'done'): UngroupedPart => ({
  kind: 'tool',
  item: { id, label: `Doing ${id}`, name: 'Bash', input: '{}', status },
});

const answer = (text: string): UngroupedPart => ({ kind: 'text', content: text });

describe('folding a turn into working cards', () => {
  test('a run of tool calls in a row becomes one card, in the order they happened', () => {
    const parts = groupToolRuns([call('a'), call('b'), call('c')]);

    expect(parts).toHaveLength(1);
    expect(parts[0]?.kind === 'tools' && parts[0].items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  test('an answer between two runs splits them into two cards', () => {
    const parts = groupToolRuns([call('a'), answer('halfway'), call('b')]);

    expect(parts.map((part) => part.kind)).toEqual(['tools', 'text', 'tools']);
  });

  test('the card says Marcel is working while any of its calls is still running', () => {
    const parts = groupToolRuns([call('a'), call('b', 'running')]);

    expect(parts[0]?.kind === 'tools' && parts[0].title).toBe('Marcel is working');
  });

  test('the card stops claiming work is under way once every call has finished', () => {
    const parts = groupToolRuns([call('a'), call('b')]);

    expect(parts[0]?.kind === 'tools' && parts[0].title).toBe('What Marcel did');
  });

  test('a failed call does not keep the card working', () => {
    const parts = groupToolRuns([call('a', 'error')]);

    expect(parts[0]?.kind === 'tools' && parts[0].title).toBe('What Marcel did');
  });

  test('a message that is only text comes back untouched', () => {
    const parts = groupToolRuns([answer('no tools were needed')]);

    expect(parts).toEqual([{ kind: 'text', content: 'no tools were needed' }]);
  });

  test('the card is keyed on the first call in its run', () => {
    const parts = groupToolRuns([call('first'), call('second')]);

    expect(parts[0]?.kind === 'tools' && parts[0].id).toBe('run-first');
  });
});
