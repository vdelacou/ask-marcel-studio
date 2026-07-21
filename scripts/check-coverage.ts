#!/usr/bin/env bun
/*
 * Per-tier coverage gate for atelier Clean Architecture.
 *
 * Runs `bun test --coverage`, parses the text report, and enforces a
 * different threshold for each source tier (domain, use-cases, infra,
 * composition, presenter). Exits non-zero on any violation.
 *
 * Exit codes:
 *   0  every non-skipped file meets its tier's threshold
 *   1  at least one file is below gate, or `bun test` failed
 *
 * Tune per-project by editing COVERAGE_RULES and SKIPPED below.
 *
 * IMPORTANT: bunfig.toml MUST NOT set a global `coverageThreshold` when
 * this script owns enforcement. The global threshold would make
 * `bun test --coverage` exit non-zero before the script can parse,
 * and the per-file violation breakdown never prints. See
 * skills/atelier/references/workflow.md.
 */

type Tier = {
  readonly name: string;
  readonly prefix: string;
  readonly threshold: number;
};

type SkipRule = {
  readonly name: string;
  readonly match: (path: string) => boolean;
};

// Retuned for this repo's Electron hybrid layout (src/{shared,main,preload,renderer})
// instead of the canonical src/{domain,use-cases,infra,...}. See .claude/LESSONS.md
// ([decision] coverage tiers and Stryker globs retuned...). This is the per-project
// tuning the file's header invites, not a deviation.
//
// src/shared/** is the pure kernel: zero electron imports, so `bun test` runs it for
// real. It carries the 100% tier. Everything under src/main, src/preload and
// src/renderer either imports electron (unrunnable under the bun test runner) or is
// a React component (rule 21 makes design-system components prop-pure and explicitly
// untested). Those are skipped here and verified by lint, typecheck, and the app itself.
//
// The named pure modules inside src/main and src/renderer (session-env, sdk-event-fold,
// the gateway translators, skill-md, office-shim, ui-event-fold) are gate-enforced by
// the explicit `pure module` tier below as each lands in M2+.
// WARNING before editing: a file matching NO tier prefix is silently ungated
// (`collectViolations` does `if (!tier) continue`). So every path that is not in
// SKIPPED must match a tier prefix here, or it passes the gate by being invisible.
// That is why the electron surface is SKIPPED explicitly rather than left to fall
// through unmatched.
// Main-process files that import NO electron and so CAN run under the bun test
// runner. They are exempt from the electron-surface skip below and gated at the
// atelier's infra tier (80%). Add a file here only after proving `bun test` can
// execute it; if it ever imports electron, the runner dies at import time.
const BUN_TESTABLE_MAIN: ReadonlyArray<string> = [
  'src/main/services/store/json-file.ts',
  'src/main/services/store/conversations-store.ts',
  'src/main/services/store/agent-files-store.ts',
  'src/main/services/store/agents-store.ts',
  'src/main/services/background/background-runner.ts',
  'src/main/services/background/voice-profile-job.ts',
  'src/main/services/memory/idle-watcher.ts',
  'src/main/services/memory/memory-service.ts',
  // Pure value derived from the built-in agent definitions (import type only).
  'src/main/services/agent/builtin-agents.ts',
  'src/main/services/skills/skills-service.ts',
  'src/main/services/office/office-service.ts',
  'src/main/services/models/model-test-service.ts',
  'src/main/services/office/signature-service.ts',
  'src/main/services/python/python-service.ts',
  // Pure agent-config value (import type only), so the bun runner covers it.
  'src/main/services/agent/m365-reader.ts',
  // The PreToolUse guard: import type only, so no SDK reaches the bun runner.
  'src/main/services/agent/agent-hooks.ts',
];

const COVERAGE_RULES: ReadonlyArray<Tier> = [
  { name: 'shared', prefix: 'src/shared/', threshold: 100 },
  // Prefix is the exact file path: these are gated individually, not as a tree,
  // because their siblings in the same folder do import electron.
  ...BUN_TESTABLE_MAIN.map((prefix) => ({ name: 'store io', prefix, threshold: 80 })),
  // Renderer logic is pure (no react, no electron) and therefore fully testable, so
  // it carries the same 100% bar as the shared kernel. Only src/renderer/src/lib
  // qualifies: components are prop-pure by rule 21 and page shells own the hooks.
  { name: 'renderer lib', prefix: 'src/renderer/src/lib/', threshold: 100 },
];

const SKIPPED: ReadonlyArray<SkipRule> = [
  { name: 'test-helpers', match: (p) => p.startsWith('src/test-helpers/') },
  { name: 'entry point', match: (p) => p === 'src/main/index.ts' },
  // Electron-importing and React-rendering code: unreachable from the bun test runner
  // (it has no electron runtime), and for src/renderer/src/components/** explicitly
  // not unit-tested by rule 21 (prop-pure components are verified by lint and review).
  {
    name: 'electron surface',
    match: (p) =>
      !BUN_TESTABLE_MAIN.includes(p) && !p.startsWith('src/renderer/src/lib/') && (p.startsWith('src/main/') || p.startsWith('src/preload/') || p.startsWith('src/renderer/')),
  },
];
// Resist adding composition/wiring files here: any composition root is
// 100%-testable once its state-sources (paths, env, clock) are parameters
// and its sinks (logger, sender) injected — see references/architecture.md
// (Composition root testability). SKIPPED is for genuine non-code entries.

type FileRow = {
  readonly path: string;
  readonly funcs: number;
  readonly lines: number;
};

type Violation = {
  readonly file: FileRow;
  readonly tier: string;
  readonly threshold: number;
  readonly metric: 'funcs' | 'lines';
  readonly actual: number;
};

const isSkipped = (path: string): boolean => SKIPPED.some((s) => s.match(path));

const findTier = (path: string): Tier | undefined => COVERAGE_RULES.find((t) => path.startsWith(t.prefix));

const parseRow = (line: string): FileRow | undefined => {
  const parts = line.split('|').map((c) => c.trim());
  if (parts.length < 3) return undefined;
  const layouts: ReadonlyArray<{ path: number; funcs: number; lines: number }> = [
    { path: 0, funcs: 1, lines: 2 },
    { path: 1, funcs: 2, lines: 3 },
  ];
  for (const layout of layouts) {
    const path = parts[layout.path];
    if (!path) continue;
    if (path === 'File' || path === 'All files' || path.startsWith('-')) continue;
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) continue;
    const funcs = Number.parseFloat(parts[layout.funcs] ?? '');
    const lines = Number.parseFloat(parts[layout.lines] ?? '');
    if (Number.isNaN(funcs) || Number.isNaN(lines)) continue;
    const normalised = path.startsWith('./') ? path.slice(2) : path;
    return { path: normalised, funcs, lines };
  }
  return undefined;
};

// We pass `--preload ./scripts/coverage-preload.ts` HERE rather than wiring
// the preload via `bunfig.toml`'s `[test] preload = [...]`. The preload
// side-effect-imports every infra/composition/presenter file (so they show
// up in the coverage table at 0% if untested) but it pulls in heavy
// third-party SDKs (whatever the infra adapters wrap) that add 1–2s to
// every plain `bun test` run. Loading the preload only when computing
// coverage keeps the inner-loop tests fast without losing the gate.
const runTestsWithCoverage = async (): Promise<{ readonly status: number; readonly output: string }> => {
  const proc = Bun.spawn(['bun', 'test', '--coverage', '--preload', './scripts/coverage-preload.ts'], { stdout: 'pipe', stderr: 'pipe' });
  const [stdoutText, stderrText] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  process.stdout.write(stdoutText);
  process.stderr.write(stderrText);
  const status = await proc.exited;
  return { status, output: `${stdoutText}\n${stderrText}` };
};

const worstBy = (rows: ReadonlyArray<FileRow>, metric: 'funcs' | 'lines'): FileRow | undefined => {
  const [first, ...rest] = rows;
  if (!first) return undefined;
  return rest.reduce((w, r) => (r[metric] < w[metric] ? r : w), first);
};

const printTierSummary = (rows: ReadonlyArray<FileRow>): void => {
  console.log('\ncoverage: tier summary (worst funcs / worst lines):');
  for (const tier of COVERAGE_RULES) {
    const inTier = rows.filter((r) => !isSkipped(r.path) && r.path.startsWith(tier.prefix));
    if (inTier.length === 0) {
      console.log(`  ${tier.name.padEnd(12)} (>= ${tier.threshold}%)  no files`);
      continue;
    }
    const worstFuncs = worstBy(inTier, 'funcs');
    const worstLines = worstBy(inTier, 'lines');
    if (!worstFuncs || !worstLines) continue;
    console.log(
      `  ${tier.name.padEnd(12)} (>= ${tier.threshold}%)  funcs: ${worstFuncs.funcs.toFixed(1)}% (${worstFuncs.path})  lines: ${worstLines.lines.toFixed(1)}% (${worstLines.path})`
    );
  }
};

const collectViolations = (rows: ReadonlyArray<FileRow>): ReadonlyArray<Violation> => {
  const violations: Violation[] = [];
  for (const row of rows) {
    if (isSkipped(row.path)) continue;
    const tier = findTier(row.path);
    if (!tier) continue;
    if (row.funcs < tier.threshold) {
      violations.push({ file: row, tier: tier.name, threshold: tier.threshold, metric: 'funcs', actual: row.funcs });
    }
    if (row.lines < tier.threshold) {
      violations.push({ file: row, tier: tier.name, threshold: tier.threshold, metric: 'lines', actual: row.lines });
    }
  }
  return violations;
};

const printViolations = (violations: ReadonlyArray<Violation>): void => {
  console.error('\ncoverage: per-file gate violations:');
  for (const v of violations) {
    console.error(`  ${v.file.path}  [${v.tier}]  ${v.metric}=${v.actual.toFixed(1)}%  required=${v.threshold}%`);
  }
  const word = violations.length === 1 ? 'violation' : 'violations';
  console.error(`\ncoverage: ${violations.length} ${word}. Add tests, or restructure to remove unreachable branches — never lower the threshold.`);
};

const main = async (): Promise<number> => {
  const { status, output } = await runTestsWithCoverage();
  if (status !== 0) {
    console.error('\ncoverage: `bun test --coverage` exited non-zero; fix test failures first.');
    return status;
  }
  const rows = output
    .split('\n')
    .map(parseRow)
    .filter((r): r is FileRow => r !== undefined);
  if (rows.length === 0) {
    console.error('\ncoverage: no file rows parsed from the coverage report. Check that `bun test --coverage` is producing a text table.');
    return 1;
  }
  printTierSummary(rows);
  const violations = collectViolations(rows);
  if (violations.length === 0) {
    console.log('\ncoverage: all files meet their tier gate.');
    return 0;
  }
  printViolations(violations);
  return 1;
};

process.exit(await main());
