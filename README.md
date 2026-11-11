# WoW Interface Sync

Keeps your **WoW Forever** addon setup in sync across computers:

- Your **addon settings** (`SavedVariables`, plus which addons are enabled per character) go to a **private GitHub repo**.
- A **WowUp export string** of your installed addons is written to a **gist**, so a new machine can import its addon list in WowUp.

Game settings are deliberately **not** synced: graphics and options (`Config.wtf`, `config-cache.wtf`), key bindings, caches, and the Edit Mode layouts, which WoW Forever already syncs for you.

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

- Before a pull changes anything, the files that would change are **backed up**. You can also press **Back up now** on the Backups screen at any time, even with WoW open.
- Backups on your computer are **never deleted automatically**; each has a Delete button.
- Each backup is also saved to your repo under `backups/<this computer>/`, and the repo keeps the newest 20 per computer (turn this off in Settings).
- A pull only adds or overwrites. It **never deletes** local files.
- If a pull fails midway it rolls itself back.
- **Settings > Delete all data in the sync repo** empties the repo for a fresh start (after an "Are you sure?" prompt). It is one normal commit, so GitHub's history can still recover the old versions.
- Pick any backup under **Backups** and press *Restore*, or press **Undo** right after a pull. Restoring is itself backed up, so it can be undone.

## Downloading addons on pull (optional)

Off by default. In Settings, tick *Download missing addons when I pull* and paste a CurseForge API key (free at [console.curseforge.com](https://console.curseforge.com)). On every pull the app reads the addon list from your gist and downloads the ones missing from `Interface/AddOns`, so WowUp finds them on its next rescan. Existing addon folders are never overwritten. Only CurseForge addons are supported; others, and addons whose authors block downloads from other apps, are listed so you can install them in WowUp.

## WowUp export string

On the Sync screen, **Copy WowUp import string** copies the list to your clipboard so you can paste it into WowUp (My Addons > Import), for example on a new computer.

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

## License

[MIT](LICENSE)
