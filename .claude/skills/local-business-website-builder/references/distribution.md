# Distribution, Versioning & Maintenance

## Model: one source repo, vendored copies

- **Source of truth**: the private agency repo `dotcommatrix360/agency-website-skills`, folder `skills/local-business-website-builder/`.
- **Each client repo** commits its own copy at `.claude/skills/local-business-website-builder/`. Why vendored:
  - Works in every Claude Code surface, including cloud sessions (they load committed project skills, not `~/.claude/skills`).
  - CI and the Deploy production workflow run the same QA scripts from that copy.
  - Each client is pinned to a known version; an update can't silently change an old site's build.
  - Never published: Astro only uploads `dist/`; legacy repos hide `/.claude/` on both hosts.
- **Optional**: also install in `~/.claude/skills/` for brand-new empty folders before the first commit (personal skills take precedence over project skills with the same name — remove the personal copy if you need a client's pinned version).

## Versioning

SemVer in `VERSION` and `metadata.version` in `SKILL.md`:
- PATCH: wording, script bug fixes, new warnings.
- MINOR: new features/options/references; backward compatible with existing client repos.
- MAJOR: changes that need migration or change the default stack (2.0.0: Astro becomes mandatory for new sites). Document the upgrade steps in `CHANGELOG.md` under "Upgrading client repos".

## Starting a new client site

```bash
mkdir client-site && cd client-site && git init -b main
bash ../agency-website-skills/skills/local-business-website-builder/scripts/sync-skill.sh ../agency-website-skills/skills/local-business-website-builder
node .claude/skills/local-business-website-builder/scripts/init.mjs     # Astro starter, never overwrites
npm install && npm run build
git add -A && git commit -m "Scaffold site from the agency Astro starter (skill vX.Y.Z)"
```

## Updating a client repo

```bash
# from the client repo root, with agency-website-skills cloned next to it
bash ../agency-website-skills/skills/local-business-website-builder/scripts/sync-skill.sh ../agency-website-skills/skills/local-business-website-builder [--dry-run]
```

`sync-skill.sh` replaces only the vendored skill folder (never pages, `src/`, config or workflows), refuses when that
folder has local edits, prints old → new version and the CHANGELOG entries in between, and **refuses a MAJOR jump
(e.g. 1.x → 2.x) unless `--accept-major` is passed** — so no client repo changes silently. Then:

- Astro repo: `npm run build && node $S/validate.mjs && node $S/check-protection.mjs`
- Legacy static repo: `node $S/build.mjs && node $S/validate.mjs` — `build.mjs --check` should report 0 changed files

Review `git diff`, commit `Update local-business-website-builder skill to vX.Y.Z`.

Starter templates (`templates/astro`, `templates/static`) are only copied by `init.mjs`, so updating the skill never
changes a client's pages, components, config or workflows. Starter improvements reach existing Astro sites only when
someone ports them deliberately (`init.mjs --only <path>` copies missing files without overwriting).

### Rolling out 2.0.0

- **Existing legacy HTML repos**: update opportunistically with `--accept-major`. Nothing in the site changes; scripts detect the legacy layout and behave as before. New in 2.0: near-duplicate/thin-content **warnings** (not blocking on legacy sites) — useful findings for a later migration.
- **New sites**: Astro starter only.
- **Migrating a legacy site to Astro**: a separate, owner-approved project (`references/migrations.md`, "HTML → Astro").
- Don't mass-update hundreds of repos; for urgent fixes, script the sync across a list of repos and review each diff.

## Improving the skill

1. Change it in `agency-website-skills` (directly on `main` per agency practice, or a short-lived branch if the change needs review); bump `VERSION` + `SKILL.md` metadata; add a CHANGELOG entry.
2. Test: `node scripts/selftest.mjs` — legacy steps on the bundled `examples/sample-site/`, then `selftest-astro.mjs` (starter scaffold, real `npm install`, `astro build`, `dist/` QA, protection, redirects, deploy-workflow rules, local hosts) on `examples/astro-sample/`. Network is needed for `npm install` (or set `LBWB_NODE_MODULES` to reuse one).
3. Try it on one real client repo; merge; tag `vX.Y.Z`.
4. Keep `SKILL.md` short (< 200 lines). New detail goes in `references/`; new automation in `scripts/`; starter changes in `templates/astro/` with a matching selftest step.
5. When a client-specific rule appears, put it in that client's `CLAUDE.md`, not the shared skill.
6. Bump pinned versions (Astro, sharp, wrangler, actions) deliberately: update `templates/astro/package.json` / workflows, run the selftest, note it in the CHANGELOG.
