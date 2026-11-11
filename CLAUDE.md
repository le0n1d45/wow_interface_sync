# WoW Interface Sync

Electron + TypeScript app that syncs WoW Forever addon settings through a private
GitHub repo (isomorphic-git, no system git) and publishes a WowUp export string to a gist. See `README.md`.

## Workflow

- When you finish a piece of work, commit and push it automatically without asking first. Run the push as its
  own command, not chained with the commit.
- Before committing run `npm run typecheck` and `npm test`; don't commit with failing checks.
- Add an entry under **Unreleased** in `CHANGELOG.md` for every user-visible change (Added / Changed / Fixed).
  The Release workflow (Actions tab, run by hand) moves those entries under the new version heading and uses
  them as the GitHub release notes, so write them for players, not developers. Internal refactors and tests
  don't need an entry.
- Pushes to `main` run `build.yml` (portable builds for Windows, Linux and macOS, kept 3 days). Releases come
  only from `release.yml`; never bump the version in `package.json` by hand.
- This repo is public: no real character, account or realm names in code, tests or fixtures.
- Track work with Beads (`bd`).
- Tests that need a git server use the system `git` as a fake remote; the app itself never shells out to git.
