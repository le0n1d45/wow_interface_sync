# WoW Interface Sync

Keeps your **WoW Forever** UI setup in sync across computers:

- **Edit Mode layouts** (the built-in UI editor) and **addon settings** (`SavedVariables`) go to a **private GitHub repo**.
- A **WowUp export string** of your installed addons is written to a **gist**, so a new machine can import its addon list in WowUp.

Game and graphics settings (`Config.wtf`, `config-cache.wtf`, key bindings, caches) are deliberately **not** synced.

## Set up (once per computer)

1. Create a **private** GitHub repo (empty is fine) and a **gist** (any content). Note the gist ID from its URL.
2. Create a **classic** personal access token with the `repo` and `gist` scopes. Fine-grained tokens cannot write gists.
3. Run the app and fill in **Settings**: repo URL, gist ID, WoW folder (use *Detect*), and the token. The token is checked against GitHub and stored encrypted with your OS (Windows DPAPI, macOS Keychain, Linux keyring).
4. If your WoW *account folder name* differs between computers (`WTF/Account/<name>`), add a mapping line such as `MYACCOUNT=shared`, using the same shared name on every computer.

## Use

- **Push to GitHub**: sends changed files and refreshes the WowUp export string.
- **Pull from GitHub**: applies the repo's files to this computer.
- Close WoW first. The game rewrites these files when you log out, and the app refuses to sync while it is running.

## Safety

- Before a pull changes anything, the files that would change are **backed up** (the newest 10 backups are kept).
- A pull only adds or overwrites. It **never deletes** local files.
- If a pull fails midway it rolls itself back.
- Pick any backup under **Backups** and press *Restore this backup*, or press **Undo** right after a pull. Restoring is itself backed up, so it can be undone.

## WowUp export string

The app reads WowUp's own data folder (`addons.json` and `preferences.json`) and builds the same string WowUp's *Export* produces. In WowUp, import it from the gist's `wowup-forever.txt`. Only addons that WowUp tracks with a provider ID, and that are not ignored, are included. If WowUp's data folder is not found, the file sync still works and the export is skipped.

A GitHub "secret" gist is unlisted, not access-controlled: anyone with the link can read it. The string holds addon names and IDs only.

## Develop

```
npm install
npm run dev        # run with hot reload
npm test           # unit + end-to-end sync tests (some use the system git as a test-only fake server)
npm run package    # build a portable app for this platform into dist/
```

GitHub Actions builds portable apps for Windows (`.exe`), Linux (AppImage) and macOS (zip) on every push to `main`. Artifacts are kept for 3 days. Builds are unsigned, so Windows SmartScreen and macOS Gatekeeper will warn on first launch.
