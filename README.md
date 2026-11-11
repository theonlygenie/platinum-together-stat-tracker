# Platinum Together Stat Tracker

A free, fan-made desktop app that shows your stats from **Platinum Together**: encounters, catches, shiny luck, IVs and natures,
your Pokédex (Sinnoh / National / PT), items, a map of where you caught things, trainer card, and more.

**It is read-only.** It only reads your game's logs, saves and encounter files. It never writes to or changes the game folder.
Anything it keeps (settings, optional log archive) lives in its own folder under `%APPDATA%\platinum-stat-tracker`.

## Install

1. Download the latest **Setup.exe** (installer) or the **portable .zip** from the [Releases](../../releases) page.
2. Run it. On first open the app walks you through choosing your game folder (the one with `Platinum.exe` in it, usually called `Game`).

Windows may warn that the app is from an "unknown publisher" because it is not code-signed.
Choose **More info → Run anyway**. The source is in this repository if you want to check it.

## What it does and does not do

- Works offline. The one thing it fetches is the community wiki's public data file (`platinumtogether.online/wiki/data/wiki.json`),
  used for the sparkly-grass and "came from elsewhere" tables. It sends nothing about you. You can turn this off in **Settings → Wiki data**.
- No accounts, no telemetry.
- Several themes, including a custom one (Settings → Theme).

## Build it yourself

```
npm install
npm start            # run from source
npm run dist:win     # builds the installer and zip into release/
```

## Credits

- **Platinum Together** and its community wiki (spawn and evolution data): <https://platinumtogether.online/wiki>.
- Fonts Archivo Black and Figtree (SIL Open Font License 1.1).
- Pokémon is a trademark of Nintendo / Creatures Inc. / GAME FREAK inc. This is an unofficial fan project and is not affiliated with them
  or with the Platinum Together developers.
