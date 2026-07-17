/*
 * Result<T, E> — expected failures are data; exceptions are for bugs.
 *
 * Every port that crosses an IO boundary and every use-case returns a Result.
 * Thrown exceptions are reserved for programmer errors: unreachable code,
 * invariant violations, genuine crashes.
 *
 * Canonical source: skills/atelier/references/result-type.md. Zero dependencies. Pure.
 * Lives in src/shared/ (not src/domain/) because this repo's layout is the
 * Electron hybrid variant — see .claude/LESSONS.md.
 */

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const mapResult = <T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> => (r.ok ? ok(f(r.value)) : r);

export const mapError = <T, E, F>(r: Result<T, E>, f: (e: E) => F): Result<T, F> => (r.ok ? r : err(f(r.error)));

export const andThen = <T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> => (r.ok ? f(r.value) : r);

// Reserved for bootstrapping code and tests where the error branch is genuinely
// impossible. Production code pattern-matches on `.ok`.
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (!r.ok) throw new Error(`unwrap on err: ${JSON.stringify(r.error)}`);
  return r.value;
};
