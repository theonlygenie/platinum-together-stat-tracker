// App shell: world bar, tabs, first-run guide, render loop, settings panel wiring, icon sheets. Loads last.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

function worldBar() {
  const bar = document.getElementById('worldbar');
  bar.replaceChildren();
  if (!data || data.missing) return;
  const counts = {};
  for (const s of data.sessions) counts[worldOf(s)] = (counts[worldOf(s)] || 0) + 1;
  const names = [...new Set([...(data.knownWorlds || []), ...Object.values(data.tags || {})])]
    .filter(n => counts[n]).sort((a, b) => a.localeCompare(b));
  const chip = (id, label, n) => el('button', { class: 'chip' + (filter === id ? ' on' : ''), onclick: () => { filter = id; renderAll(); } },
    label, el('small', {}, n));
  bar.append(el('span', { class: 'lbl' }, 'World'), chip(ALL, 'All', data.sessions.length),
    ...names.map(n => chip(n, n, counts[n])), ...(counts[NONE] ? [chip(NONE, 'Unassigned', counts[NONE])] : []));
}

// The overview stretches to the height of the content area, so tell the stylesheet how tall that is.
function fit() { document.documentElement.style.setProperty('--mainh', `${Math.max(0, view.clientHeight - 2)}px`); }
window.addEventListener('resize', fit);

// Numbers climb from zero to their value when a page draws. Skipped for anyone who asked for less motion.
function countUp() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const n of view.querySelectorAll('.num[data-count]')) {
    const m = /^([\d,]*\.?\d+)(%?)$/.exec(n.dataset.count);
    if (!m) continue;
    const target = parseFloat(m[1].replace(/,/g, '')), dec = (m[1].split('.')[1] || '').length, unit = m[2];
    const start = performance.now(), span = 700;
    const step = now => {
      const k = Math.min(1, (now - start) / span), v = target * (1 - Math.pow(1 - k, 3));
      n.textContent = k < 1 ? (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + unit : n.dataset.count;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// Five tabs; most hold a few pages, picked with the chips along the top of the page. Stats gathers every chart: luck, trends over time, sessions.
const SUBS = {
  collection: [['species', 'Pokédex', () => species()], ['items', 'Item Dex', () => items()]],
  catching: [['balls', 'Balls', () => catching()]],
  stats: [['luck', 'Luck & stats', () => analysis()], ['trends', 'Trends', () => trends()], ['sessions', 'Sessions', () => sessions()]],
  map: [['map', 'Map', () => mapTab()], ['routes', 'Routes', () => routes()]],
};
const subPick = { collection: 'species', catching: 'balls', stats: 'luck', map: 'map' };
function tabView() {
  if (tab === 'overview') return overview();
  const subs = SUBS[tab], cur = subs.find(x => x[0] === subPick[tab]) || subs[0];
  const bar = el('div', { class: 'subnav' }, subs.map(([id, label]) => el('button', { class: 'chip' + (id === cur[0] ? ' on' : ''), onclick: () => { subPick[tab] = id; view.scrollTop = 0; render(); } }, label)));
  return el('div', { class: 'stack' }, subs.length > 1 ? bar : null, cur[2]());
}

// First run (or a wrong folder): a short guide to connecting the game folder. The app only ever reads from it.
let setupTried = false;
function setupGuide() {
  const f = data.found || {};
  const check = (ok, label) => el('li', { class: ok ? 'ok' : 'no' }, el('i', {}, ok ? '✓' : '✗'), label);
  const step = (n, title, ...body) => el('li', { class: 'sstep' }, el('span', { class: 'sn' }, String(n)), el('div', {}, el('h4', {}, title), ...body));
  const btn = el('button', { class: 'pill', onclick: async () => { setupTried = true; await refresh(window.stats.pick); } }, 'Choose the folder');
  return el('div', { class: 'setup' },
    el('section', { class: 'tile c-navy setuphead' },
      el('h2', {}, 'Welcome'),
      el('p', {}, 'Let’s connect the app to your game. It takes about ten seconds, and the app only ever reads from the folder. It never changes your game.')),
    el('section', { class: 'tile c-grey setupsteps' },
      el('ol', {},
        step(1, 'Find your game folder', el('p', {}, 'It is the folder you start the game from. Look for the one with ', el('b', {}, 'Platinum.exe'), ' inside. It is usually called ', el('b', {}, 'Game'), ' and sits inside your Platinum Together folder.')),
        step(2, 'Choose it here', el('p', {}, 'Press the button, pick that folder, then confirm. Pick the folder itself, not one of the folders inside it.'), btn),
        step(3, 'That is it', el('p', {}, 'Your stats appear straight away. If you move the game later, open Settings and use Game folder to pick it again.'))),
      setupTried ? el('div', { class: 'setupmsg' },
        el('h4', {}, 'That folder does not look right'),
        el('p', {}, 'The app looked in ' + data.gameDir + ' and expected to find these:'),
        el('ul', {}, check(f.exe, 'Platinum.exe'), check(f.logs, 'logs folder'), check(f.save, 'save.bin'), check(f.worlds, 'worlds folder')),
        el('p', {}, 'Play the game once so it makes its logs, or pick the folder that holds Platinum.exe.')) : null));
}

function render() {
  document.body.classList.toggle('nodata', !!(data && data.missing));
  document.getElementById('folder').textContent = data ? data.gameDir : '';
  updateTicker();
  fit();
  // redrawing the same page (a filter was clicked, or new data came in) must not throw the reader back to the top
  const keepScroll = view.dataset.page === tab + ':' + (subPick[tab] || '') ? view.scrollTop : 0;
  view.replaceChildren();
  if (!data) return view.append(el('div', { class: 'empty' }, 'Loading…'));
  if (data.missing) { view.dataset.page = 'setup'; return view.append(setupGuide()); }
  view.dataset.page = tab + ':' + (subPick[tab] || '');
  view.append(tabView());
  if (keepScroll) view.scrollTop = keepScroll;
  if (tab === 'overview') countUp();
}
function renderAll() { worldBar(); render(); }
window.addEventListener('pt-theme', () => { if (data) render(); });

async function refresh(fn = window.stats.load) {
  const next = await fn();
  const same = data && JSON.stringify(next) === JSON.stringify(data);
  data = next;
  // Don't rebuild the page under someone who is typing a species name.
  const typing = document.activeElement && document.activeElement.classList.contains('nameinput');
  if (!same && !typing) renderAll();
}
// Pick up new play and auto-tag the live session while the app stays open.
setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 15000);

document.getElementById('refresh').onclick = () => refresh();
// The small "i" button opens a panel with the game folder and the read-only note, so they stay off the pages themselves.
const infoBtn = document.getElementById('info'), infoPanel = document.getElementById('infopanel');
const setInfo = open => { infoPanel.hidden = !open; infoBtn.setAttribute('aria-expanded', String(open)); };
infoBtn.onclick = e => { e.stopPropagation(); setInfo(infoPanel.hidden); };
document.addEventListener('click', e => { if (!infoPanel.hidden && !infoPanel.contains(e.target)) setInfo(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setInfo(false); });
document.getElementById('pick').onclick = () => refresh(window.stats.pick);
// Optional: let the app keep its own copy of the session logs (off until switched on here).
const archBtn = document.getElementById('archbtn'), archNote = document.getElementById('archnote');
const snapBtn = document.getElementById('snapbtn'), snapNote = document.getElementById('snapnote');
const showArchive = a => {
  archBtn.textContent = a.on ? 'Turn off' : 'Turn on';
  archNote.textContent = a.on
    ? `Logs: on. ${a.count} log${a.count === 1 ? '' : 's'} kept (${(a.bytes / 1048576).toFixed(1)} MB) in the app’s own settings folder, so the stats survive a game update.`
    : 'Logs: off. When on, the app copies your session logs into its own settings folder so the stats survive a game update. Nothing is copied while it is off.';
  snapBtn.textContent = a.snapsOn ? 'Turn off' : 'Turn on';
  snapNote.textContent = a.snapsOn
    ? `Snapshots: on. ${a.snaps} kept (${Math.max(1, Math.round(a.snapBytes / 1024))} KB): Pokédex, boxes and party, saved when they change (at most every 10 minutes), plus your route encounter files.`
    : 'Snapshots: off. When on, the app keeps a small history of your Pokédex, boxes and party, and a copy of the route encounter files.';
};
window.stats.archiveGet().then(showArchive).catch(() => {});
// Wiki data: where the sparkly-grass tables come from, whether they refresh by themselves, and a button to refresh them now.
const wikiNote = document.getElementById('wikinote'), wikiBtn = document.getElementById('wikibtn'), wikiCheck = document.getElementById('wikicheck');
const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 2 ? 'just now' : m < 90 ? `${m} minutes ago` : m < 2880 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
const showWiki = w => {
  wikiBtn.textContent = w.on ? 'Turn off' : 'Turn on';
  wikiCheck.disabled = !!w.busy; wikiCheck.textContent = w.busy ? 'Checking…' : 'Check now';
  wikiNote.textContent = (w.version ? `Wiki v${w.version}${w.shipped ? ' (the copy that came with the app)' : ''}. ` : 'No wiki data. ')
    + (w.on ? `Updates by itself: when the game is updated and every few hours. Last checked ${ago(w.checkedAt)}.` : 'Updates are off. The app does not go online while this is off.')
    + (w.result ? ` ${w.result}.` : '') + (w.error ? ` (${w.error})` : '')
    + ' It fetches one public file from platinumtogether.online and sends nothing about you.';
};
const wikiRefresh = () => window.stats.wikiGet().then(showWiki).catch(() => {});
wikiRefresh();
infoBtn.addEventListener('click', wikiRefresh);
wikiBtn.onclick = async () => { const w = await window.stats.wikiGet(); showWiki(await window.stats.wikiSet(!w.on)); };
wikiCheck.onclick = async () => { wikiCheck.disabled = true; wikiCheck.textContent = 'Checking…'; showWiki(await window.stats.wikiCheck()); refresh(); };
setInterval(() => { if (!document.hidden && !infoPanel.hidden) wikiRefresh(); }, 20000);
archBtn.onclick = async () => { showArchive(await window.stats.archiveSet('logs', archBtn.textContent === 'Turn on')); refresh(); };
snapBtn.onclick = async () => { showArchive(await window.stats.archiveSet('snapshots', snapBtn.textContent === 'Turn on')); refresh(); };
document.getElementById('tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab; view.scrollTop = 0;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  render();
};
renderAll(); refresh();
// The icon sheet arrives as a long text string. Turn it into a short image address once, and make a darkened grey copy
// once for unseen species, so no card has to carry the string or run a filter.
async function prepareIcons(dataUrl, sheetVar = '--sheet', grayVar = '--sheet-gray') {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1), bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  document.documentElement.style.setProperty(sheetVar, `url("${url}")`);
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, cv.width, cv.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) * .5; d[i] = d[i + 1] = d[i + 2] = g; }
  cx.putImageData(px, 0, 0);
  const gray = await new Promise(ok => cv.toBlob(ok, 'image/png'));
  document.documentElement.style.setProperty(grayVar, `url("${URL.createObjectURL(gray)}")`);
  return url;
}
window.stats.shinyFronts().then(v => {
  if (!v) return;
  const b64 = v.slice(v.indexOf(',') + 1), bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  document.documentElement.style.setProperty('--fsheet', `url("${URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))}")`);
  shinySheetReady = true;
  if (tab === 'collection') render();
}).catch(() => {});
let itemIconsReady = false;
window.stats.itemIcons().then(async v => {
  if (!v) return;
  await prepareIcons(v, '--isheet', '--isheet-gray');
  itemIconsReady = true;
  if (tab === 'collection') render();
}).catch(() => {});
window.stats.icons().then(async v => {
  if (!v) return;
  icons = await prepareIcons(v);
  if (tab === 'collection' || tab === 'overview') render();
}).catch(() => {});
