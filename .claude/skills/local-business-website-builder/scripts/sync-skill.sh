#!/usr/bin/env bash
# sync-skill.sh — install or update the vendored skill in the current client repo from a source copy.
# Usage (from the client repo root):
#   bash path/to/agency-website-skills/skills/local-business-website-builder/scripts/sync-skill.sh \
#        path/to/agency-website-skills/skills/local-business-website-builder [--accept-major] [--dry-run]
# Replaces .claude/skills/local-business-website-builder/ entirely. Never touches site files (pages, src/,
# config, workflows). A MAJOR version change (e.g. 1.x → 2.x) is refused unless --accept-major is passed,
# so no client repo is ever changed silently by an incompatible update.
set -euo pipefail

SRC="${1:-}"
ACCEPT_MAJOR=0; DRY=0
for a in "${@:2}"; do
  case "$a" in --accept-major) ACCEPT_MAJOR=1 ;; --dry-run) DRY=1 ;; *) echo "Unknown option $a" >&2; exit 2 ;; esac
done
if [[ -z "$SRC" || ! -f "$SRC/SKILL.md" ]]; then
  echo "Usage: sync-skill.sh <path-to-source-skill-folder> [--accept-major] [--dry-run]   (folder must contain SKILL.md)" >&2
  exit 2
fi
SRC="$(cd "$SRC" && pwd)"
DEST=".claude/skills/local-business-website-builder"

if [[ "$SRC" == "$(pwd)/$DEST" ]]; then echo "Source and destination are the same folder." >&2; exit 2; fi
if [[ -n "$(git status --porcelain -- "$DEST" 2>/dev/null || true)" ]]; then
  echo "Uncommitted changes in $DEST — commit or discard them first (local skill edits belong in the source repo)." >&2
  exit 1
fi

OLD="none"; [[ -f "$DEST/VERSION" ]] && OLD="$(tr -d '[:space:]' < "$DEST/VERSION")"
NEW="$(tr -d '[:space:]' < "$SRC/VERSION")"
OLD_MAJOR="${OLD%%.*}"; NEW_MAJOR="${NEW%%.*}"

if [[ "$OLD" != "none" && "$OLD_MAJOR" != "$NEW_MAJOR" && "$ACCEPT_MAJOR" != 1 ]]; then
  echo "local-business-website-builder: $OLD → $NEW is a MAJOR update."
  echo "Read the CHANGELOG \"Upgrading client repos\" notes for $NEW, then re-run with --accept-major."
  echo "Nothing was changed."
  exit 3
fi

PROJECT="legacy static (HTML at the repo root)"
if [[ -f astro.config.mjs || -f astro.config.ts || -f astro.config.js ]] || grep -q '"astro"' package.json 2>/dev/null; then PROJECT="Astro"; fi

if [[ "$DRY" == 1 ]]; then echo "Dry run: would update $DEST $OLD → $NEW ($PROJECT project). Nothing changed."; exit 0; fi

mkdir -p "$(dirname "$DEST")"
TMP="$(mktemp -d)"
cp -R "$SRC" "$TMP/skill"
rm -rf "$TMP/skill/.git" "$TMP/skill/node_modules"
rm -rf "$DEST"
mv "$TMP/skill" "$DEST"
rm -rf "$TMP"

echo "local-business-website-builder: $OLD → $NEW  ($PROJECT project)"
if [[ "$OLD" != "$NEW" && -f "$DEST/CHANGELOG.md" ]]; then
  echo "---- CHANGELOG (newest first; read entries above $OLD) ----"
  awk -v old="$OLD" '/^## /{ if (index($0, old)) exit } { print }' "$DEST/CHANGELOG.md" | head -120
fi
echo
if [[ "$PROJECT" == "Astro" ]]; then
  echo "Next: npm run build && node $DEST/scripts/validate.mjs && node $DEST/scripts/check-protection.mjs, review git diff, commit."
else
  echo "Next: node $DEST/scripts/build.mjs && node $DEST/scripts/validate.mjs, review git diff, commit."
  echo "This legacy static site keeps working unchanged. New sites use Astro; migrating this one is a separate, approved project."
fi
