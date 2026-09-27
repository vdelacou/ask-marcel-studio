#!/usr/bin/env bash
#
# atelier identity gate — rule 26: no tracked file names a person, an employer
# or a client (commit metadata is exempt).
#
# The other gates never looked for identities. Gate "gitleaks protect --staged"
# matches secret SHAPES (keys, tokens), not names; coverage, mutation, lint and
# typecheck read structure, not meaning. So a real name, a work email, or a
# client's name pasted into a test fixture sailed through every check — which is
# exactly how this repo accumulated them before the big scrub.
#
# This gate closes that gap: it refuses a commit whose STAGED tree contains a
# term from the denylist below. It is deliberately a fixed denylist, not a
# general "person name" detector — a heuristic that guessed at names would fire
# on ordinary words, and a gate that cries wolf gets bypassed and rots. When a
# new leak is ever found, add the offending term here.
#
# Bypass with `git commit --no-verify` only for a genuine exception, and say why
# in the commit body. Do not normalise bypassing.

set -euo pipefail

# Distinctive terms. Word-bounded where a bare substring hides in ordinary
# English (e.g. "fendi" lives inside "offending", "dior" could inside a word).
patterns=(
  'lvmh'
  'adama-development'
  '\bvincent\b'
  '\bdelacourt\b'
  '\bceline\b'
  '\bfendi\b'
  '\bdior\b'
  '\bloewe\b'
  '\bgivenchy\b'
  '\bkenzo\b'
  '\bguerlain\b'
  '\bbulgari\b'
  '\bbvlgari\b'
  '\bsephora\b'
  '\bmoet\b'
  '\bhennessy\b'
)

IFS='|'; re="${patterns[*]}"; unset IFS

# git grep over the STAGED tree (the index). -I skips binary blobs, -i is
# case-insensitive, -n prints line numbers. This script names every banned term,
# so it excludes itself. git grep exits 0 when it finds a match.
if matches=$(git grep -Iin -E --cached "$re" -- . ':(exclude)scripts/check-identity.sh' 2>/dev/null); then
  cat >&2 <<EOF
  ╳ IDENTITY GATE: staged content names a person, employer or client (rule 26)

$(printf '%s\n' "$matches" | sed 's/^/      /')

  Replace the identifier with a neutral synthetic value (see .claude/LESSONS.md).
  A genuine exception: 'git commit --no-verify', justified in the commit body.
EOF
  exit 1
fi

echo "  identity: no banned identifiers in staged tree"
exit 0
