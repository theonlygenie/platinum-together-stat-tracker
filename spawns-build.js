// Turns the community wiki's wiki.json (https://platinumtogether.online/wiki/data/wiki.json) into the spawn tables the app uses.
// The wiki numbers its Pokémon differently from the game, so every species is matched by NAME to the game's own number
// (names come from species.json plus the names confirmed in the app's species-custom.json).
// Used by the app's automatic wiki update (wiki-updater.js) and by the command-line tool in tools/build-spawns.js.
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const maxLevel = s => Math.max(...String(s).split(/[–-]/).map(Number).filter(Number.isFinite));

// Is this plausibly the wiki's data file? (checked before anything is built, so a broken download is never used)
function looksLikeWiki(W) {
  return !!W && typeof W === 'object' && Array.isArray(W.species) && W.species.length > 100 && Array.isArray(W.wild) && W.wild.length > 100
    && Array.isArray(W.other) && Array.isArray(W.evolutions) && W.places && typeof W.places === 'object';
}

// names: { "<game species number>": "Name" }
function build(W, names) {
  const numByName = {};
  for (const [n, nm] of Object.entries(names)) numByName[norm(nm)] = +n;
  const num = {}, missing = [];
  for (const sp of W.species) { const n = numByName[norm(sp.name)]; if (n != null) num[sp.id] = n; else missing.push(sp.name); }
  const N = id => num[id];
  // with the species names missing nothing matches and every place ends up with an empty list, which looks valid but marks every catch as unusual
  const matched = Object.keys(num).length;
  if (matched < 300) throw new Error('only ' + matched + ' wiki species could be matched by name, so the species names are probably missing');

  const places = {};
  for (const x of W.wild) {
    const area = W.places[x.area]; if (!area) continue;
    const g = area.group, p = (places[g] ||= { level: 0, normal: new Set(), special: new Set() });
    if (N(x.species) != null) p.normal.add(N(x.species));
    if (x.method === 'grass') { const lv = maxLevel(x.levels); if (Number.isFinite(lv)) p.level = Math.max(p.level, lv); }
  }
  const rareTiers = {}, anywhere = new Set();
  for (const o of W.other) {
    const n = N(o.species); if (n == null) continue;
    if (/Rare grass patches/.test(o.where)) { const lv = /Lv\. (\d+)/.exec(o.where); (rareTiers[lv ? +lv[1] : 0] ||= new Set()).add(n); continue; }
    if (/RiftPad/.test(o.where) || o.how === 'Egg' || o.how === 'Breed') continue;
    let placed = false;
    for (const g of Object.keys(places)) if (o.where.includes(g.replace(/ (City|Town)$/, ''))) { places[g].special.add(n); placed = true; }
    if (!placed) anywhere.add(n);   // honey trees, swarms, roaming Pokémon and the like: not tied to one place
  }
  const evo = {};
  for (const e of W.evolutions) { const a = N(e.species), b = N(e.from); if (a != null && b != null) (evo[a] ||= []).push(b); }

  const out = {
    source: `platinumtogether.online wiki (${W.source}, v${W.version})`,
    wikiSource: String(W.source || ''), wikiVersion: String(W.version || ''), matched,
    built: new Date().toISOString().slice(0, 10),
    places: Object.fromEntries(Object.entries(places).map(([g, p]) => [g, { level: p.level, normal: [...p.normal].sort((a, b) => a - b), special: [...p.special].sort((a, b) => a - b) }])),
    rare: Object.entries(rareTiers).map(([lv, set]) => [+lv, [...set].sort((a, b) => a - b)]).sort((a, b) => a[0] - b[0]),
    evo, anywhere: [...anywhere].sort((a, b) => a - b),
  };
  return { out, missing };
}
module.exports = { build, looksLikeWiki };
