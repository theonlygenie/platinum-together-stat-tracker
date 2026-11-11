const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { load } = require('./parser');
const { createWikiUpdater } = require('./wiki-updater');

// Look for a "Game" folder with logs in it, starting next to the app and walking up (works from source and from the packaged exe).
function findGameDir() {
  for (let dir = path.dirname(app.isPackaged ? process.execPath : __dirname), i = 0; i < 8; i++, dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'Game');
    if (fs.existsSync(path.join(candidate, 'logs'))) return candidate;
  }
  return path.resolve(__dirname, '..', 'Game');
}
const defaultDir = findGameDir();

// Keep settings (game folder, world tags) in one fixed place, whatever the app is called.
app.setPath('userData', path.join(app.getPath('appData'), 'platinum-stat-tracker'));
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

// The app's own settings (game folder, which world each session belongs to). Never inside the game folder.
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
}
// The world that is active right now is the one named in the game folder's world-name.txt.
function activeWorld(dir) {
  try { return fs.readFileSync(path.join(dir, 'world-name.txt'), 'utf8').trim().slice(0, 60); } catch { return ''; }
}

// A session whose log was written to in the last two minutes is being played now, so it belongs to the active world.
// Keeping its own copy of the session logs, so the stats survive the game being updated or its logs being cleared. OFF until the user
// switches it on (settings.archive). It only ever copies game logs INTO the app's settings folder; the game folder is never written to.
const archiveDir = () => path.join(app.getPath('userData'), 'archive', 'logs');
function archiveLogs(gameDir) {
  const dest = archiveDir(), src = path.join(gameDir, 'logs');
  try {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src).filter(f => /^session-[\w-]+\.log$/.test(f))) {
      const from = path.join(src, f), to = path.join(dest, f), a = fs.statSync(from);
      let b = null; try { b = fs.statSync(to); } catch {}
      if (b && b.size >= a.size) continue;   // already kept (a live log grows, so a bigger source is copied again)
      fs.copyFileSync(from, to);
      fs.utimesSync(to, a.atime, a.mtime);   // keep the original time, which the live-session check relies on
    }
  } catch {}
}
// Periodic snapshots (settings.snapshots): a compact history of the derived basics, written only when something changed and at most
// every 10 minutes, as one JSON line each in archive/snapshots.jsonl. Per world: the Pokédex seen/caught numbers, the Pokémon in the
// boxes and party (species, nickname, where caught, ball, shiny, nature, IVs, EVs, moves, held item), the bag, and the per-route
// encounter file copied as it is.
// Only data the app already shows; no account, chat or network data. Never written into the game folder.
const snapFile = () => path.join(app.getPath('userData'), 'archive', 'snapshots.jsonl');
let snapLast = null;   // { hash, t } of the newest snapshot, read from the file the first time
const monRow = m => [m.pid, m.species, m.nick || '', m.loc, m.ball, m.shiny ? 1 : 0, m.nature, m.iv, m.ev, m.moves, m.item, m.mlv];
function snapshotArchive(data, gameDir) {
  try {
    const worlds = {};
    for (const name of Object.keys(data.dex || {})) {
      const ow = (data.owned || {})[name], pa = (data.party || {})[name] || [];
      worlds[name] = {
        seen: data.dex[name].seen, caught: data.dex[name].caught,
        // [pid, species, nickname, place caught, ball, shiny, nature, IVs, EVs, moves, held item, level met at]
        boxes: ow ? ow.mons.map(monRow) : [],
        party: pa.map(m => [...monRow(m), m.level]),
        bag: (data.bag || {})[name] || {},
      };
    }
    const body = JSON.stringify(worlds);
    const hash = require('crypto').createHash('sha1').update(body).digest('hex');
    if (!snapLast) {
      snapLast = { hash: '', t: 0 };
      try {
        const lines = fs.readFileSync(snapFile(), 'utf8').trimEnd().split('\n'), last = JSON.parse(lines[lines.length - 1]);
        snapLast = { hash: last.h, t: Date.parse(last.t) || 0 };
      } catch {}
    }
    if (hash !== snapLast.hash && Date.now() - snapLast.t >= 600000 && Object.keys(worlds).length) {
      fs.mkdirSync(path.dirname(snapFile()), { recursive: true });
      const t = new Date().toISOString();
      fs.appendFileSync(snapFile(), JSON.stringify({ t, h: hash, worlds }) + '\n');
      snapLast = { hash, t: Date.now() };
    }
    // the per-route encounter files, one copy per world, replaced when the game's file changes
    const dirs = [gameDir];
    const wd = path.join(gameDir, 'worlds');
    if (fs.existsSync(wd)) for (const d of fs.readdirSync(wd)) dirs.push(path.join(wd, d));
    for (const dir of dirs) {
      const from = path.join(dir, 'encounters.ini');
      if (!fs.existsSync(from)) continue;
      let name = ''; try { name = fs.readFileSync(path.join(dir, 'world-name.txt'), 'utf8').trim(); } catch {}
      name = (name || path.basename(dir)).replace(/[^\w .-]/g, '_').slice(0, 60);
      const to = path.join(app.getPath('userData'), 'archive', 'worlds', name, 'encounters.ini');
      const a = fs.statSync(from); let b = null; try { b = fs.statSync(to); } catch {}
      if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  } catch {}
}
function archiveInfo() {
  const st = readSettings();
  let count = 0, bytes = 0, snaps = 0, snapBytes = 0;
  try { for (const f of fs.readdirSync(archiveDir())) { count++; bytes += fs.statSync(path.join(archiveDir(), f)).size; } } catch {}
  try { const t = fs.readFileSync(snapFile(), 'utf8'); snapBytes = Buffer.byteLength(t); snaps = t.split('\n').filter(Boolean).length; } catch {}
  return { on: !!st.archive, count, bytes, snapsOn: !!st.snapshots, snaps, snapBytes };
}

function snapshot(dir) {
  const settings = readSettings();
  if (settings.archive) archiveLogs(dir);
  const data = load(dir, settings.archive ? archiveDir() : null);
  const tags = settings.tags || {};
  const live = data.sessions.reduce((a, s) => (!a || s.mtimeMs > a.mtimeMs ? s : a), null);
  const world = activeWorld(dir);
  if (live && world && !tags[live.file] && Date.now() - live.mtimeMs < 120000) {
    tags[live.file] = world;
    writeSettings({ ...settings, tags });
  }
  const custom = customNames();
  const released = trackReleased(data);
  const itemsEver = trackItems(data);
  if (settings.snapshots) snapshotArchive(data, dir);
  return { ...data, tags, activeWorld: world, speciesNames: { ...speciesNames, ...custom }, customNames: custom, released, itemsEver, spawns: spawnTables };
}

// Released Pokémon. A save never keeps a Pokémon once it is released, so this works by remembering: every time the app reads a
// save it notes which Pokémon (by PID, which never changes, even through evolution) are in the boxes and party, and a Pokémon
// that was there and is now gone from the whole save is counted as having left (released, or traded away: the save cannot say which).
// The first read of a world is only the starting point, so nothing from before the app was set up is counted. Kept in the settings
// folder (released.json), never in the game folder. To avoid false counts, a Pokémon must stay missing for 20 seconds before it counts,
// and a read where most of a world seems to have vanished is ignored as a bad read.
const releasedFile = () => path.join(app.getPath('userData'), 'released.json');
function trackReleased(data) {
  let led;
  try { led = JSON.parse(fs.readFileSync(releasedFile(), 'utf8')); } catch { led = null; }
  let dirty = false;
  if (!led || typeof led !== 'object' || !led.worlds) { led = { since: new Date().toISOString(), worlds: {} }; dirty = true; }
  const now = Date.now(), out = {};
  for (const [name, ow] of Object.entries(data.owned || {})) {
    if (!ow || !Array.isArray(ow.all) || !ow.mons.length) continue;   // unreadable save: leave this world alone
    const present = new Set(ow.all), info = m => ({ s: m.species, n: m.nick || '', l: m.loc, b: m.ball, sh: m.shiny ? 1 : 0 });
    let W = led.worlds[name];
    if (!W) {
      W = led.worlds[name] = { tracked: {}, missing: {}, left: [] };
      for (const m of ow.mons) W.tracked[m.pid] = info(m);
      dirty = true;
    } else {
      for (const m of ow.mons) {
        const was = W.tracked[m.pid], now2 = info(m);
        if (!was || was.s !== now2.s || was.n !== now2.n) { W.tracked[m.pid] = now2; dirty = true; }
        if (W.missing[m.pid]) { delete W.missing[m.pid]; dirty = true; }
        const back = W.left.findIndex(x => x.pid === m.pid);
        if (back >= 0) { W.left.splice(back, 1); dirty = true; }   // it came back (for example traded back), so it did not leave
      }
      const tracked = Object.keys(W.tracked), absent = tracked.filter(p => !present.has(Number(p)));
      if (tracked.length >= 10 && absent.length > tracked.length / 2) {
        if (Object.keys(W.missing).length) { W.missing = {}; dirty = true; }
      } else {
        for (const p of tracked) {
          if (present.has(Number(p))) { if (W.missing[p]) { delete W.missing[p]; dirty = true; } continue; }
          if (!W.missing[p]) { W.missing[p] = now; dirty = true; }
          else if (now - W.missing[p] >= 20000) {
            W.left.push({ pid: Number(p), species: W.tracked[p].s, nick: W.tracked[p].n, loc: W.tracked[p].l, ball: W.tracked[p].b, shiny: W.tracked[p].sh, when: new Date().toISOString() });
            delete W.tracked[p]; delete W.missing[p]; dirty = true;
          }
        }
      }
    }
    out[name] = { count: W.left.length, left: W.left.slice(-300).reverse() };
  }
  if (dirty) { try { fs.mkdirSync(path.dirname(releasedFile()), { recursive: true }); fs.writeFileSync(releasedFile(), JSON.stringify(led)); } catch {} }
  return { since: led.since, worlds: out };
}

// Save (or clear, with an empty name) a name typed on a Pokédex card. Only numbers above the confirmed 1-493 range can be named.
function saveCustomName(id, name) {
  if (!/^\d{1,4}$/.test(String(id)) || +id <= 493 || typeof name !== 'string') return;
  const cur = customNames();
  const clean = name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  if (clean) cur[String(id)] = clean; else delete cur[String(id)];
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(path.join(app.getPath('userData'), 'species-custom.json'), JSON.stringify(cur, null, 2));
}

// Optional names you add yourself for species the game numbers differently: { "545": "Name" } in species-custom.json (settings folder).
function customNames() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'species-custom.json'), 'utf8'));
    const out = {};
    for (const [id, name] of Object.entries(raw)) if (/^\d+$/.test(id) && typeof name === 'string' && name.length <= 40) out[id] = name;
    return out;
  } catch { return {}; }
}

// The game's town map picture, read from the game folder the same way, and the labels the user draws on it (kept in the settings folder).
let mapCache = null, mapCacheDir = '';
function townMapImage() {
  const dir = readSettings().gameDir || defaultDir;
  if (mapCache && mapCacheDir === dir) return mapCache;
  try {
    mapCache = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, 'town-map.png')).toString('base64');
    mapCacheDir = dir;
    return mapCache;
  } catch { return null; }
}
const mapLabelsFile = () => path.join(app.getPath('userData'), 'map-labels.json');
function loadMapLabels() {
  try { return JSON.parse(fs.readFileSync(mapLabelsFile(), 'utf8')); } catch { return null; }   // null = nothing saved yet, so the renderer starts from its seed labels
}
function saveMapLabels(assign) {
  if (!assign || typeof assign !== 'object') return;
  const clean = {};
  for (const [key, place] of Object.entries(assign).slice(0, 600)) {
    if (/^\d{1,3},\d{1,3}$/.test(key) && Number.isInteger(place) && place >= 0 && place < 10000) clean[key] = place;
  }
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(mapLabelsFile(), JSON.stringify({ assign: clean }, null, 2));
}

// The game's icon sheet, read from the game folder (never copied) and handed to the page as a data URL.
let iconCache = null, iconCacheDir = '';
function gameIcons() {
  const dir = readSettings().gameDir || defaultDir;
  if (iconCache && iconCacheDir === dir) return iconCache;
  try {
    iconCache = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, 'kit-mon-icons.png')).toString('base64');
    iconCacheDir = dir;
    return iconCache;
  } catch { return null; }
}

// The game's item icon sheet, read the same way as the Pokémon one.
let itemIconCache = null, itemIconDir = '';
function gameItemIcons() {
  const dir = readSettings().gameDir || defaultDir;
  if (itemIconCache && itemIconDir === dir) return itemIconCache;
  try {
    itemIconCache = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, 'kit-item-icons.png')).toString('base64');
    itemIconDir = dir;
    return itemIconCache;
  } catch { return null; }
}

// Item Dex memory: the game has no item dex, so the app remembers which items each world has ever had (in the bag or held by a
// Pokémon) and the most it held at once, from the first time it looked. Kept in the settings folder (items-ever.json).
const itemsFile = () => path.join(app.getPath('userData'), 'items-ever.json');
function trackItems(data) {
  let led; try { led = JSON.parse(fs.readFileSync(itemsFile(), 'utf8')); } catch { led = {}; }
  let dirty = false;
  const now = new Date().toISOString();
  for (const name of Object.keys(data.bag || {})) {
    const have = {};
    for (const list of Object.values(data.bag[name])) for (const [id, q] of list) have[id] = (have[id] || 0) + q;
    const ow = (data.owned || {})[name], pa = (data.party || {})[name] || [];
    for (const m of [...(ow ? ow.mons : []), ...pa]) if (m.item) have[m.item] = (have[m.item] || 0) + 1;
    const W = led[name] ||= {};
    for (const [id, q] of Object.entries(have)) {
      const cur = W[id];
      if (!cur) { W[id] = [q, now]; dirty = true; } else if (q > cur[0]) { cur[0] = q; dirty = true; }
    }
  }
  if (dirty) { try { fs.mkdirSync(path.dirname(itemsFile()), { recursive: true }); fs.writeFileSync(itemsFile(), JSON.stringify(led)); } catch {} }
  return led;
}

// The game's shiny front sprites (one 80px cell per species number, 25 per row), read the same way.
let shinyCache = null, shinyDir = '';
function gameShinyFronts() {
  const dir = readSettings().gameDir || defaultDir;
  if (shinyCache && shinyDir === dir) return shinyCache;
  try {
    shinyCache = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, 'kit-mon-front-shiny.png')).toString('base64');
    shinyDir = dir;
    return shinyCache;
  } catch { return null; }
}

// Where each Pokémon can be found, built from the community wiki and keyed by the game's own species numbers. The app keeps these fresh
// by itself (wiki-updater.js, can be turned off in Settings); the copy in data/ is what ships with the app and the fallback.
let spawnTables = null;
const wiki = createWikiUpdater({
  userData: app.getPath('userData'), bundledFile: path.join(__dirname, 'data', 'wiki-spawns.json'),
  getGameDir: () => readSettings().gameDir || defaultDir, getNames: () => ({ ...speciesNames, ...customNames() }),
  getOn: () => readSettings().wikiAuto !== false, onUpdated: t => { spawnTables = t; },
});
spawnTables = wiki.tables().t;

// Dex number -> name, shipped with the app (species.json).
let speciesNames = {};
try { speciesNames = JSON.parse(fs.readFileSync(path.join(__dirname, 'species.json'), 'utf8')); } catch {}

app.whenReady().then(() => {
  ipcMain.handle('stats:load', () => snapshot(readSettings().gameDir || defaultDir));
  ipcMain.handle('stats:pick', async () => {
    const cur = readSettings();
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose the Platinum Together Game folder' });
    if (r.canceled) return snapshot(cur.gameDir || defaultDir);
    writeSettings({ ...cur, gameDir: r.filePaths[0] });
    return snapshot(r.filePaths[0]);
  });
  ipcMain.handle('stats:tag', (_e, file, world) => {
    if (typeof file !== 'string' || !/^session-[\w-]+\.log$/.test(file)) return;
    const s = readSettings();
    s.tags = s.tags || {};
    if (typeof world === 'string' && world && world.length <= 60) s.tags[file] = world;
    else delete s.tags[file];
    writeSettings(s);
  });
  ipcMain.handle('archive:get', () => archiveInfo());
  ipcMain.handle('archive:set', (_e, which, on) => { const s = readSettings(); s[which === 'snapshots' ? 'snapshots' : 'archive'] = on === true; writeSettings(s); return archiveInfo(); });
  ipcMain.handle('wiki:get', () => wiki.status());
  ipcMain.handle('wiki:check', () => wiki.check({ force: true }));
  ipcMain.handle('wiki:set', (_e, on) => { const s = readSettings(); s.wikiAuto = on === true; writeSettings(s); return wiki.status(); });
  ipcMain.handle('stats:icons', () => gameIcons());
  ipcMain.handle('stats:itemIcons', () => gameItemIcons());
  ipcMain.handle('stats:shinyFronts', () => gameShinyFronts());
  ipcMain.handle('map:image', () => townMapImage());
  ipcMain.handle('map:load', () => loadMapLabels());
  ipcMain.handle('map:save', (_e, assign) => saveMapLabels(assign));
  ipcMain.handle('stats:name', (_e, id, name) => saveCustomName(id, name));
  ipcMain.handle('stats:tagMany', (_e, files, world) => {
    if (!Array.isArray(files) || typeof world !== 'string' || !world || world.length > 60) return;
    const s = readSettings();
    s.tags = s.tags || {};
    for (const f of files) if (typeof f === 'string' && /^session-[\w-]+\.log$/.test(f)) s.tags[f] = world;
    writeSettings(s);
  });
  const win = new BrowserWindow({
    width: 1150, height: 800, minWidth: 820, minHeight: 560, backgroundColor: '#f4e9e1', title: 'PT Journal', icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  wiki.start();
});
app.on('window-all-closed', () => app.quit());
