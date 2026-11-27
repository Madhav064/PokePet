#!/usr/bin/env bash
# Adds files to this tag's GitHub release, creating the release if it doesn't exist yet.
# The Windows and Android jobs run at the same time, so either one may get here first.
set -euo pipefail
if gh release upload "$GITHUB_REF_NAME" "$@" --clobber 2>/dev/null; then
  exit 0
fi
if ! gh release create "$GITHUB_REF_NAME" "$@" --title "PokePet $GITHUB_REF_NAME" --notes-file .github/release-notes.md; then
  # The other job created the release a moment ago.
  gh release upload "$GITHUB_REF_NAME" "$@" --clobber
fi
