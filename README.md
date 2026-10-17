# Rocket Launcher

A lightweight Windows game launcher that puts every installed game in one library, whichever store or launcher it came from. It tracks your playtime, fetches artwork, and keeps a personal stats dashboard across all your games.

## Features

- **One library.** Finds installed games from Steam, Epic Games, the EA app, Battle.net and the Xbox app / Game Pass, plus any folder of games (every drive's `\Games` folder is scanned automatically) and single `.exe` files you add yourself.
- **One-click launching.** Each game starts through its own launcher, so DRM, cloud saves and overlays keep working.
- **Artwork.** Covers, hero banners, logos and icons, with alternatives from [SteamGridDB](https://www.steamgriddb.com/) (optional API key) or your own images.
- **Playtime tracking.** A background process watcher records every session, even for games started outside Rocket Launcher. Lifetime hours already recorded by Steam are imported.
- **Home dashboard.** Continue playing your last game, then see your own stats across all games: this week and month, streaks, personal bests, milestones, trends, a when-you-play heatmap, play habits, most played, an activity calendar, your backlog and achievements.
- **Steam achievements.** Per-game progress plus a library-wide summary (needs a Steam Web API key).
- **Everyday comforts.** A favourites bar, search with `Ctrl+K`, a system tray icon, optional start with Windows, hide while playing, and automatic updates.

## Install

Download the latest `Rocket-Launcher-Setup-<version>.exe` from the [releases page](https://github.com/lithiumzaaa/rocket-launcher-releases/releases/latest) and run it. It installs per user, so no admin prompt. The app checks for updates on startup and every few hours, and asks before downloading one.

Your library, playtime and artwork are stored in `%APPDATA%\Rocket Launcher` and are kept if you uninstall.

### Optional API keys (Settings)

| Key | Used for | Where to get it |
| --- | --- | --- |
| SteamGridDB | Artwork options in the Customise dialog, art for non-Steam games | steamgriddb.com → Preferences → API |
| Steam Web API | Achievements | steamcommunity.com/dev/apikey |

Steam achievements also need your Steam profile's **Game details** set to Public.

## Development

Requires Node.js 20+ on Windows.

```sh
npm install
npm run dev          # run with hot reload
npm run typecheck    # main + renderer type checks
npm run build:win    # build the installer into dist/ (no publishing)
```

### Releasing

1. Bump `version` in `package.json`.
2. Run `npm run release`. It builds the installer and publishes it, with `latest.yml`, to the public [rocket-launcher-releases](https://github.com/lithiumzaaa/rocket-launcher-releases) repo, which installed copies check for updates. It uses the GitHub CLI's token (`gh auth login`).

### Project layout

```
src/
  main/          Electron main process
    scanners/    One scanner per launcher, plus game folders
    playtime.ts  Process watcher, sessions and player stats
    artwork.ts   Cover / hero / logo / icon fetching
    achievements.ts  Steam Web API
    updater.ts   Auto-updates
  preload/       The window.api bridge
  renderer/      React + Tailwind UI
  shared/        Types and helpers used by both sides
design/references/   Visual reference shots
```

Built with Electron, electron-vite, React, Zustand, Tailwind CSS and lucide icons.
