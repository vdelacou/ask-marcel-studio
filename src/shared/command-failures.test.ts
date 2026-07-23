import { describe, expect, test } from 'bun:test';
import { emptyFailures, recordFailure, repeatedlyFailed } from './command-failures.ts';

describe('noticing a command that keeps failing', () => {
  test('a command that failed twice is one to stop repeating', () => {
    let state = emptyFailures();
    state = recordFailure(state, 'ask-marcel-office list-mail --folder inbox');
    state = recordFailure(state, 'ask-marcel-office list-mail --folder inbox');

    expect(repeatedlyFailed(state)).toContain('ask-marcel-office list-mail --folder inbox');
  });

  test('one failure is not a pattern', () => {
    const state = recordFailure(emptyFailures(), 'ask-marcel-office list-mail --folder inbox');

    expect(repeatedlyFailed(state)).toEqual([]);
  });

  test('the same command with different whitespace is the same command', () => {
    let state = recordFailure(emptyFailures(), 'ask-marcel-office   list-mail');
    state = recordFailure(state, 'ask-marcel-office list-mail');

    expect(repeatedlyFailed(state)).toEqual(['ask-marcel-office list-mail']);
  });

  test('two different failing commands are tracked apart', () => {
    let state = recordFailure(emptyFailures(), 'a --x');
    state = recordFailure(state, 'a --x');
    state = recordFailure(state, 'b --y');

    expect(repeatedlyFailed(state)).toEqual(['a --x']);
  });

  test('a blank command is not worth tracking', () => {
    const state = recordFailure(recordFailure(emptyFailures(), '   '), '   ');

    expect(repeatedlyFailed(state)).toEqual([]);
  });
});

describe('not remembering forever', () => {
  test('an old failure is forgotten once enough newer ones have happened', () => {
    let state = recordFailure(emptyFailures(), 'old --command');
    for (let index = 0; index < 20; index++) state = recordFailure(state, `fresh-${String(index)} --run`);
    state = recordFailure(state, 'old --command');

    // The first 'old' fell out of the buffer, so this is only its first sighting again.
    expect(repeatedlyFailed(state)).not.toContain('old --command');
  });

  test('the buffer never grows without bound', () => {
    let state = emptyFailures();
    for (let index = 0; index < 500; index++) state = recordFailure(state, `command-${String(index)} --run`);

    expect(state.recent.length).toBeLessThanOrEqual(20);
  });
});
