import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileLogger } from './file-logger.ts';

let dir = '';
const logPath = (): string => join(dir, 'logs', 'main.log');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'studio-log-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writing the log to disk', () => {
  test('a line is written as one JSON object with its event', () => {
    const logger = createFileLogger({ path: logPath(), maxBytes: 5_000_000, now: () => '2026-07-24T00:00:00.000Z' });
    logger.info('turn-saved', { conversationId: 'c1' });

    const lines = readFileSync(logPath(), 'utf8').trim().split('\n');
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ level: 'info', event: 'turn-saved', conversationId: 'c1' });
  });

  test('every level lands in the file', () => {
    const logger = createFileLogger({ path: logPath(), maxBytes: 5_000_000, now: () => '2026-07-24T00:00:00.000Z' });
    logger.info('a');
    logger.warn('b');
    logger.error('c');

    expect(readFileSync(logPath(), 'utf8').trim().split('\n')).toHaveLength(3);
  });

  test('the file rotates once at the cap, keeping only the newest two generations', () => {
    const logger = createFileLogger({ path: logPath(), maxBytes: 200, now: () => '2026-07-24T00:00:00.000Z' });
    for (let index = 0; index < 20; index++) logger.info('event', { index });

    expect(existsSync(`${logPath()}.1`)).toBe(true);
    expect(existsSync(`${logPath()}.2`)).toBe(false);
  });

  test('a write to an impossible path is swallowed, never thrown', () => {
    const logger = createFileLogger({ path: '/this/does/not/exist/and/cannot/main.log', maxBytes: 100, now: () => '2026-07-24T00:00:00.000Z' });

    expect(() => logger.info('e')).not.toThrow();
  });
});
