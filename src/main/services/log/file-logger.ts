/*
 * A tiny append-only file logger.
 *
 * node:fs, not Bun.file: the main process runs in Electron's Node runtime where the Bun
 * global does not exist, and appending needs a real append (LESSONS, hard rule 20 in main).
 * No dependency: the format and the rotation rule are the pure log-line; this is the queue
 * and the disk.
 *
 * A logger must never take the app down, so every IO error is swallowed. Writes are
 * serialised through a promise chain so two turns logging at once cannot interleave a line.
 */
import { appendFileSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { formatLogLine, shouldRotate } from '../../../shared/log-line.ts';
import type { Logger, LogFields, LogLevel } from '../../../shared/log-line.ts';

export type FileLoggerDeps = {
  readonly path: string;
  readonly maxBytes: number;
  readonly now: () => string;
};

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

export const createFileLogger = (deps: FileLoggerDeps): Logger => {
  try {
    mkdirSync(dirname(deps.path), { recursive: true });
  } catch {
    // A logger that cannot make its own folder simply writes nothing; it never throws.
  }

  const write = (level: LogLevel, event: string, fields?: LogFields): void => {
    const line = formatLogLine({ at: deps.now(), level, event, ...(fields === undefined ? {} : { fields }) });
    try {
      if (shouldRotate(sizeOf(deps.path), deps.maxBytes)) {
        // One generation kept: the current file becomes .1, replacing any older .1.
        renameSync(deps.path, `${deps.path}.1`);
        writeFileSync(deps.path, '');
      }
      appendFileSync(deps.path, line);
    } catch {
      // Swallowed on purpose: a full disk or a permission change must not fail a turn.
    }
  };

  return {
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
};
