# Current run: 22-requirement improvement plan (approved 2026-07-23)

Full plan: `~/.claude/plans/i-will-give-a-precious-dusk.md`. Four phases, slice-per-commit
(≤10 files / ≤300 prod lines, all 8 gates green per commit). No commits or pushes without
Vincent's say-so (rule 25).

## Phase 1 — UI foundation and auth — CODE COMPLETE, NOT COMMITTED

All seven slices are in the working tree, all gates green (1447 tests, lint, typecheck,
coverage, mutation 96.46 on staged shared files), and verified in the built app with
Playwright probes. Commits await Vincent's go-ahead (rule 25); proposed split at the bottom.

1. [x] Primitives + drag fix (R5): IconButton, Popover, Menu, ConfirmDialog, PanelIcon;
       no-drag on SettingsOverlay + MemoryConfirmDialog roots.
       VERIFIED: probe clicked the top 36px strip with Settings open, modal closed. The
       no-drag-on-overlay approach works; the AppFrame suppressDrag fallback was not needed.
2. [x] Office logout + popover overhaul (R3): office:logout channel end to end;
       popoverViewFromStatus / loginErrorMessage / dotLabel in lib/office-health.ts; popover
       rebuilt on Popover.
       VERIFIED: popover reads "Part of your sign-in has expired... Marcel cannot: look up
       colleague details / read your Teams chats", plus the no-full-sign-in reassurance,
       Refresh sign-in + Sign out, no Open settings, dismissed by an outside click. The dot's
       tooltip no longer leaks the CLI's raw reason string.
3. [x] M365 panel status control (R17): Refresh sign-in (force) + Sign out when in, Sign in
       when out, degraded note listing what stopped working, warning-toned status line.
4. [x] Sidebar row menus + centered delete confirm (R12b/c).
       VERIFIED: 3-dots menu shows Rename / Delete, Delete opens the centered dialog naming
       the conversation, Cancel leaves it alone.
5. [x] Sidebar resize/collapse + muted colors (R12d/e).
       VERIFIED: hide empties the column, the band button brings it back at the same width,
       240 default persisted in localStorage. Recents label + idle rows on --color-ink-faint.
6. [x] Sticky conversation header + Crepe font override (R12a, R16).
       VERIFIED: header renders the title with its ... menu; Crepe body now 0.875rem with a
       scaled heading ladder.
7. [x] Quick context + user menu (R2 partial).
       VERIFIED: quick-context.json written once at launch (Vincent DELACOURT, CIO Fashion
       Group Greater China, China Standard Time, 5 ids); sidebar button became "V Vincent"
       with a menu holding Settings; the block rides every system prompt and tells the agent
       not to run my-quick-context again. Memory item joins the menu in Phase 3.

## Phase 1b — R23: data belongs to the account it came from (NEXT)

Requirement (2026-07-23, mid-run): conversations, memory and everything else derived from a
Microsoft 365 account must be stored per account, keyed by the signed-in user's email, so
signing out, signing in as someone else, and coming back restores the first account's world
untouched. Nothing of one account's is ever readable in another's session.

Lands BEFORE Phase 3, because the Mem0 store, the memory page and the global context all
need to know which account they belong to; retrofitting the partition afterwards would mean
migrating a database as well as files.

Design (to confirm while implementing):
- Account key: the signed-in user's id from quick context (immutable), with the email kept
  alongside for display. An email can be reassigned; a directory id cannot. Fall back to a
  reserved key for "nobody signed in yet" so the app works before a first sign-in.
- Per account: conversations/, workspaces/, memory (notes today, the Mem0 db in Phase 3),
  quick-context.json, signature.html, voice-profile.md, the SDK transcript dirs, and the
  defaultModel/last-used-model preference.
- Shared across accounts: providers and their sealed API keys, skills, agents, the office
  policy, the sidebar layout. These are the user's tooling, not their employer's data.
- Migration: on first launch after this change, the existing single-account tree moves under
  the current account's key. One-shot, marker file, never destructive.
- Switching: signing out stops the app reading the old account's data; signing in as someone
  else opens their own (empty on first sight) world. The window reloads its lists on the
  account change rather than mixing two.
1. [ ] paths.ts takes an account key; pure, tested, every derived path under it.
2. [ ] Account service: resolve the current key from quick context, expose it to main,
       notify the renderer when it changes.
3. [ ] Migration of the existing tree, one shot, marker, tested against a fake filesystem.
4. [ ] Stores and services take the key; renderer reloads on account change.
5. [ ] Verify: two accounts, two worlds, switch back and forth, nothing crosses.

## Phase 2 — Agent quality, skills, agents UI

1. [ ] Skill display names (R6): displayName frontmatter + humanize fallback; popover inserts
       FOLDER token. DoD: "/" list shows friendly names; insert matches rewriteSlashSkill.
2. [ ] Titles groundwork (R7): userRenamed flag, slash-stripped interim title,
       title-generation.ts (prompt + sanitizer), setGeneratedTitle.
3. [ ] Title job wiring: conversation-title background job on conversation's model,
       onFirstTurnSaved trigger, {type:'title'} emit; fix stale m365-reader.ts coverage entry.
4. [ ] Turn stats capture (R10b): Message.stats {durationMs,toolCalls,toolErrors}.
5. [ ] Repeat-failure guard + enforcement tests (R8c, R18b): command-failures.ts ring buffer,
       bash-guard deny, runtime recording (guard-denials excluded), hook e2e tests + meta lock.
6. [ ] CLI cheat-sheet (R8a): generator from commands.json → claude-config/cli-cheatsheet.md
       at launch.
7. [ ] Prompt hardening (R8b/d, R9): Grep probe first; core.md Command discipline (numbered) +
       toolset truth; draft skill "Identify and confirm before any work" (numbered, STOP).
8. [ ] Skills pure layer (R13/14): serialiseSkillMd + single-line folding + round-trip tests;
       renderer skill-form.ts, slugify.ts.
9. [ ] Skills persistence (R14): skills:create IPC; skillsPolicy.disabledFolders parse +
       main-side filtering (runtime + suggestions).
10. [ ] Skills UI (R13/14): skill-detail form, built-ins read-only + Active toggle, Add menu
        (scratch/import), Off badge.
11. [ ] Agents overhaul (R15): rename Helpers to Agents, wrapping description, drop
        ToolChecklist, rich Instructions, friendly name to slug.
12. [ ] Command list redesign (R18a/c): single-column details accordion; meta split display
        (Local files / Search / Account), policyName stays meta.
13. [ ] Tool labels + stats display (R22, R10-UI): displayToolName ask-marcel-office to
        "Ask Marcel Command"; formatTurnStats faint line.

## Phase 3 — Memory and context

1. [ ] Deps + rebuild: mem0ai, better-sqlite3, zod, @electron/rebuild, trustedDependencies,
       rebuild:native script, README.
2. [ ] Spike: pin Mem0 config/API via electron-as-node scratch; exit = add, restart, search,
       history round-trip config. Decide built-in store vs hand-rolled sqlite vector table.
3. [ ] MemoryStore port + fake (shared, 100%).
4. [ ] Settings.memory schema (OpenAI-compatible provider required).
5. [ ] Mem0 adapter: mem0-config.ts (pure), mem0-store.ts (FromApi seam), mem0-io.ts (only
       native importer, lazy, Result), wiring, coverage entry.
6. [ ] CRUD service + IPC: memory:list/add/update/delete/clearAll/history + preload.
7. [ ] MCP tools + preamble (R20): memory-tools-core.ts, memory-mcp.ts (marcel-memory server),
       runtime mcpServers, core.md "Your memory".
8. [ ] Global context + injection switch (R1): agent-files 'global-context', context-blocks.ts,
       glossary to contextBlocks, core.md edit, About-you settings field.
9. [ ] Extraction accept writes to Mem0 + migration (source tags, marker, dedupe).
10. [ ] Removal map: delete memory-glossary.ts (+tests, needs Vincent's rule-24 sign-off);
        hold memory:read/write + note files one release.
11. [ ] Memory page UI + user-menu Memory item; "What it remembers" leaves Settings.
12. [ ] Eval harness scripts/eval-memory.ts (manual rule-32 gate).

## Phase 4 — Ops, branding, packaging, update

1. [ ] File logger (R11a): log-line.ts + file-logger.ts (5MB, one rotation, silent-on-error);
       inject runner/runtime/office. No PII: events, ids, kinds, counts only; 200-char clamp.
2. [ ] Transcript retention (R11b): sdkProjectDirName + transcript-sweep.ts + launch sweep;
       remove() also rms transcript dir. Live conversations never age-capped.
3. [ ] Icon pipeline (R4): resources/icons/logo.svg + scripts/make-icons.sh (sips/iconutil) to
       build/icon.icns + 512 PNG + renderer asset.
4. [ ] electron-builder (R21a): electron-builder.yml (x64, unsigned, asar:false,
       extraResources incl. python), dist scripts, README packaging section.
5. [ ] Update check + version (R21c/d): update-check.ts + update-checker.ts (10s deadline,
       24h, cache, silent degrade), update:status IPC, banner + settings version line.

## Verification

Per slice: bun test, lint:strict, typecheck, coverage, mutate:staged (rm
reports/stryker-incremental.json first). Per phase: run-studio scenarios + manual checklist in
the full plan.

## Carried over from the previous run (still open)

- [ ] The `\&` escaping returns on every save through the rich editor (Milkdown serialiser).
- [ ] flash-lite omits the Sources footer on note-only answers. Pre-existing.
- [ ] No CI, deliberate. The staged-tree hook is the only gate.
- [ ] Optional: shell-guard hardening, README line for run-studio, jq vendoring for Windows.
