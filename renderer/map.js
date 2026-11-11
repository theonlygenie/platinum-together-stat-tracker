// Map tab: map data per layer, the canvas map, place list and label editor.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// How each stored Pokémon arrived: caught in the wild, hatched from an egg, given as a gift (Cherish Ball), or somewhere special.
const arrival = m => (m.ball === 16 ? 'gift' : m.eggLoc ? 'hatched' : m.loc >= 2000 ? 'special' : 'found');

function mapData() {
  const src = ivSource(), foundAll = [], hatchedAll = [], gifts = [], special = [];
  for (const m of src.stored) {
    if (m.egg) continue;
    const k = arrival(m);
    if (k === 'found') foundAll.push(m);
    else if (k === 'hatched') hatchedAll.push(m);
    else if (k === 'gift') gifts.push(m);
    else special.push(m);
  }
  // species present in this layer, for the filter; a filter left over from the other layer is dropped
  const st = (data.settings || {})[src.pick];
  const ids = {}; for (const m of src.stored) { const k = `${m.tid}/${m.sid}`; ids[k] = (ids[k] || 0) + 1; }
  const own = (Object.entries(ids).sort((a, b) => b[1] - a[1])[0] || [])[0];   // the trainer ID most of this world's Pokémon carry
  const rareAll = foundAll.filter(m => isRare(spawnClass(m, st, own)));
  if (mapUI.layer === 'sparkly' && !data.spawns) mapUI.layer = 'found';
  const layerAll = mapUI.layer === 'found' ? foundAll : mapUI.layer === 'hatched' ? hatchedAll : rareAll, tally = {};
  const rareBy = {}; for (const m of rareAll) (rareBy[m.loc] ||= []).push(m);
  layerAll.forEach(m => { tally[m.species] = (tally[m.species] || 0) + 1; });
  if (mapUI.species && !tally[mapUI.species]) mapUI.species = null;
  const group = ms => { const g = {}; for (const m of ms) if (!mapUI.species || m.species === mapUI.species) (g[m.loc] ||= []).push(m); return g; };
  return {
    src, byPlace: group(layerAll), rareBy, totals: { found: foundAll.length, hatched: hatchedAll.length, rare: rareAll.length }, gifts, special,
    layerSpecies: Object.entries(tally).map(([s, n]) => [+s, n]).sort((a, b) => b[1] - a[1] || a[0] - b[0]),
  };
}

async function prepareMap() {
  if (mapUI.ready || mapUI.loading) return;
  mapUI.loading = true;
  try {
    const [url, saved] = await Promise.all([window.stats.townMap(), window.stats.mapLoad()]);
    if (!url) { mapUI.error = 'The game folder has no town-map.png.'; return; }
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const seg = segmentMap(cx.getImageData(0, 0, img.width, img.height), { cutY: MAP_ROWS });
    // a saved label is stored against the middle of its piece, so find the piece now sitting nearest to that point
    const assign = {};
    // first run (nothing saved yet): start from the labels matched against a labelled Sinnoh reference map; the game's own map is the authority
    const labels = saved && saved.assign ? saved.assign : SEED_LABELS;
    for (const [key, place] of Object.entries(labels)) {
      const [sx, sy] = key.split(',').map(Number);
      let best = null, bd = 6;
      for (const p of seg.pieces) { const d = Math.hypot(p.cx - sx, p.cy - sy); if (d < bd) { bd = d; best = p; } }
      if (best) assign[best.id] = place;
    }
    Object.assign(mapUI, { img, seg, assign, ready: true, error: '' });
  } catch { mapUI.error = 'Could not load the town map.'; }
  finally { mapUI.loading = false; }
  if (tab === 'map') render();
}

function saveMapLabels() {
  const byId = new Map(mapUI.seg.pieces.map(p => [p.id, p]));
  const out = {};
  for (const [id, place] of Object.entries(mapUI.assign)) { const p = byId.get(+id); if (p) out[`${Math.round(p.cx)},${Math.round(p.cy)}`] = place; }
  window.stats.mapSave(out);
}

const heat = t => { const a = [255, 226, 140], b = [226, 40, 24], k = Math.sqrt(Math.max(0, Math.min(1, t))); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; };

function mapTab() {
  prepareMap();
  if (!mapUI.ready) return el('div', { class: 'empty' }, mapUI.error || 'Loading the town map…');
  const d = mapData(), seg = mapUI.seg;
  const countOf = id => (d.byPlace[id] || []).length;
  const withData = Object.keys(d.byPlace).map(Number);
  const maxCount = Math.max(1, ...withData.map(countOf));
  const placedPlaces = new Set(Object.values(mapUI.assign));

  const canvas = el('canvas', { class: 'townmap' + (mapUI.edit ? ' edit' : '') });
  const tip = el('div', { class: 'maptip' });
  tip.hidden = true;
  const list = el('div', { class: 'maplist' });

  // the edges between neighbouring pieces, found once, so the pieces read as separate stretches
  const edges = [];
  for (let y = 0; y < MAP_ROWS; y++) for (let x = 0; x < seg.W; x++) {
    const l = seg.label[y * seg.W + x];
    if (l < 0) continue;
    const r = x + 1 < seg.W ? seg.label[y * seg.W + x + 1] : -1, b = y + 1 < MAP_ROWS ? seg.label[(y + 1) * seg.W + x] : -1;
    if (r >= 0 && r !== l) edges.push([x, y, l, r]); else if (b >= 0 && b !== l) edges.push([x, y, l, b]);
  }

  const byId = new Map(seg.pieces.map(p => [p.id, p]));
  const draw = () => {
    const Z = MAP_ZOOM, W = seg.W;
    canvas.width = W * Z; canvas.height = MAP_ROWS * Z;
    const x = canvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(mapUI.img, 0, 0, W, MAP_ROWS, 0, 0, W * Z, MAP_ROWS * Z);
    // the picture's outer 20 columns on each side are blank white and are cropped away by the page; paint them with the neighbouring map column so a hairline of white can never show at the edge
    x.drawImage(mapUI.img, 20, 0, 1, MAP_ROWS, 0, 0, 20 * Z, MAP_ROWS * Z);
    x.drawImage(mapUI.img, 235, 0, 1, MAP_ROWS, 236 * Z, 0, (W - 236) * Z, MAP_ROWS * Z);
    const lit = id => id != null && (id === mapUI.hoverPlace || id === mapUI.active);
    for (let i = 0; i < seg.label.length; i++) {
      const l = seg.label[i];
      if (l < 0) continue;
      const place = mapUI.assign[l], n = place == null ? 0 : countOf(place);
      // places with Pokémon get the heat colour; every other road is a quiet pale stripe (unlabelled ones only differ while labelling)
      x.fillStyle = n ? heat(n / maxCount) : (place == null && mapUI.edit ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.62)');
      x.fillRect((i % W) * Z, ((i / W) | 0) * Z, Z, Z);
      if (lit(place) || (l === mapUI.hoverPiece && place == null)) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect((i % W) * Z, ((i / W) | 0) * Z, Z, Z); }
    }
    // a thin seam only where two different places (or a place and an unlabelled piece) meet; none inside one place
    x.fillStyle = mapUI.edit ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.55)';
    for (const [ex, ey, a, b] of edges) if (mapUI.edit || mapUI.assign[a] == null || mapUI.assign[b] == null || mapUI.assign[a] !== mapUI.assign[b]) x.fillRect(ex * Z + 1, ey * Z + 1, Z - 3, Z - 3);
    // outline the place being hovered or picked, so it stands out from its neighbours
    for (let i = 0; i < seg.label.length; i++) {
      const l = seg.label[i], place = mapUI.assign[l];
      if (l < 0 || !lit(place)) continue;
      const px = i % W, py = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nl = (px + dx >= 0 && px + dx < W && py + dy >= 0 && py + dy < MAP_ROWS) ? seg.label[(py + dy) * W + px + dx] : -1;
        if (nl < 0 || mapUI.assign[nl] !== place) { x.fillStyle = '#14110f'; x.fillRect(px * Z + (dx > 0 ? Z - 2 : 0), py * Z + (dy > 0 ? Z - 2 : 0), dx ? 2 : Z, dy ? 2 : Z); }
      }
    }
    // write a place's name on its biggest piece when it is lit, or when it has Pokémon and the piece is big enough to hold the name
    const biggest = {};
    for (const [pid, place] of Object.entries(mapUI.assign)) { const p = byId.get(+pid); if (p && (!biggest[place] || p.size > biggest[place].size)) biggest[place] = p; }
    // a gold star on every place where a sparkly-grass find was made (the number is how many)
    const stars = [];
    for (const [pl, p] of Object.entries(biggest)) { const n = (d.rareBy[pl] || []).length; if (n) stars.push([+pl, p, n]); }
    // labels: the hovered place always, then the busiest places first; a label that would land on another is skipped
    x.font = '700 17px Bahnschrift, "Segoe UI", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const short = id => placeName(id).replace(/^Route /, 'Rt ');
    const cand = Object.entries(biggest).map(([pl, p]) => [+pl, p]).filter(([id]) => lit(id) || countOf(id) > 0)
      .sort((a, b) => (lit(b[0]) - lit(a[0])) || countOf(b[0]) - countOf(a[0]));
    const placed = [], LEFT = 20 * Z, RIGHT = 236 * Z;   // the visible part of the picture
    for (const [id, p] of cand) {
      const name = short(id), tw = x.measureText(name).width, h = 22;
      const tx0 = Math.min(Math.max(p.cx * Z, LEFT + tw / 2 + 6), RIGHT - tw / 2 - 6), ty = p.cy * Z;
      const box = [tx0 - tw / 2 - 4, ty - h / 2, tx0 + tw / 2 + 4, ty + h / 2];
      if (!lit(id) && placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      x.lineWidth = 5; x.strokeStyle = 'rgba(255,255,255,.95)'; x.strokeText(name, tx0, ty);
      x.fillStyle = '#14110f'; x.fillText(name, tx0, ty);
    }
    for (const [, p, n] of stars) {
      const sx = Math.min(Math.max(p.cx * Z + 16, LEFT + 12), RIGHT - 12), sy = p.cy * Z - 16;
      x.beginPath(); x.arc(sx, sy, n > 1 ? 14 : 11, 0, Math.PI * 2); x.fillStyle = '#ffcf3d'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#14110f'; x.stroke();
      x.fillStyle = '#14110f'; x.font = '800 15px Bahnschrift, "Segoe UI", sans-serif'; x.fillText(n > 1 ? `✦${n}` : '✦', sx, sy + 1);
    }
  };

  const pieceAt = e => {
    const r = canvas.getBoundingClientRect(), px = Math.floor(((e.clientX - r.left) / r.width) * seg.W), py = Math.floor(((e.clientY - r.top) / r.height) * MAP_ROWS);
    for (let rad = 0; rad <= 2; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const X = px + dx, Y = py + dy;
      if (X >= 0 && Y >= 0 && X < seg.W && Y < MAP_ROWS && seg.label[Y * seg.W + X] >= 0) return seg.label[Y * seg.W + X];
    }
    return -1;
  };
  const topSpecies = ms => {
    const c = {};
    ms.forEach(m => { const n = speciesName(m.species); c[n] = (c[n] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(', ');
  };

  let rowIds = [];
  const renderList = () => {
    const ids = mapUI.showAll ? Object.keys(PLACES).map(Number) : withData;
    const rows = [...new Set([...ids, ...withData])].sort((a, b) => countOf(b) - countOf(a) || a - b);
    rowIds = rows;
    list.replaceChildren(...rows.map(id => {
      const n = countOf(id), placed = placedPlaces.has(id);
      return el('div', {
        class: 'prow' + (mapUI.active === id ? ' on' : '') + (placed ? '' : ' unplaced'), title: n ? topSpecies(d.byPlace[id]) : '',
        onpointerenter: () => { mapUI.hoverPlace = id; draw(); }, onpointerleave: () => { mapUI.hoverPlace = null; draw(); },
        onclick: mapUI.edit ? () => { mapUI.active = mapUI.active === id ? null : id; draw(); renderList(); } : null,
      }, el('span', { class: 'pn' }, placeName(id), (d.rareBy[id] || []).length && mapUI.layer !== 'sparkly' ? el('span', { class: 'rarebadge', title: `Sparkly grass: ${topSpecies(d.rareBy[id])}` }, `✦ ${d.rareBy[id].length}`) : null), el('span', { class: 'pc' }, n ? String(n) : '–'),
      el('span', { class: 'pt' }, placed ? 'on map' : (mapUI.edit ? 'click to place' : 'not placed')));
    }));
    if (!rows.length) list.append(el('div', { class: 'note' }, mapUI.layer === 'hatched' ? 'No hatched Pokémon were found in the save.' : mapUI.layer === 'sparkly' ? 'No sparkly-grass finds in this save.' : 'No wild catches were found in the save.'));
  };

  canvas.addEventListener('pointermove', e => {
    const l = pieceAt(e), place = l >= 0 ? mapUI.assign[l] : null;
    if (l !== mapUI.hoverPiece || place !== mapUI.hoverPlace) { mapUI.hoverPiece = l; mapUI.hoverPlace = place ?? null; draw(); }
    const r = canvas.getBoundingClientRect(), wr = canvas.parentNode.getBoundingClientRect();
    if (l < 0) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX - wr.left + 14, wr.width - 250)}px`;
    tip.style.top = `${e.clientY - wr.top + 14}px`;
    if (place == null) tip.replaceChildren(...[el('b', {}, 'Not labelled yet'), mapUI.edit && mapUI.active != null ? el('span', {}, `Click to make this ${placeName(mapUI.active)}`) : null].filter(Boolean));
    else { const ms = d.byPlace[place] || [], rs = d.rareBy[place] || []; tip.replaceChildren(...[el('b', {}, placeName(place)), el('span', {}, ms.length ? `${ms.length} ${mapUI.layer === 'hatched' ? 'hatched' : mapUI.layer === 'sparkly' ? 'sparkly' : 'found'} · ${topSpecies(ms)}` : 'Nothing here yet'), rs.length && mapUI.layer !== 'sparkly' ? el('span', {}, `✦ sparkly grass: ${topSpecies(rs)}`) : null].filter(Boolean)); }
  });
  canvas.addEventListener('pointerleave', () => { mapUI.hoverPiece = -1; mapUI.hoverPlace = null; tip.hidden = true; draw(); });
  canvas.addEventListener('click', e => {
    if (!mapUI.edit || mapUI.active == null) return;
    const l = pieceAt(e);
    if (l < 0) return;
    if (mapUI.assign[l] === mapUI.active) delete mapUI.assign[l]; else mapUI.assign[l] = mapUI.active;   // a second click on the same piece removes it
    saveMapLabels();
    placedPlaces.clear(); Object.values(mapUI.assign).forEach(p => placedPlaces.add(p));
    draw(); renderList(); progress();
  });

  const progressEl = el('div', { class: 'note' });
  const progress = () => {
    const done = withData.filter(id => placedPlaces.has(id)).length;
    progressEl.textContent = `${done} of ${withData.length} places with Pokémon are on the map.`;
  };
  const seg2 = (cur, opts, set) => el('div', { class: 'seg light' }, ...opts.map(([v, l]) => el('button', { class: cur === v ? 'on' : '', onclick: () => { set(v); render(); } }, l)));
  const worlds = d.src.worlds;
  const worldSelect = worlds.length > 1 ? el('select', { onchange: e => { dexWorld = e.target.value; render(); } }, worlds.map(n => el('option', { value: n, selected: n === d.src.pick }, `Save: ${n}`))) : null;
  const gifts = d.gifts.length, sp = d.special;
  const ids = {}; sp.forEach(m => { ids[m.loc] = (ids[m.loc] || 0) + 1; });
  const speciesSelect = el('select', { title: 'Show only one species', onchange: e => { mapUI.species = e.target.value ? +e.target.value : null; render(); } },
    el('option', { value: '' }, 'All species'),
    d.layerSpecies.map(([s, n]) => el('option', { value: s, selected: mapUI.species === s }, `${speciesName(s)} (${n})`)));
  // jump to the next place that has Pokémon but no piece of the map yet, so labelling can run down the list
  const nextPlace = () => {
    const order = rowIds.length ? rowIds : withData, start = order.indexOf(mapUI.active);
    for (let k = 1; k <= order.length; k++) {
      const id = order[(start + k + order.length) % order.length];
      if (!placedPlaces.has(id) && countOf(id)) {
        mapUI.active = id; draw(); renderList();
        const row = list.querySelector('.prow.on'); if (row) row.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
  };
  let armed = false;   // clearing needs a second click, so a stray click cannot wipe the labels
  const clearBtn = el('button', { class: 'pill ghost', onclick: e => {
    if (!armed) { armed = true; e.target.textContent = 'Click again to clear all'; setTimeout(() => { armed = false; e.target.textContent = 'Clear all labels'; }, 3500); return; }
    mapUI.assign = {}; mapUI.active = null; saveMapLabels(); render();
  } }, 'Clear all labels');
  draw(); renderList(); progress();

  return el('div', { class: 'mapgrid' },
    el('section', { class: 'tile card c-lime' },
      el('h3', {}, 'Where your Pokémon were found'),
      el('div', { class: 'switches' },
        seg2(mapUI.layer, [['found', 'Caught in the wild'], ['hatched', 'Hatched from eggs'], ...(data.spawns ? [['sparkly', 'Sparkly grass ✦']] : [])], v => { mapUI.layer = v; }),
        el('button', { class: 'pill ' + (mapUI.edit ? '' : 'ghost'), onclick: () => { mapUI.edit = !mapUI.edit; mapUI.active = null; render(); } }, mapUI.edit ? 'Done labelling' : 'Label places')),
      el('div', { class: 'mapbox' }, el('div', { class: 'mapwrap' }, canvas, tip)),
      mapUI.edit ? null : el('div', { class: 'maplegend' }, el('span', {}, 'Fewer'), el('i', {}), el('span', {}, 'More'), d.totals.rare ? el('span', { class: 'rarekey' }, el('b', {}, '✦'), ' sparkly-grass find') : null)),
    el('section', { class: 'tile card c-navy' },
      el('h3', {}, mapUI.layer === 'hatched' ? 'Hatch places' : mapUI.layer === 'sparkly' ? 'Sparkly grass' : 'Places'),
      el('div', { class: 'switches' }, worldSelect, speciesSelect),
      el('div', { class: 'bigstat' }, el('div', {}, el('b', {}, String(d.totals.found)), el('span', {}, 'caught in the wild')),
        el('div', {}, el('b', {}, String(d.totals.hatched)), el('span', {}, 'hatched from eggs'))),
      progressEl,
      mapUI.edit ? el('div', { class: 'switches' }, el('button', { class: 'pill', onclick: nextPlace }, 'Next unplaced place'), clearBtn) : null,
      list,
      mapUI.edit ? el('label', { class: 'note' }, el('input', { type: 'checkbox', checked: mapUI.showAll, onchange: e => { mapUI.showAll = e.target.checked; renderList(); } }), ' Also list places with no Pokémon') : null,
      el('div', { class: 'note' }, `Not on the map: ${gifts} gifts (Cherish Ball)${Object.keys(ids).length ? `, ${Object.entries(ids).map(([id, n]) => `${n} from ${placeName(+id)}`).join(', ')}` : ''}.`)));
}
