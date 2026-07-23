import { describe, expect, test } from 'bun:test';
import { planTranscriptSweep, sdkProjectDirName, staleJsonl } from './transcript-sweep.ts';

describe('naming the SDK transcript folder', () => {
  test('a workspace path becomes the folder the SDK actually wrote, dash for every non-alphanumeric', () => {
    // Pinned against a real on-disk name.
    expect(sdkProjectDirName('/Users/pa2bra/Library/Application Support/ask-marcel-studio/workspaces/01bf425c-4f63-4c47-b7a3-a18361fa75b7')).toBe(
      '-Users-pa2bra-Library-Application-Support-ask-marcel-studio-workspaces-01bf425c-4f63-4c47-b7a3-a18361fa75b7'
    );
  });
});

describe('deciding which transcript folders to sweep', () => {
  test('a folder with no conversation left is swept', () => {
    const present = ['-ws-alive', '-ws-orphan', '-background'];

    expect(planTranscriptSweep({ present, keep: ['-ws-alive', '-background'] })).toEqual(['-ws-orphan']);
  });

  test('a living conversation’s folder is kept, so resume keeps working', () => {
    expect(planTranscriptSweep({ present: ['-ws-alive'], keep: ['-ws-alive'] })).toEqual([]);
  });

  test('nothing present is nothing to sweep', () => {
    expect(planTranscriptSweep({ present: [], keep: ['-ws-alive'] })).toEqual([]);
  });
});

describe('capping the background workspace’s own transcripts', () => {
  const files = [
    { name: 'recent.jsonl', mtimeMs: 1000 },
    { name: 'old.jsonl', mtimeMs: 10 },
    { name: 'memory', mtimeMs: 10 },
  ];

  test('only the jsonl older than the cutoff is trimmed, and non-jsonl is left alone', () => {
    expect(staleJsonl(files, 500)).toEqual(['old.jsonl']);
  });

  test('a fresh background workspace keeps everything', () => {
    expect(staleJsonl(files, 5)).toEqual([]);
  });

  test('a file exactly at the cutoff is kept, so the boundary is strictly older-than', () => {
    expect(staleJsonl([{ name: 'edge.jsonl', mtimeMs: 500 }], 500)).toEqual([]);
  });
});
