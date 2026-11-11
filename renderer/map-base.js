// Map: image segmentation, place names and the map UI state.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// Split the orange route network on the town map into pieces: junction areas (towns and crossings) and the stretches between them.
// Steps: find the orange pixels, thin them to a one-pixel skeleton, mark junctions on it, cut the skeleton at the junctions,
// and give every orange pixel the label of its nearest skeleton piece.
function segmentMap(img, opts = {}) {
  const W = img.width, H = img.height, d = img.data, cutY = opts.cutY || 166;
  const N = W * H, at = (x, y) => y * W + x;
  const path = new Uint8Array(N);
  for (let y = 0; y < cutY; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (r > 215 && g > 105 && g < 195 && b < 125 && r - g > 40) path[at(x, y)] = 1;
  }

  // Zhang-Suen thinning
  const sk = Uint8Array.from(path);
  const nb = (x, y) => [sk[at(x, y - 1)], sk[at(x + 1, y - 1)], sk[at(x + 1, y)], sk[at(x + 1, y + 1)], sk[at(x, y + 1)], sk[at(x - 1, y + 1)], sk[at(x - 1, y)], sk[at(x - 1, y - 1)]];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const kill = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!sk[at(x, y)]) continue;
        const p = nb(x, y), B = p.reduce((a, b) => a + b, 0);
        if (B < 2 || B > 6) continue;
        let A = 0; for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) A++;
        if (A !== 1) continue;
        if (pass === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6])) continue;
        kill.push(at(x, y));
      }
      if (kill.length) { changed = true; kill.forEach(i => { sk[i] = 0; }); }
    }
  }

  // junctions: skeleton pixels where three or more branches meet
  const junction = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!sk[at(x, y)]) continue;
    const p = nb(x, y); let A = 0; for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) A++;
    if (A >= 3) junction[at(x, y)] = 1;
  }
  // grow each junction a little so a crossing becomes one town-sized node
  const R = opts.nodeRadius ?? 3, node = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (junction[at(x, y)])
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < W && Y < H && path[at(X, Y)] && dx * dx + dy * dy <= R * R + 1) node[at(X, Y)] = 1;
    }

  const label = new Int32Array(N).fill(-1), pieces = [];
  const flood = (start, ok, id) => {   // 8-connected component of pixels where ok(i) is true
    const q = [start]; label[start] = id; let n = 0;
    while (q.length) {
      const i = q.pop(); n++;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = at(X, Y);
        if (label[j] === -1 && ok(j)) { label[j] = id; q.push(j); }
      }
    }
    return n;
  };
  for (let i = 0; i < N; i++) if (node[i] && label[i] === -1) { const id = pieces.length; pieces.push({ id, type: 'node' }); flood(i, j => node[j], id); }
  const nodeCount = pieces.length;
  for (let i = 0; i < N; i++) if (sk[i] && !node[i] && label[i] === -1) {
    const id = pieces.length; pieces.push({ id, type: 'edge' });
    const n = flood(i, j => sk[j] && !node[j], id); pieces[id].skel = n;
  }

  // every other orange pixel takes the label of the nearest skeleton or node pixel
  const q = []; for (let i = 0; i < N; i++) if (label[i] !== -1) q.push(i);
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const j = at(X, Y); if (path[j] && label[j] === -1) { label[j] = label[i]; q.push(j); }
    }
  }
  // orange pixels the skeleton missed (small islands) become pieces of their own
  for (let i = 0; i < N; i++) if (path[i] && label[i] === -1) { const id = pieces.length; pieces.push({ id, type: 'spot' }); flood(i, j => path[j] && label[j] === -1, id); }
  // the light-blue discs are the lakes
  const isLake = j => { const k = j * 4; return Math.abs(d[k] - 139) < 6 && Math.abs(d[k + 1] - 213) < 6 && Math.abs(d[k + 2] - 255) < 6 && ((j / W) | 0) < cutY; };
  for (let i = 0; i < N; i++) if (label[i] === -1 && isLake(i)) {
    const id = pieces.length; pieces.push({ id, type: 'lake' });
    const n = flood(i, j => label[j] === -1 && isLake(j), id);
    if (n < 40) { for (let j = 0; j < N; j++) if (label[j] === id) label[j] = -1; pieces.pop(); }
  }
  // measure the pieces
  const stat = pieces.map(() => ({ n: 0, sx: 0, sy: 0 }));
  for (let i = 0; i < N; i++) if (label[i] >= 0) { const s = stat[label[i]]; s.n++; s.sx += i % W; s.sy += (i / W) | 0; }
  pieces.forEach((p, k) => { p.size = stat[k].n; p.cx = stat[k].n ? stat[k].sx / stat[k].n : 0; p.cy = stat[k].n ? stat[k].sy / stat[k].n : 0; });
  return { W, H, label, pieces: pieces.filter(p => p.size > 0), path, skeleton: sk, nodeCount };
}


// ---------------------------------------------------------------------------------------------------------------------------
// Map tab: where your Pokémon were found, lit up on the game's own town map.
// The place numbers come from the save, the names from the game's place table. Which stretch of road is which place is not in
// any file, so you label it once: pick a place, click its piece of the map, and the labels are kept in the settings folder.
// ---------------------------------------------------------------------------------------------------------------------------
const PLACES = {
  0: 'Mystery Zone', 1: 'Twinleaf Town', 2: 'Sandgem Town', 3: 'Floaroma Town', 4: 'Solaceon Town', 5: 'Celestic Town', 6: 'Jubilife City',
  7: 'Canalave City', 8: 'Oreburgh City', 9: 'Eterna City', 10: 'Hearthome City', 11: 'Pastoria City', 12: 'Veilstone City', 13: 'Sunyshore City',
  14: 'Snowpoint City', 15: 'Pokémon League', 35: 'Route 220', 38: 'Route 223', 41: 'Route 226', 45: 'Route 230',
  46: 'Oreburgh Mine', 47: 'Valley Windworks', 48: 'Eterna Forest', 49: 'Fuego Ironworks', 50: 'Mt. Coronet', 51: 'Spear Pillar', 52: 'Great Marsh',
  53: 'Solaceon Ruins', 54: 'Victory Road', 55: 'Pal Park', 56: 'Amity Square', 57: 'Ravaged Path', 58: 'Floaroma Meadow', 59: 'Oreburgh Gate',
  60: 'Fullmoon Island', 61: 'Sendoff Spring', 62: 'Turnback Cave', 63: 'Flower Paradise', 64: 'Snowpoint Temple', 65: 'Wayward Cave',
  66: 'Ruin Maniac Cave', 67: 'Maniac Tunnel', 68: 'Trophy Garden', 69: 'Iron Island', 70: 'Old Chateau', 72: 'Verity Lakefront', 73: 'Valor Lakefront',
  74: 'Acuity Lakefront', 75: 'Spring Path', 76: 'Lake Verity', 77: 'Lake Valor', 78: 'Lake Acuity', 79: 'Newmoon Island', 80: 'Battle Tower',
  81: 'Fight Area', 82: 'Survival Area', 83: 'Resort Area', 84: 'Stark Mountain', 85: 'Seabreak Path', 87: 'Verity Cavern', 88: 'Valor Cavern',
  89: 'Acuity Cavern', 90: 'Jubilife TV', 93: "Trainers' School", 94: 'Oreburgh Mining Museum', 95: 'Floaroma Flower Shop', 96: 'Cycle Shop',
  97: 'Contest Hall', 98: 'Poffin House', 99: 'Foreign Building', 100: 'Pokémon Day Care', 102: 'Veilstone Game Corner', 104: 'Lighthouse',
  105: 'Sunyshore Market', 106: 'Pokémon Mansion', 107: 'Footstep House', 108: 'Café', 109: 'Grand Lake', 110: 'Restaurant', 111: 'Battle Park',
  112: 'Battle Frontier', 113: 'Battle Factory', 114: 'Battle Castle', 115: 'Battle Arcade', 116: 'Battle Hall', 117: 'Distortion World',
  119: 'Villa', 120: 'Battle Café', 121: "Rotom's Room", 123: 'Iron Ruins', 124: 'Iceberg Ruins', 125: 'Rock Peak Ruins',
};
for (let r = 201; r <= 219; r++) PLACES[r - 185] = `Route ${r}`;   // 16 is Route 201 ... 34 is Route 219
Object.assign(PLACES, { 36: 'Route 221', 37: 'Route 222', 39: 'Route 224', 40: 'Route 225', 42: 'Route 227', 43: 'Route 228', 44: 'Route 229' });
// Starting labels, keyed by the middle of each piece of the game's town map ("x,y") -> place number. Matched by eye against a
// labelled reference, so a few joined stretches (e.g. Routes 216/217, 225/230) carry one name; relabel any in Edit mode.
const SEED_LABELS = {
  '185,34': 41, '192,55': 45, '87,76': 9, '108,76': 50, '143,90': 25, '63,101': 3, '143,104': 4, '87,122': 8, '101,118': 23, '122,116': 10,
  '179,119': 29, '56,128': 6, '184,133': 37, '169,144': 11, '47,147': 1, '59,146': 2, '97,36': 32, '186,20': 42, '167,46': 40, '193,41': 43,
  '200,59': 44, '209,106': 38, '68,84': 20, '98,77': 26, '132,78': 26, '87,97': 21, '105,97': 50, '170,96': 12, '143,97': 25, '59,113': 19,
  '72,105': 20, '151,105': 4, '136,116': 24, '94,119': 22, '112,119': 23, '38,124': 33, '169,133': 28, '140,142': 27, '181,125': 29,
  '73,126': 18, '87,133': 59, '59,137': 17, '178,143': 28, '34,141': 72, '53,147': 16, '45,153': 34, '71,159': 35, '46,70': 69,
  '90,12': 78, '174,129': 77, '37,146': 76,
};
const placeName = id => PLACES[id] || (id >= 2000 ? `Special place ${id}` : `Place #${id}`);

const mapUI = { layer: 'found', edit: false, active: null, hoverPlace: null, hoverPiece: -1, assign: {}, seg: null, img: null, ready: false, loading: false, error: '', showAll: false, species: null };
const MAP_ZOOM = 5, MAP_ROWS = 166;   // the picture is 256 wide; below row 166 is the DS screen's menu bar
