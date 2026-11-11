// Keeps the app's wiki spawn tables fresh. While the app is open it checks the community wiki's data file (a single GET of
// https://platinumtogether.online/wiki/data/wiki.json, nothing about you is sent), rebuilds the spawn tables from it and keeps them in the
// app's own settings folder. It checks: shortly after the app starts, every 6 hours after that, and straight away when the game itself has
// been updated (Platinum.exe changed), because the wiki usually follows a game update. A failed or odd-looking download is thrown away and the
// last good tables stay in use. The copy shipped with the app is the fallback. Turn it off in Settings.
const { net } = require('electron');
const fs = require('fs');
const path = require('path');
const { build, looksLikeWiki } = require('./spawns-build');

const URL_ = 'https://platinumtogether.online/wiki/data/wiki.json';
const EVERY = 6 * 3600e3, RETRY = 3600e3, MAX_BYTES = 25 * 1024 * 1024, TIMEOUT = 45e3;

function createWikiUpdater({ userData, bundledFile, getGameDir, getNames, getOn, onUpdated }) {
  const tablesFile = path.join(userData, 'wiki-spawns.json'), stateFile = path.join(userData, 'wiki-state.json');
  const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const writeAtomic = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, text); fs.renameSync(t, f); };
  const valid = t => t && t.places && typeof t.places === 'object' && Object.keys(t.places).length > 20 && Array.isArray(t.rare) && t.evo;
  let state = readJson(stateFile) || {};
  const save = () => { try { writeAtomic(stateFile, JSON.stringify(state, null, 2)); } catch {} };
  let busy = false;

  // the tables in use: the downloaded ones if there are any, otherwise the copy shipped with the app
  function tables() {
    const mine = readJson(tablesFile);
    if (valid(mine)) return { t: mine, shipped: false };
    return { t: readJson(bundledFile), shipped: true };
  }
  function status() {
    const { t, shipped } = tables();
    return {
      on: getOn(), shipped, version: t ? t.wikiVersion || '' : '', source: t ? t.wikiSource || '' : '', built: t ? t.built || '' : '',
      checkedAt: state.checkedAt || 0, result: state.result || '', error: state.error || '', busy,
    };
  }
  // Platinum.exe's size and date: it changes when the game is updated
  function gameSig() {
    try { const s = fs.statSync(path.join(getGameDir(), 'Platinum.exe')); return `${s.size}:${Math.round(s.mtimeMs)}`; } catch { return ''; }
  }

  async function run(opts) {
    if (busy) return;
    busy = true;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const headers = { 'User-Agent': 'PTJournal', Accept: 'application/json' };
      if (!opts.force && state.etag && !tables().shipped) headers['If-None-Match'] = state.etag;
      const res = await net.fetch(URL_, { headers, signal: ctl.signal });
      if (res.url && new URL(res.url).hostname !== 'platinumtogether.online') throw new Error('redirected to another site');
      if (res.status === 304) { state.checkedAt = Date.now(); state.result = 'Up to date'; state.error = ''; return; }
      if (!res.ok) throw new Error(`the wiki answered ${res.status}`);
      const len = +res.headers.get('content-length') || 0;
      if (len > MAX_BYTES) throw new Error('the file is larger than expected');
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new Error('the file is larger than expected');
      const W = JSON.parse(text);
      if (!looksLikeWiki(W)) throw new Error('the file does not look like the wiki data');
      const cur = tables().t;
      state.etag = res.headers.get('etag') || ''; state.lastModified = res.headers.get('last-modified') || '';
      if (!opts.force && cur && !tables().shipped && cur.wikiSource === String(W.source || '') && cur.wikiVersion === String(W.version || '')) {
        state.checkedAt = Date.now(); state.result = 'Up to date'; state.error = ''; return;
      }
      const { out, missing } = build(W, getNames());
      const places = Object.keys(out.places).length, before = cur ? Object.keys(cur.places).length : 0;
      if (places < 20 || (before && places < before * 0.8)) throw new Error('the new tables look incomplete, so they were not used');
      writeAtomic(tablesFile, JSON.stringify(out));
      state.checkedAt = Date.now(); state.error = '';
      state.result = `Updated to v${out.wikiVersion}${missing.length ? ` (${missing.length} species not matched by name)` : ''}`;
      try { onUpdated(out); } catch {}
    } catch (e) {
      state.lastTry = Date.now();
      state.error = e && e.name === 'AbortError' ? 'The wiki did not answer in time' : String((e && e.message) || e).slice(0, 160);
      state.result = 'Could not update, using the last good data';
    } finally {
      clearTimeout(timer); busy = false; save();
    }
  }
  async function check(opts = {}) { await run(opts); return status(); }

  // runs every few minutes: cheap unless a check is actually due
  function tick() {
    if (!getOn()) return;
    const sig = gameSig(), changed = sig && state.gameSig && sig !== state.gameSig;
    if (sig && sig !== state.gameSig) { state.gameSig = sig; save(); }
    const now = Date.now(), due = !state.checkedAt || now - state.checkedAt > EVERY;
    const retryOk = !state.lastTry || now - state.lastTry > RETRY || (state.checkedAt || 0) > state.lastTry;
    if (changed || (due && retryOk)) check({ force: !!changed });
  }
  function start() { setTimeout(tick, 8000); setInterval(tick, 10 * 60e3); }
  return { start, check, status, tables, setOn: () => status() };
}
module.exports = { createWikiUpdater };
