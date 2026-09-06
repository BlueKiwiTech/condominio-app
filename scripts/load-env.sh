#!/usr/bin/env bash
# Usage (from the project root): source scripts/load-env.sh
#
# Exports every variable in .env into your CURRENT shell session. Must be
# SOURCED, not executed -- a script run normally (./scripts/load-env.sh) only
# sets env vars in its own subprocess, which disappears the instant the
# script exits; sourcing runs it inside your actual shell instead, so the
# exports stick around afterward (e.g. for `vercel env pull`, `psql`, or any
# one-off script -- like scripts/seed-admin.mjs -- that reads process.env
# directly rather than loading --env-file itself).

# Best-effort "did you forget to source this?" warning -- works for both
# bash ($0 stays the shell's own name when sourced, unlike BASH_SOURCE[0])
# and zsh (ZSH_EVAL_CONTEXT ends in ":file" only when sourced).
sourced=0
if [ -n "$ZSH_VERSION" ]; then
  case $ZSH_EVAL_CONTEXT in *:file) sourced=1 ;; esac
elif [ -n "$BASH_VERSION" ]; then
  [ "$0" != "${BASH_SOURCE[0]}" ] && sourced=1
fi
if [ "$sourced" -eq 0 ]; then
  echo "load-env.sh: run this with 'source scripts/load-env.sh' (or '. scripts/load-env.sh')." >&2
  echo "Running it directly only sets env vars in a throwaway subshell -- your terminal won't see them." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "load-env.sh: no .env found in $(pwd) -- run this from the project root." >&2
  return 1
fi

set -a
source .env
set +a

echo "Loaded $(grep -c '^[A-Za-z_][A-Za-z0-9_]*=' .env) variable(s) from .env into this shell."
