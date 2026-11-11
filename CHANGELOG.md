# Changelog

All notable changes to WoW Interface Sync are recorded here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add an entry under **Unreleased** with every
user-visible change; the release workflow moves those entries under the new version heading and uses them
as the GitHub release notes, so keep them readable.

## [Unreleased]

## [0.2.0] - 2026-11-11

### Added
- **Delete all data in the sync repo** in Settings, for a fresh start. It asks "Are you sure?" first, then removes every file (your synced settings and uploaded backups) from the repo in one commit. GitHub's history keeps the older versions, so it can be recovered from there. Nothing on your computer is touched.

### Changed
- Edit Mode layouts are no longer synced, because WoW Forever already syncs them itself. Only addon settings (and which addons are enabled on each character) are synced now. Layouts already in your repo are left alone and ignored.

## [0.1.0] - 2026-11-11

### Added
- First version. Keeps your WoW Forever Edit Mode layouts and addon settings in a private GitHub repo, so every computer you play on can share them. **Push** sends this computer's settings; **Pull** applies the saved ones here. Game and graphics settings, key bindings and caches are never synced.
- Your WowUp addon list is written to a gist as an export string each time you push, so a new computer can import its addons in WowUp. The app reads WowUp's own data, so there is nothing to copy and paste.
- Every pull backs up the files it would change first, and rolls itself back if it fails partway. Restore any backup from the **Backups** screen, or press **Undo** right after a pull. Pulls never delete your files.
- **Back up now** saves a copy of all your synced settings at any time, even with WoW open. Every backup has a Delete button; nothing on your computer is deleted automatically.
- Backups are also saved to your repo, in a folder for each computer (`backups/<computer>/`), and the repo keeps the newest 20 for each. This can be turned off in Settings.
- The GitHub token is checked when you enter it (classic token, `repo` and `gist` scopes, push access, private repo, your own gist) and stored encrypted by your operating system. No other software needs to be installed, and nothing is stored in plain text where the system has a keyring.
- Syncing is blocked while WoW is running, so the game can't overwrite files mid-sync.
- Portable builds for Windows (`.exe`), Linux (AppImage) and macOS (zip). They are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on first launch.
