// Collection tab: Pokédex (Sinnoh / National / PT) and the Item Dex.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// Pokédex grid. Numbers are the game's own (they differ from the standard Pokédex), and the icon is the game's icon for that number.
// The game's species number IS the position on its icon sheet (32 icons per row). Numbers 494-511 are unused, the newer
// species start at 512, and the sheet ends at 774.
const DEX_MAX = 774;
const MEGA_FROM = 631, MEGA_TO = 729;   // Mega forms sit in this range of the game's numbers; hidden from the grid for now
const isSlot = id => id <= 493 || id >= 512;
let icons = null, dexSort = 'dex', dexFilter = 'all', dexQuery = '', dexWorld = null;
// The Pokédex has three sections: Sinnoh (the regional dex of Platinum, in its own numbering), National (the original 1-493) and PT (every species).
let dexSection = 'pt';
const cellOf = id => id;   // icon sheet: 32 per row, 32px cells; the cell is the species number itself
const named = id => !!((data && data.speciesNames) || {})[id];

// Species you hold a shiny of show the game's shiny front sprite (cells 0-749 of its sheet) once that sheet has loaded.
let shinySheetReady = false;
function shinyIcon(id) {
  return el('div', { class: 'fico', style: `background-position:-${(id % 25) * 96}px -${Math.floor(id / 25) * 96}px` });
}
function dexIcon(id) {
  const c = cellOf(id), col = c % 32, row = Math.floor(c / 32);
  return el('div', { class: 'ico', style: `background-position:-${col * 96}px -${row * 96}px` });
}

function species() {
  const t = totals(visible());
  // The game's own Pokédex (from the save) for one world. Species 1-493 only; above that the grid relies on the logs.
  const dexNames = Object.keys(data.dex || {});
  const dexPick = dexNames.includes(dexWorld) ? dexWorld : (dexNames.includes(data.activeWorld) ? data.activeWorld : dexNames[0]);
  const game = dexPick ? data.dex[dexPick] : null;
  const gameSeen = new Set(game ? game.seen : []), gameCaught = new Set(game ? game.caught : []);
  // Species found among the Pokémon stored in that world's save (boxes and party). A floor, not the full list.
  const ownedMap = (data.owned && dexPick && data.owned[dexPick]) ? data.owned[dexPick].counts : {};
  const shinyMap = {}, sg = spawnReport().bySpecies;
  for (const m of ((data.owned || {})[dexPick] || { mons: [] }).mons) if (m.shiny && !m.egg) shinyMap[m.species] = (shinyMap[m.species] || 0) + 1;
  const ids = new Set([...Array.from({ length: DEX_MAX }, (_, i) => i + 1), ...Object.keys(t.species).map(Number)]);
  const entries = [...ids].filter(id => (id < MEGA_FROM || id > MEGA_TO) && (isSlot(id) || t.species[id])).map(id => {
    const s = t.species[id];
    return {
      id, name: speciesName(id), known: named(id), seen: s ? s.count : 0, caught: t.caught[id] || 0, min: s ? s.min : 0, max: s ? s.max : 0,
      inCaught: gameCaught.has(id), inSeen: gameSeen.has(id) || gameCaught.has(id), owned: ownedMap[id] || 0, shiny: shinyMap[id] || 0, spark: (sg[id] || {}).spark || 0, glob: (sg[id] || {}).glob || 0, vias: (sg[id] || {}).vias || {},
    };
  });
  const isSeen = e => e.seen || e.caught || e.inSeen || e.owned;
  // which species belong to the chosen section, and the number each is shown under
  const sinnoh = Array.isArray(data.sinnoh) ? data.sinnoh : null;
  if (dexSection === 'sinnoh' && !sinnoh) dexSection = 'pt';
  const regional = new Map((sinnoh || []).map((nat, i) => [nat, i + 1]));
  const inSection = e => (dexSection === 'sinnoh' ? regional.has(e.id) : dexSection === 'national' ? e.id <= 493 : true);
  const numOf = e => (dexSection === 'sinnoh' ? regional.get(e.id) : e.id);
  const pool = entries.filter(inSection);
  const sectionTitle = { sinnoh: 'Sinnoh Pokédex', national: 'National Pokédex', pt: 'PT Pokédex' }[dexSection];

  const grid = el('div', { class: 'dexgrid' });
  const stats = el('span', { class: 'dexstat' });
  // Each card is built once and reused: toggling Seen/All, sorting and searching only show, hide and reorder the same nodes.
  const built = new Map();
  const cardFor = e => {
    let c = built.get(e.id);
    if (c) return c;
    c = el('div', { class: 'dexcard' + (isSeen(e) ? '' : ' unseen') + (e.shiny ? ' shiny' : '') },
      el('span', { class: 'no', title: dexSection === 'sinnoh' ? `National #${String(e.id).padStart(3, '0')}` : '' }, '#' + String(numOf(e)).padStart(3, '0'), e.spark ? el('span', { class: 'sparkmark', title: 'Found in sparkly grass' }, '❋') : null, e.glob ? el('span', { class: 'globmark', title: `Not caught here: ${Object.keys(e.vias).join(', ')}` }, '⇄') : null),
      e.seen ? el('span', { class: 'cnt' }, '×' + fmt(e.seen)) : null,
      e.shiny && shinySheetReady && e.id < 750 ? shinyIcon(e.id) : dexIcon(e.id),
      e.shiny ? el('span', { class: 'shinystar', title: `${e.shiny} shiny in your boxes or party` }, e.shiny > 1 ? `✦ ${e.shiny}` : '✦') : null,
      e.inCaught || e.owned ? el('span', { class: 'ball', title: e.inCaught ? 'Caught in game' : 'In your boxes or party' }) : null,
      // Numbers above 493 have no confirmed name, so seen ones take a name typed right on the card.
      e.id > 493 && (e.seen || e.caught || e.owned)
        ? el('input', { class: 'nameinput', type: 'text', maxLength: 40, placeholder: 'Name it…', value: ((data.customNames || {})[e.id]) || '',
            onchange: async ev => { await window.stats.nameSpecies(e.id, ev.target.value); await refresh(); } })
        : el('div', { class: 'nmx' }, e.known ? e.name : '???'),
      isSeen(e) ? el('div', { class: 'meta' }, [
        e.seen ? `Lv ${e.min}–${e.max}` : '',
        e.caught ? `caught ${e.caught} in logs` : '',
        e.owned ? `own ×${e.owned}` : '',
        e.spark ? `sparkly grass ×${e.spark}` : '',
        ...Object.entries(e.vias).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)),
        !e.seen && !e.caught && !e.owned ? (e.inCaught ? 'caught in game' : 'seen in game') : '',
      ].filter(Boolean).join(' · ')) : null);
    built.set(e.id, c);
    return c;
  };
  const draw = () => {
    const q = dexQuery.trim().toLowerCase().replace(/^#/, '');
    let list = pool.filter(e => (dexFilter === 'all' || (dexFilter === 'seen' ? isSeen(e) : dexFilter === 'shiny' ? e.shiny > 0 : dexFilter === 'spark' ? e.spark > 0 : dexFilter === 'glob' ? e.glob > 0 : !isSeen(e))) && (!q || e.name.toLowerCase().includes(q) || String(numOf(e)) === q || String(numOf(e)).padStart(3, '0').includes(q)));
    const byName = (a, b) => (a.known === b.known ? a.name.localeCompare(b.name) : a.known ? -1 : 1);
    const sorters = {
      dex: (a, b) => numOf(a) - numOf(b),
      seen: (a, b) => b.seen - a.seen || numOf(a) - numOf(b),
      caught: (a, b) => (b.inCaught || b.owned ? 1 : 0) - (a.inCaught || a.owned ? 1 : 0) || b.owned - a.owned || b.caught - a.caught || b.seen - a.seen || numOf(a) - numOf(b),
      level: (a, b) => b.max - a.max || numOf(a) - numOf(b),
      name: byName,
    };
    list = list.sort(sorters[dexSort]);
    // numbers first: seen out of the section's total (highlighted), then caught and owned
    const seenN = pool.filter(isSeen).length, caughtN = pool.filter(e => e.inCaught || e.owned).length, ownedN = pool.filter(e => e.owned).length;
    const stat = (v, l, hl) => el('span', { class: 'ds' + (hl ? ' hl' : '') }, el('b', {}, v), el('small', {}, l));
    stats.replaceChildren(stat(`${seenN}/${pool.length}`, 'seen', true), stat(String(pool.length - seenN), 'missing'), stat(String(caughtN), 'caught'), stat(String(ownedN), 'own'), stat(String(pool.filter(e => e.shiny).length), 'shiny'), stat(String(pool.filter(e => e.spark).length), 'sparkly'));
    grid.replaceChildren(...(list.length ? list.map(cardFor)
      : [el('div', { class: 'empty dexempty' }, dexFilter === 'missing' && !dexQuery ? 'Nothing missing. Every species is seen.' : dexFilter === 'shiny' && !dexQuery ? 'No shiny Pokémon in this save.' : dexFilter === 'spark' && !dexQuery ? 'No sparkly-grass finds in this save.' : dexFilter === 'glob' && !dexQuery ? 'Nothing here came from elsewhere.' : 'Nothing matches.')]));
  };
  const sortSel = el('select', { onchange: e => { dexSort = e.target.value; draw(); } },
    [['dex', 'Pokédex number'], ['seen', 'Most seen'], ['caught', 'Most caught'], ['level', 'Highest level'], ['name', 'Name A–Z']]
      .map(([v, l]) => el('option', { value: v, selected: dexSort === v }, l)));
  const toggle = el('div', { class: 'seg' },
    ...[['all', 'All'], ['seen', 'Seen'], ['missing', 'Missing'], ['shiny', 'Shiny ✦'], ['spark', 'Sparkly grass ❋'], ['glob', 'Not caught here ⇄']].map(([v, l]) => el('button', { class: dexFilter === v ? 'on' : '', onclick: e => {
      dexFilter = v;
      e.target.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target));
      draw();
    } }, l)));
  const search = el('input', { type: 'search', placeholder: 'Search name or number', value: dexQuery, oninput: e => { dexQuery = e.target.value; draw(); } });
  const worldSel = dexNames.length > 1 ? el('select', { title: 'Whose in-game Pokédex to show', onchange: e => { dexWorld = e.target.value; renderAll(); } },
    dexNames.map(n => el('option', { value: n, selected: n === dexPick }, `Dex: ${n}`))) : null;
  const sections = el('div', { class: 'seg' }, ...[...(sinnoh ? [['sinnoh', 'Sinnoh']] : []), ['national', 'National'], ['pt', 'PT']].map(([v, l]) => el('button', {
    class: dexSection === v ? 'on' : '', title: { sinnoh: 'Sinnoh Pokédex: the 210 species of Platinum’s regional Pokédex', national: 'National Pokédex: the original 493', pt: 'PT Pokédex: every species in Platinum Together' }[v],
    onclick: () => { dexSection = v; render(); } }, l)));
  draw();
  return card('black', sectionTitle,
    el('div', { class: 'dexbar' }, sections, worldSel, sortSel, toggle, search, stats),
    grid,
    el('div', { class: 'note' }, 'Caught and seen marks for 1–493 are read from the game’s own save (read-only). Above 493 the game’s record is not read yet; a Poké Ball there means the species is in your boxes or party (found in the save, so at least these), and “own ×N” is how many. ×N is how many times the logs show it. A ✦ marks a species you hold a shiny of, counted from your boxes and party only, so shinies you released are not included. Mega forms (631–729) are hidden for now. For an unnamed number, type its name on the card and press Enter.'));
}

// Item Dex. The game has no item dex, so this one is built from what it can see: the bag in the save, items held by your Pokémon, and
// (from the first time the app looked) every item a world has ever had and the most it held at once.
let itemFilter = 'all', itemQuery = '', itemWorld = null;
function itemIcon(id) {
  const col = id % 32, row = Math.floor(id / 32);
  return el('div', { class: 'iico', style: `background-position:-${col * 64}px -${row * 64}px` });
}
function items() {
  const names = data.itemNames || {}, desc = data.itemDesc || {};
  const worlds = Object.keys(data.bag || {});
  const pick = worlds.includes(itemWorld) ? itemWorld : (worlds.includes(data.activeWorld) ? data.activeWorld : worlds[0]);
  if (!pick) return el('div', { class: 'empty' }, 'No bag was found in a save yet.');
  const have = {}, pocketOf = {}, held = {};
  for (const [pocket, list] of Object.entries(data.bag[pick])) for (const [id, q] of list) { have[id] = (have[id] || 0) + q; pocketOf[id] = pocket; }
  const ow = (data.owned || {})[pick], party = (data.party || {})[pick] || [];
  for (const m of [...(ow ? ow.mons : []), ...party]) if (m.item) { held[m.item] = (held[m.item] || 0) + 1; have[m.item] = (have[m.item] || 0) + 1; }
  const ever = (data.itemsEver || {})[pick] || {};
  const entries = Object.keys(names).map(Number).filter(id => id > 0 && names[id] && !/^[?\s]+$/.test(names[id])).sort((a, b) => a - b).map(id => ({
    id, name: names[id], desc: desc[id] || '', have: have[id] || 0, held: held[id] || 0, max: (ever[id] || [0])[0], pocket: pocketOf[id] || '',
    first: (ever[id] || [])[1] || '',
  }));
  const gotCount = entries.filter(e => e.have || e.max).length;
  const grid = el('div', { class: 'itemgrid' }), stats = el('span', { class: 'dexstat' });
  const built = new Map();
  const cardFor = e => {
    let c = built.get(e.id);
    if (c) return c;
    const got = e.have || e.max;
    c = el('div', { class: 'itemcard' + (got ? '' : ' unseen'), title: `${e.name}\n${e.desc}${e.first ? `\nFirst seen by the app: ${new Date(e.first).toLocaleDateString()}` : ''}` },
      el('span', { class: 'no' }, '#' + e.id),
      e.have ? el('span', { class: 'cnt' }, '×' + fmt(e.have)) : null,
      itemIconsReady ? itemIcon(e.id) : el('div', { class: 'iico' }),
      el('div', { class: 'nmx' }, e.name),
      got ? el('div', { class: 'meta' }, [e.pocket, e.held ? `held by ${e.held}` : '', !e.have && e.max ? `had up to ${fmt(e.max)}` : ''].filter(Boolean).join(' · ')) : null);
    built.set(e.id, c);
    return c;
  };
  const draw = () => {
    const q = itemQuery.trim().toLowerCase().replace(/^#/, '');
    const list = entries.filter(e => (itemFilter === 'all' || (itemFilter === 'have' ? e.have : itemFilter === 'missing' ? !(e.have || e.max) : e.have || e.max)) && (!q || e.name.toLowerCase().includes(q) || String(e.id) === q));
    stats.replaceChildren(el('span', { class: 'ds hl' }, el('b', {}, `${gotCount}/${entries.length}`), el('small', {}, 'found')), el('span', { class: 'ds' }, el('b', {}, String(entries.length - gotCount)), el('small', {}, 'missing')));
    grid.replaceChildren(...(list.length ? list.map(cardFor) : [el('div', { class: 'empty dexempty' }, 'Nothing matches.')]));
  };
  const toggle = el('div', { class: 'seg' }, ...[['all', 'All'], ['have', 'In bag now'], ['ever', 'Ever had'], ['missing', 'Missing']].map(([v, l]) => el('button', { class: itemFilter === v ? 'on' : '', onclick: e => {
    itemFilter = v; e.target.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.target)); draw();
  } }, l)));
  const search = el('input', { type: 'search', placeholder: 'Search item or number', value: itemQuery, oninput: e => { itemQuery = e.target.value; draw(); } });
  const worldSel = worlds.length > 1 ? el('select', { onchange: e => { itemWorld = e.target.value; render(); } }, worlds.map(n => el('option', { value: n, selected: n === pick }, `Bag: ${n}`))) : null;
  draw();
  return card('black', 'Item Dex',
    el('div', { class: 'dexbar' }, worldSel, toggle, search, stats),
    grid,
    el('div', { class: 'note' }, 'The game has no item dex, so this one is built from your bag and from items your Pokémon hold, as read from the save. “Ever had” also counts items you used up, but only from when this app first looked at that world. Hover a card for the item’s description.'));
}
