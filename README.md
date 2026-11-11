# Platinum Together Stat Tracker

> **Public beta.** This is an early version and I'd love your help testing it. See [Help test it](#help-test-it) below.

A free, fan-made desktop app that shows your stats from **Platinum Together**: encounters, catches, shiny luck, IVs and natures,
your Pokédex (Sinnoh / National / PT), items, a map of where you caught things, trainer card, and more.

**It is read-only.** It only reads your game's logs, saves and encounter files. It never writes to or changes the game folder.
Anything it keeps (settings, optional log archive) lives in its own folder under `%APPDATA%\platinum-stat-tracker`.

Windows 10/11, 64-bit. You need Platinum Together installed on the same PC.

## Install (unzip and run)

1. Go to the [Releases](../../releases) page and download **`…-portable.zip`**.
2. Unzip it anywhere you like (not into `Program Files`) and run **Platinum Together Stat Tracker.exe**.
3. On first open the app walks you through choosing your game folder (the one with `Platinum.exe` in it, usually called `Game`).

There is also a `…-Setup.exe` installer if you would rather have Start Menu and Desktop shortcuts. It installs for your user only, with no admin prompt.

### If Windows blocks it

The app is not code-signed (that costs money, and this is a hobby project), so Windows can be cautious:

- **"Windows protected your PC" (SmartScreen):** click **More info → Run anyway**.
- **"An Application Control policy has blocked this file" (Smart App Control):** Windows will not offer a "run anyway" for this one.
  Smart App Control only allows signed or well-known apps. It can only be turned off for the whole PC, and it cannot be turned back on
  without resetting Windows, so only do that if you are comfortable with it. You can also run the app from source (below) instead.
- Antivirus flagging it is a false positive. The source is all in this repository if you want to check it.

## Help test it

I would really like to hear about:

- Anything that looks wrong, is missing, or shows numbers that do not match your game.
- Whether it finds your game folder, saves and worlds correctly (especially if you have several worlds or a non-default setup).
- Trade sources on the Stats page (GTS / direct trade / NPC trade / Global Box) are worked out from your logs, so they can be wrong. Tell me when they are.
- Anything confusing in the first-run guide or Settings.

Please [open an issue](../../issues/new/choose). A screenshot helps a lot. Please do **not** attach your save files.

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
