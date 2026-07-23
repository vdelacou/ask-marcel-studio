import { describe, expect, test } from 'bun:test';
import { buildContextBlocks } from './context-blocks.ts';

describe('the always-on context the agent gets', () => {
  test('who the user says they are rides along, under its own heading', () => {
    const blocks = buildContextBlocks({ aboutYou: 'I am the CIO. I care about clarity.', quickContext: '', memoryPreamble: '' });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('About the person you work for');
    expect(blocks[0]).toContain('I am the CIO.');
  });

  test('an empty About-you file adds no block, and no blank heading', () => {
    expect(buildContextBlocks({ aboutYou: '   ', quickContext: 'quick', memoryPreamble: 'mem' })).toEqual(['quick', 'mem']);
  });

  test('the order is who-they-are, then the directory, then the memory reminder', () => {
    const blocks = buildContextBlocks({ aboutYou: 'me', quickContext: 'directory', memoryPreamble: 'you have a memory' });

    expect(blocks).toEqual(['## About the person you work for\n\nme', 'directory', 'you have a memory']);
  });

  test('everything empty is no blocks at all, not a list of blanks', () => {
    expect(buildContextBlocks({ aboutYou: '', quickContext: '', memoryPreamble: '' })).toEqual([]);
  });
});
