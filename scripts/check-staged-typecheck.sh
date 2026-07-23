#!/usr/bin/env bash
#
# Typecheck what is ABOUT TO BE COMMITTED, not what happens to be lying in the working tree.
#
# `bun run typecheck` reads the working tree, so a commit that stages one half of a coupled
# change passes the gate while leaving the commit itself broken. That is not a hypothetical:
# it happened repeatedly on this branch, because the other half was sitting unstaged the
# whole time and tsc kept reading it. A clean checkout of the branch tip did not compile
# while every commit had gone through green.
#
# The staged tree is materialised from the index with `git write-tree` and `git archive`, so
# the working tree is never touched. No stash, nothing to put back if this exits early, and
# nothing to lose if the machine dies mid-hook.
#
# Cost is one extra tsc over a copy of the source, which is cheaper than the mutation gate
# that already runs after it.

set -euo pipefail

if ! git diff --cached --quiet --diff-filter=ACMR -- '*.ts' '*.tsx' 'tsconfig*.json' 'package.json' 2>/dev/null; then
  :
else
  echo "  no staged TypeScript, skipping"
  exit 0
fi

repo=$(pwd)
tree=$(git write-tree)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

git archive "$tree" | tar -x -C "$work"

# Symlinked rather than copied: it is the one directory that dwarfs the source, and nothing
# here writes to it.
ln -s "$repo/node_modules" "$work/node_modules"

cd "$work"
bun run typecheck
