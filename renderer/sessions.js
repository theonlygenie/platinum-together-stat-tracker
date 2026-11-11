// Routes and Sessions sub-tabs.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// Encounters by route. The game writes a per-route file (encounters.ini) only for runs that use its first-encounter rule, so a world
// without one (your main world, for example) falls back to where the Pokémon in its boxes and party were caught, read from the save.
let routesWorld = null;
function routes() {
  const names = [...new Set([...(data.worlds || []).map(w => w.name), ...Object.keys(data.owned || {}), ...(data.knownWorlds || []).filter(n => (data.worlds || []).some(w => w.name === n) || (data.owned || {})[n])])];
  if (!names.length) return el('div', { class: 'empty' }, 'No encounter files or saves found.');
  const pick = names.includes(routesWorld) ? routesWorld : (names.includes(filter) ? filter : (names.includes(data.activeWorld) ? data.activeWorld : names[0]));
  const sel = el('select', { onchange: e => { routesWorld = e.target.value; render(); } }, names.map(n => el('option', { value: n, selected: n === pick }, n)));
  const w = (data.worlds || []).find(x => x.name === pick);
  if (w) {
    const items = Object.entries(w.routes).sort((a, b) => b[1].count - a[1].count).map(([name, e]) => ({
      name, value: e.count, sub: Object.keys(e.species).map(speciesName).join(', '),
    }));
    return card('navy', 'Encounters by route', el('div', { class: 'note' }, 'World: ', sel), rows(items, 'Route', 'Count'),
      el('div', { class: 'note' }, 'From the game’s own encounter file for this world.'));
  }
  const mons = ((data.owned || {})[pick] || { mons: [] }).mons.filter(m => !m.egg && arrival(m) === 'found');
  const by = {};
  for (const m of mons) { const g = (by[m.loc] ||= { n: 0, sp: {} }); g.n++; g.sp[m.species] = (g.sp[m.species] || 0) + 1; }
  const items = Object.entries(by).sort((a, b) => b[1].n - a[1].n).map(([loc, g]) => ({
    name: placeName(+loc), value: g.n, sub: Object.keys(g.sp).slice(0, 8).map(speciesName).join(', '),
  }));
  return card('navy', 'Where your Pokémon were caught', el('div', { class: 'note' }, 'World: ', sel),
    items.length ? rows(items, 'Place', 'Caught') : el('div', { class: 'empty' }, 'No wild-caught Pokémon found in this world’s save.'),
    el('div', { class: 'note' }, 'This world has no encounter file (the game only writes one for runs with the first-encounter rule), so this lists where the Pokémon in its boxes and party were caught. A floor: Pokémon you released or traded are not counted.'));
}

function sessions() {
  const worlds = data.knownWorlds || [];
  const body = [...visible()].reverse().map(s => {
    const sel = el('select', { onchange: async e => {
      await window.stats.tag(s.file, e.target.value);
      if (e.target.value) data.tags[s.file] = e.target.value; else delete data.tags[s.file];
      renderAll();
    } }, el('option', { value: '' }, 'Unassigned'),
      worlds.map(n => el('option', { value: n, selected: data.tags[s.file] === n }, n)));
    return el('tr', {},
      el('td', {}, s.started ? new Date(s.started).toLocaleString() : s.file),
      el('td', {}, sel),
      ...[dur(s.seconds), s.wild, s.battles, s.catches, s.faints].map(v => el('td', { class: 'num' }, typeof v === 'number' ? fmt(v) : v)));
  });
  const untagged = data.sessions.filter(s => !data.tags[s.file]);
  const bulk = untagged.length ? el('div', { class: 'note' }, `${untagged.length} unassigned. Assign all to: `,
    el('select', { onchange: async e => {
      if (!e.target.value) return;
      await window.stats.tagMany(untagged.map(s => s.file), e.target.value);
      await refresh();
    } }, el('option', { value: '' }, 'Pick a world'), worlds.map(n => el('option', { value: n }, n)))) : null;
  return card('grey', 'Play sessions', bulk,
    el('table', {},
      el('thead', {}, el('tr', {}, ['Started', 'World', 'Length', 'Wild', 'Battles', 'Caught', 'Faints'].map((h, i) => el('th', { class: i > 1 ? 'num' : '' }, h)))),
      el('tbody', {}, body)),
    el('div', { class: 'note' }, 'The logs do not record the world. While this app is open, the session you are playing is tagged with your active world automatically. Older sessions need a one-time pick. Saved in this app only.'));
}
