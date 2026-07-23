#!/usr/bin/env bash
#
# Block commits exceeding 10 files OR 300 lines (insertions + deletions).
#
# Why these thresholds: small commits are easier to review, revert, and
# bisect. Large commits hide bugs (one slip across 300 lines is hard to
# spot). Every commit on `main` becomes git history that the next engineer
# reads — keep each one a coherent slice.
#
# The thresholds are conservative because they force the discipline.
# Loosening them undermines the rule. Bypass with `git commit --no-verify`
# only for genuine big-bang changes (initial scaffolds, mass-renames,
# generated files); justify every bypass in the commit body.
#
# TESTS ARE NOT COUNTED against the line cap, only against the file cap.
# The cap is there to keep a reviewer's eyes on a slice of PRODUCTION change;
# a thorough test file is the thing this standard wants most, and counting it
# taxes exactly the behaviour it is trying to buy. Measured, not assumed: the
# only two bypasses this repo has ever needed were a module plus its tests at
# 304 lines, and a module's first test file at 369. Both were the tests.
#
# See skills/atelier/references/workflow.md (Commit size limits).

set -euo pipefail

MAX_FILES=10
MAX_LINES=300

files=$(git diff --cached --name-only --diff-filter=ACMR | grep -c '^' || true)
lines=$(git diff --cached --numstat | awk '$3 !~ /\.(test|spec)\.(ts|tsx)$/ { sum += $1 + $2 } END { print sum + 0 }')

if [ "${files:-0}" -le "$MAX_FILES" ] && [ "${lines:-0}" -le "$MAX_LINES" ]; then
  exit 0
fi

cat <<EOF >&2
  ╳ COMMIT TOO BIG
  Files staged:  ${files}  (max ${MAX_FILES})
  Lines staged:  ${lines} (max ${MAX_LINES}, insertions + deletions, tests not counted)
  Bypass: git commit --no-verify
EOF
exit 1
