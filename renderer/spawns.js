// Spawn classification from the wiki tables, trade sources, and the Sparkly grass / Came from elsewhere cards.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// Does the wiki's table for the place where this Pokémon was caught explain it? 'normal': a regular spawn there (or its earlier form);
// 'special': a gift, static or similar encounter at that place; 'sparkly': on the wiki's sparkly-grass list for a route of that level;
// 'other': a source not tied to a place (honey tree, swarm, roaming); 'unlisted': nothing on the wiki explains it (usually sparkly grass too).
// Worlds that swap the wild Pokémon (type pools, randomizer) cannot be compared, so they get no verdict.
function spawnClass(m, st, own) {
  const sp = data.spawns;
  if (!sp || m.egg || m.eggLoc || m.ball === 16 || m.loc >= 2000) return null;
  if (own && `${m.tid}/${m.sid}` !== own) return null;   // carries another trainer ID: moved in from another world or traded, so where it was met says nothing about this world
  if (st && (st.pool_kind > 0 || st.random_species > 0)) return null;
  const p = sp.places[placeName(m.loc)];
  if (!p) return null;
  const seen = new Set([m.species]), q = [m.species];
  while (q.length) for (const par of sp.evo[q.pop()] || []) if (!seen.has(par)) { seen.add(par); q.push(par); }
  const any = list => list.some(n => seen.has(n));
  if (any(p.normal)) return 'normal';
  if (any(p.special)) return 'special';
  if (any(sp.rare.filter(([lv]) => lv <= p.level).flatMap(([, ns]) => ns))) return 'sparkly';
  if (any(sp.anywhere)) return 'other';
  return 'unlisted';
}
const isRare = c => c === 'sparkly' || c === 'unlisted';

// How a Pokémon with another trainer's ID reached this world: an NPC trade (matched to the game's own trade table), a trade with a friend
// or a GTS arrival (both matched to the logs), or the Global Box (the same trainer name, from another of your worlds).
function tradeVia(foreign, ownOt) {
  const evo = (data.spawns && data.spawns.evo) || {};
  const chain = sp => { const seen = new Set([sp]), q = [sp]; while (q.length) for (const p of evo[q.pop()] || []) if (!seen.has(p)) { seen.add(p); q.push(p); } return seen; };
  const via = new Map(), mine = m => m.ot.toLowerCase() === ownOt.toLowerCase();   // your own trainer name: from one of your other worlds, never a trade
  const npc = new Set((data.npcTrades || []).map(t => t.tid));
  for (const m of foreign) if (m.sid === 0 && npc.has(m.tid)) via.set(m, 'NPC trade');
  const todo = data.sessions.flatMap(s => s.trades || []);
  const cands = ev => foreign.filter(m => !via.has(m) && !mine(m) && chain(m.species).has(ev.got));
  // trades with only one possible Pokémon first; then the rest, preferring a trainer you have already traded with
  for (let pass = 0; pass < 2; pass++) for (const ev of todo.slice()) {
    const c = cands(ev);
    if (!c.length) { todo.splice(todo.indexOf(ev), 1); continue; }
    if (pass === 0 && c.length > 1) continue;
    const known = new Set([...via.entries()].filter(([, v]) => v === 'Direct trade').map(([m]) => m.ot));
    via.set(c.find(m => known.has(m.ot)) || c[0], 'Direct trade');
    todo.splice(todo.indexOf(ev), 1);
  }
  const gts = new Set(data.sessions.flatMap(s => s.gts || []));
  for (const m of foreign) if (!via.has(m) && !mine(m) && [...chain(m.species)].some(x => gts.has(x))) via.set(m, 'GTS');
  for (const m of foreign) if (!via.has(m)) via.set(m, mine(m) ? 'Global Box' : 'Other trade');
  return via;
}

// For the chosen world: wild catches that came from sparkly grass, and Pokémon that carry another trainer ID (moved in from another
// world through the Global Box, or traded from another trainer). Where those were met says nothing about this world's own spawns.
function spawnReport() {
  const src = ivSource(), st = (data.settings || {})[src.pick], ids = {};
  for (const m of src.stored) { const k = `${m.tid}/${m.sid}`; ids[k] = (ids[k] || 0) + 1; }
  const own = (Object.entries(ids).sort((a, b) => b[1] - a[1])[0] || [])[0];
  const ownOt = ((src.stored.find(m => `${m.tid}/${m.sid}` === own)) || {}).ot || '';
  const sparkly = [], foreign = [], wild = [], bySpecies = {};
  for (const m of src.stored) {
    if (m.egg) continue;
    if (own && `${m.tid}/${m.sid}` !== own) { foreign.push(m); continue; }
    if (arrival(m) !== 'found') continue;
    wild.push(m);
    if (isRare(spawnClass(m, st, own))) { sparkly.push(m); (bySpecies[m.species] ||= { spark: 0, glob: 0, vias: {} }).spark++; }
  }
  const via = tradeVia(foreign, ownOt);
  for (const m of foreign) { const b = (bySpecies[m.species] ||= { spark: 0, glob: 0, vias: {} }); b.glob++; (b.vias ||= {})[via.get(m)] = (b.vias[via.get(m)] || 0) + 1; }
  return { src, own, ownOt, sparkly, foreign, via, wild, bySpecies, comparable: !!data.spawns && !(st && (st.pool_kind > 0 || st.random_species > 0)) };
}
const topNames = (ms, n = 8) => {
  const c = {}; ms.forEach(m => { const k = speciesName(m.species); c[k] = (c[k] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => (v > 1 ? `${k} ×${v}` : k)).join(', ');
};

// Stats cards
function sparklyCard() {
  const r = spawnReport();
  if (!r.comparable) return null;
  if (!r.sparkly.length) return card('lime', 'Sparkly grass', el('div', { class: 'note' }, 'No sparkly-grass finds in this save yet.'));
  const by = {}; r.sparkly.forEach(m => (by[m.loc] ||= []).push(m));
  const places = Object.entries(by).map(([loc, ms]) => { const sp = tallyBy(ms, m => speciesName(m.species)); return { name: placeName(+loc), value: ms.length, sub: glance(sp), detail: [['Species', sp]] }; }).sort((a, b) => b.value - a.value);
  return card('lime', 'Sparkly grass',
    bigStats([[String(r.sparkly.length), 'sparkly-grass finds'], [r.wild.length ? `${Math.round(r.sparkly.length / r.wild.length * 100)}%` : '–', 'of wild catches'], [String(places.length), 'places'], [places[0].name.replace(/^Route /, 'Rt '), `most finds (${places[0].value})`]]),
    rowsX('spark', places, 'Place', 'Finds'),
    el('div', { class: 'note' }, 'Wild catches that are not a normal spawn where they were caught, but are on the wiki’s sparkly-grass list for a route of that level. Counted from the Pokémon in your boxes and party, so ones you released are not included. Pokémon with another trainer’s ID are left out and shown under Global Box.'));
}
function globalBoxCard() {
  const r = spawnReport();
  if (!r.foreign.length) return null;
  const order = ['GTS', 'Direct trade', 'NPC trade', 'Other trade', 'Global Box'], by = {};
  r.foreign.forEach(m => (by[r.via.get(m)] ||= []).push(m));
  const rowsData = order.filter(k => by[k]).map(k => {
    const ms = by[k], sp = tallyBy(ms, m => speciesName(m.species)), who = tallyBy(ms, m => m.ot || 'unknown');
    return {
      name: k, value: ms.length,
      sub: k === 'Global Box' ? `your other worlds · ${glance(sp, 3)}` : `${glance(who, 3)} · ${glance(sp, 3)}`,
      detail: k === 'Global Box' ? [['Pokémon', sp]] : [['Pokémon', sp], [k === 'GTS' ? 'Traded by' : 'Trainers', who]],
    };
  });
  const n = k => (by[k] || []).length;
  const c = card('navy', 'Came from elsewhere',
    bigStats([[fmt(r.foreign.length), 'not caught here'], [fmt(n('Global Box')), 'Global Box'], [fmt(n('GTS')), 'GTS'], [fmt(n('Direct trade') + n('NPC trade') + n('Other trade')), 'other trades']]),
    rowsX('elsewhere', rowsData, 'How', 'Pokémon'),
    el('div', { class: 'note' }, 'Pokémon in this world that carry a different trainer ID. NPC trades are matched to the game’s own trade table. Direct trades with a friend and GTS arrivals are matched to the trade lines in your logs, so older ones from before the logs began show as Other trade. The same trainer name under another ID means the Pokémon came over through the Global Box from another of your worlds. Click a row to see every Pokémon and trainer in it. Where these were first met belongs to that other place, so the map and the sparkly-grass count skip them.'));
  return c;
}
