# PLAN: Ask Marcel Studio M9 (builtin M365 knowledge pack: core memory + 2 skills + reader agent)

Status: decision record approved via grill-me 2026-07-20, user said "go until all
finished" (model Opus 4.8, ultracode). CODE + CONTENT + DOCS COMPLETE, all gates green
(typecheck, 485 tests, lint, coverage), adversarial 4-lens review applied,
atelier-review-me clean (one rule-17 finding fixed). NOT COMMITTED (awaiting user yes).
Only step 11 (live-app smoke set + the append/agents live check) remains, gated on the
running dev app with a key. Source material: the battle-tested
plugin playbook at `~/Downloads/try-plugin-ask-marcel/ask-marcel/SKILL.md` (verified
against office CLI v2.2.0), the current builtin skill
`resources/builtin-skills/ask-marcel-office/SKILL.md`, and the plugin corpus
(EXAMPLES/FLOW/README/recipe + eval-findings + eval-findings-followup + bug-report +
open-items) digested by the understand-ask-marcel-corpus workflow 2026-07-20.
M8 closed; its still-gated live checks are carried in "Gated on the user".

## DEVIATION taken 2026-07-20 (carrier): append, not CLAUDE.md

SDK 0.3.185 `sdk.d.ts:1820` states "Must include `'project'` to load CLAUDE.md files";
the agent runs `settingSources: ['user']`, so a seeded `claude-config/CLAUDE.md` would
NOT load. This is exactly what step-1 probe existed to catch — caught by source
inspection instead of a live turn. Fallback taken (named in the original plan): the core
ships via `systemPrompt: { type: 'preset', preset: 'claude_code', append: <core text> }`
(`sdk.d.ts:1881`, wired in bridge.mjs). Decision 1's INTENT (always-on compact core) is
unchanged; only the carrier moved from a seeded file to a code-passed append. This
SIMPLIFIES the seeder (no CLAUDE.md seeding, only old-folder retirement) and removes
`claudeMdPath` from the plan. `agents` option likewise confirmed in bridge.mjs; live
invocation of both stays gated (step 11).

## CORPUS HARDENING (newest-wins resolution 2026-07-20)

- eval-findings-followup SUPERSEDES eval-findings: signature is now self-contained
  base64 `data:` URIs (do NOT strip, no `cid:`), the reply `<hr>` splice is fixed
  (comment leads), the headless-hang is fixed (basic token fails fast with
  `not_authenticated`). Use the followup state.
- NEW gotcha to bake in (bug-report): `--output-path` is NOT universal — it works only
  on body-producing commands; `list-*`, `get-*-user`, `get-organization`,
  `search-all-files` REJECT it. Capture their large output with a shell redirect
  `> out.json`, never `--output-path`. Ignore the sizeHint banner's "works on every
  command" claim.
- Elevated (people) token is `refresh: interactive`, cannot refresh headlessly →
  preflight `scopes-check` for people lookups, and on failure tell the user to click
  Login in Settings (our app's sanctioned path; never run `login` from the agent).
- Exact-phrase quoting inside `--query` DOES work (current SKILL.md + eval-findings
  confirm); the recipe's "never quote" is the stale/superseded source — ignore it.
- Drafts dedup: the `conversationId` `$filter` is unreliable (not read-your-writes
  consistent + reply/forward drafts split across conversationIds). Use `find-mail-drafts`
  / the thread listing's `isDraft` flag, match client-side on subject+recipients.

## Goal

Replace the single builtin skill with a carved knowledge pack so the agent answers most
M365 questions well out of the box:

- an always-on compact core seeded to `<userData>/claude-config/CLAUDE.md`,
- two on-demand skills split by trigger: `answer-from-m365` (read path) and
  `draft-outlook-email` (write path),
- one programmatic heavy-reader subagent (`m365-reader`) via the SDK `agents` option.

Studio owns these forks; every artifact carries a "Verified against ask-marcel-office
vX.Y.Z" footer and is re-verified on CLI bumps. The plugin repo keeps its own monolith.

## Decisions (grilled 2026-07-20, to be appended to LESSONS at step 12)

1. Compact always-on core (~60-90 lines) in claude-config/CLAUDE.md, seeded like skills:
   M365 is the product, auth doctrine must hold even on turns where no skill fires.
2. Skills split by TRIGGER, not by source: read-path sections co-fire on real questions
   (search mail + files + people, consolidate), so a by-source split multiplies trigger
   rolls without saving tokens. Draft has disjoint triggers and safety rules.
3. One heavy-reader subagent, programmatic (versioned, typed, no seeding/drift); email
   threads stay main-loop so leads keep flowing; fat attachments go to the reader by ids.
4. No references/ layering: with heavy mechanics in the reader prompt, both skill bodies
   fit single files.
5. Existing builtin skill dissolves into core + answer skill; folder retired by seeder.
6. No doc compiler between plugin and studio until fork drift has bitten twice (YAGNI).

## Verified (do not guess)

- agent-runtime.ts:81-82 runs `systemPrompt: {preset: 'claude_code'}` +
  `settingSources: ['user']`; session-env.ts:66 sets CLAUDE_CONFIG_DIR to
  `<userData>/claude-config`. User memory therefore resolves to claude-config/CLAUDE.md.
  Live loading is UNPROBED → step 1 before anything else.
- SDK 0.3.185 `sdk.d.ts` declares `agents?: Record<string, AgentDefinition>`
  ({description, prompt, tools?, model?, skills?, maxTurns?}), invoked via the Agent
  tool. Live behavior under the claude_code preset UNPROBED → step 2.
- skills-service.ts seedBuiltins(): `cp force:true` per BUILTIN_SKILLS name;
  index.ts:82 `BUILTIN_SKILLS = ['ask-marcel-office']`, index.ts:185 fire-and-forget at
  launch. NO retirement path exists: renaming builtins strands the old folder in
  userData as a removable, still-loading skill → step 4 adds retirement.
- skill-name.ts SAFE_FOLDER accepts `answer-from-m365` and `draft-outlook-email`.
- No electron-builder config exists yet (M6 blocked): builtinSkillsSource() already
  splits dev/packaged (index.ts:80); the packaged path for BOTH builtin-skills and the
  new resources/claude-config ships at M6 (addendum, step 12).
- Existing builtin skill (89 lines) = never-login doctrine, probe-first, discovery
  ladder, output rules, call-shape gotchas, read-only-plus-drafts framing. All of it
  survives, redistributed: doctrine/probe/ladder/output → core; gotchas → answer skill.
- fresh SDK process per turn (R7) means seeded files apply on the NEXT message; no
  hot-reload work needed anywhere in this plan.

## Placement (coverage tiers)

- `src/main/services/skills/skills-service.ts` (BUN_TESTABLE_MAIN, 80%): deps grow
  `retiredBuiltinNames: readonly string[]`; seedBuiltins also rm's each retired folder;
  skills-service.test.ts extended (SIGN-OFF: +3 cases + update the one construction).
- `src/main/services/agent/m365-reader.ts`: NEW pure module — const AgentDefinition
  ({description, prompt, tools}), `import type` only so no runtime electron/SDK import;
  m365-reader.test.ts shape test (SIGN-OFF, new file); added to BUN_TESTABLE_MAIN (80%)
  and the coverage preload (regenerate).
- `src/main/services/agent/agent-runtime.ts`: +`corePrompt` dep, systemPrompt append,
  `agents: { 'm365-reader': m365Reader }`. Thin-IO tier (skipped, typecheck-gated).
- `src/main/index.ts` (entry point, skipped): `agentCoreSource()` dev/packaged split +
  read core.md into a string, pass as `corePrompt`; BUILTIN_SKILLS→two new names;
  `retiredBuiltinNames: ['ask-marcel-office']`.
- Content artifacts (no unit tests, smoke-verified at step 11, footer-stamped v2.2.0):
  `resources/agent-core/core.md` (passed via append),
  `resources/builtin-skills/answer-from-m365/SKILL.md`,
  `resources/builtin-skills/draft-outlook-email/SKILL.md`,
  and the m365-reader prompt (lives in m365-reader.ts).

## Steps

Phase A — mechanism probes (RESOLVED by source inspection; live turns still gated)

1. [x] CLAUDE.md carrier: RESOLVED via sdk.d.ts:1820 — `['user']` does not load
       CLAUDE.md; switched to `systemPrompt append` (see DEVIATION). No live probe
       needed for the carrier choice.
2. [~] agents-option: type + bridge.mjs confirm the option is wired; LIVE invocation
       under the claude_code preset stays gated (folded into step 11 smoke set).

Phase B — code (TDD per slice)

3. [x] (dropped) no `claudeMdPath` — append carrier needs no CLAUDE.md path.
4. [x] skills-service: deps grew `retiredBuiltinNames`; seedBuiltins rm's each retired
       folder (force:true, ENOENT-safe) before seeding new builtins. 3 new tests +
       updated the one construction. DoD MET: 18/18 skills tests green, service 100%
       funcs / 95% lines.
5. [x] m365-reader.ts pure module (const + `import type` AgentDefinition) + 4-case shape
       test + BUN_TESTABLE_MAIN entry. (Coverage-preload regen N/A: SCAN_DIRS
       src/infra|composition|presenter do not exist here; the test imports it so it
       appears in the table.) DoD MET: 100%/100%.
6. [x] agent-runtime.ts: `corePrompt` dep, `systemPrompt: {preset, append: corePrompt}`,
       `agents: { 'm365-reader': m365Reader }`. index.ts: agentCoreSource split +
       readAgentCore (extracted to agent-core-io.ts per review, rule-17 try/catch
       quarantine); BUILTIN_SKILLS = the two new; retiredBuiltinNames =
       ['ask-marcel-office']. DoD MET: typecheck + lint green. Dev-relaunch panel check
       is the live-app gate (step 11).

Phase C — content (the bulk of the work; each artifact footer-stamped
"Verified against ask-marcel-office v2.2.0", re-verify on CLI bump)

7. [x] Core `resources/agent-core/core.md` (~90 lines): CLI nature + scope; never-login /
       Settings doctrine + elevated-token note; my-quick-context once per session; ground
       rules (newest wins, UTC→tenantTimeZone, parallel, answer-not-log, cite, the NEW
       `--output-path` body-only + `>` redirect rule); discovery ladder = `help-json
       --terse [--category]` + `docs <cmd>` (help-json RESTORED after a live run: the CLI
       itself hints it; it is a CLI meta-command absent from the MCP list-commands
       manifest, which is why the pre-land check wrongly flagged it); routing table →
       skill; delegation to m365-reader;
       explicit "cannot send/schedule/change" fallback; Sources footer + web=1.
8. [x] answer-from-m365 SKILL.md (~150 lines, single-line description). Covers all listed
       items; exact-phrase quoting kept (recipe's "never quote" is superseded). DoD MET:
       parses via app parser + js-yaml (820 chars). trigger-rich description adapted from
       the plugin's; search query rules (KQL, exact phrases, narrowing, ~5k silent
       truncation); read-an-email-in-full (thread listing with isDraft, convert
       --keep-quoted true, inline-image placeholders + get-mail-attachment for
       content-bearing ones, attachment converts by size/type, zip converter,
       extract-sharepoint-links); read-a-document-in-full (two-id pitfall diagram,
       resolve-drive-share-link + foreign tenant, per-type command table, Excel
       sheet-by-sheet with --full, workbook metadata pass, formula-error recompute,
       count-with-a-script rule, scrambled-conversion → PDF fallback); people pitfalls
       (GUID vs external contact, elevated token, stale directory fields, matrix
       reporting lines); call-shape gotchas from the old builtin (strict ISO Z dates,
       well-known folder names, unreliable isRead filters, microsoft-search-query
       KQL-only, substrate tokens); delegation rule → m365-reader (what qualifies:
       many-sheet workbook, long deck, zip of scans; pass ids + return contract; read
       small things inline); 4-round search stop; answer shape + Sources footer.
9. [x] draft-outlook-email SKILL.md (~130 lines, single-line description, 677 chars).
       All items covered; the <hr>-ordering fixed per review (comment leads, then
       divider, then quote — the followup-superseded state), draft trigger verb changed
       from "answer" to "drafting a reply" to stay disjoint from the read skill. DoD MET:
       parses via app parser + js-yaml. description (reply / forward / new
       mail / "draft" triggers, NEVER sends); approval doctrine (dictated vs composed,
       show body BEFORE create); draft-to-the-right-person (ownership read, no
       unverified reporting-line claims); reply-to-NEWEST message with its own 6-line
       thread-listing snippet (accepted duplication, decision 2); voice study from sent
       items (from:me filter caveats, skip auto-responses by @odata.type, once per
       session); recipient's language; HTML font + margin-0cm + <div><br></div> idiom;
       create-reply-draft / create-forward-draft / create-mail-draft flags;
       signature (get-mail-signature once with --output-path, blind concat, desktop
       data:-image caveat); revise-never-recreate (isDraft in thread listing,
       find-mail-drafts fallback, --comment vs --body-content semantics, hr divider,
       id churn after edits → re-fetch on ErrorItemNotFound); verify render via
       convert-mail-to-markdown --output-path + grep markers; webLink handover +
       Sources footer when substance was searched.
10. [x] m365-reader prompt written directly into m365-reader.ts (no placeholder step).
        input contract
       (driveId/itemId or messageId/attachmentId, the question to answer); the heavy
       read mechanics lifted from the plugin (markdown conversion with
       --include-metadata, image extraction + Read, chart images, sheet-by-sheet Excel
       with --full, zip triage incl. scanned-PDF pages via Read, formula-error
       recompute, count-with-a-script); return contract (structure, key figures with
       page/sheet/cell locations, short pinpoint quotes, anomalies, leads found:
       linked docs / names / referenced items); hard limits (read-only, no drafts, no
       login, report inaccessible items instead of retrying).

Phase D — verify + docs

11. [~] GATED ON THE USER (live dev app + a key). Smoke set (plugin EXAMPLES.md): inbox
        catch-up, calendar week (local tz correct), what's-on-my-plate, who's-who,
        draft-the-reply-you-owe (composed body shown for approval BEFORE the draft
        exists, webLink handed over), plus one heavy artifact (many-sheet xlsx or long
        deck) that must route through m365-reader. Also verifies the append core loads
        and the agents option spawns m365-reader (step 2). DoD: 6/6 behave, right skill
        invoked each time, Sources footers present; record the trivial-turn core token
        overhead in LESSONS.
12. [x] Docs done: docs/PLAN.md supersede markers on the two lines; README skills
        paragraph rewritten to the pack; 3 durable lessons appended to .claude/LESSONS.md
        (append-carrier gotcha, single-line-description gotcha, the pack decision).
        Still open: the M6 extraResources addendum must ship `resources/agent-core` AND
        `resources/builtin-skills` (both dev/packaged split via app.isPackaged) — carried
        to the M6 packaging work, which stays blocked on Apple Silicon.

## Risks

- CLAUDE.md may not load as user memory in 0.3.185 → probed FIRST (step 1); fallback
  `systemPrompt append` keeps content identical, changes only the carrier.
- Skill descriptions could overlap and misroute → disjoint trigger lists reviewed at
  step 8/9, exercised at step 11.
- Weak OpenAI-compatible models may never invoke skills → the core alone still routes
  basics; accepted residual, same class as R8 doctrine-not-enforcement.
- Existing installs keep a stale ask-marcel-office folder → retirement rm (step 4),
  with a test that user-added skills are never touched.
- Core token creep on every turn → hard cap 90 lines, measured cost recorded (step 11).
- Packaged resources path for claude-config unverifiable until M6 hardware → standing
  gap, documented in the M6 addendum.

## Gated on the user

- Steps 1, 2, 11 need the running dev app with a configured key (M2-class gap): user
  drives or starts the HMR session.
- Carried from M8: office login e2e from signed-out, M6 arm64 DMG, M7 visual pass,
  in-app live agent turns for node/python shims.

## Discipline

TDD per slice; every NEW test and every touched existing test file proposed for
SIGN-OFF before writing (rule 24): paths.test.ts (+1 case), skills-service.test.ts
(+3 cases), m365-reader shape test (new file). Commit per green slice through the real
hook, only on the user's yes (rule 25), ≤10 files / ≤300 lines. `bun run mutate:changed`
before staging the paths.ts slice. Content .md artifacts carry no unit tests: they are
smoke-verified (step 11) and version-stamped against the CLI.
