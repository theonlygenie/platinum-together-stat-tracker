// Read-only: only ever reads logs/session-*.log and worlds/*/encounters.ini, worlds/*/world-name.txt.
const fs = require('fs');
const path = require('path');

const LINE = /^(\d\d):(\d\d):(\d\d) (\w+)\s+(\w+)\s+(.*)$/;
const WILD = /^shiny chance (\d+) in (\d+) for species (\d+) at level (\d+)/;
const CAUGHT = /^caught battler \d+ slot \d+ species (\d+)/;
const FAINT = /^battler \d+ state 0$/;
const BATTLE_START = /^encounter effect took/;
const THROW = /^ball (\d+) from battler \d+ at battler \d+/;
const EXP_POOL = /foe gives (\d+);/;
const RELOAD = 'going back to the last save';

function parseSession(file) {
  const m = path.basename(file).match(/^session-(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)\.log$/);
  const s = {
    file: path.basename(file),
    mtimeMs: fs.statSync(file).mtimeMs,
    started: m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString() : null,
    seconds: 0, wild: 0, battles: 0, catches: 0, faints: 0,
    throws: 0, exp: 0, foes: 0, reloads: 0,
    shinyExp: 0,   // the shiny chances added up: the number of shinies you would expect from these encounters
    seq: [],       // species of each wild encounter, in the order they happened
    species: {}, caught: {}, balls: {},
    trades: [],    // direct trades with a friend: { gave, got } species numbers
    gts: [],       // species that arrived from the GTS
  };
  let first = null, last = null, day = 0, lastBall = null;
  for (const line of fs.readFileSync(file, 'latin1').split(/\r?\n/)) {
    const l = LINE.exec(line);
    if (!l) continue;
    let t = +l[1] * 3600 + +l[2] * 60 + +l[3] + day * 86400;
    if (last !== null && t < last) { day++; t += 86400; }
    if (first === null) first = t;
    last = t;
    const cat = l[5], msg = l[6];
    if (cat === 'TRADE') { const t = /^traded (\d+) for (\d+)/.exec(msg); if (t) s.trades.push({ gave: +t[1], got: +t[2] }); }
    else if (cat === 'RIFT') { const g = /^GTS: a Pokemon \(species (\d+)\) came to box/.exec(msg); if (g) s.gts.push(+g[1]); }
    if (cat === 'WILD') {
      const w = WILD.exec(msg);
      if (w) {
        s.wild++;
        s.shinyExp += +w[1] / +w[2];
        s.seq.push(+w[3]);
        const e = (s.species[w[3]] ||= { count: 0, levelSum: 0, min: 999, max: 0 });
        e.count++; e.levelSum += +w[4];
        e.min = Math.min(e.min, +w[4]); e.max = Math.max(e.max, +w[4]);
      }
    } else if (cat === 'CATCH') {
      const t = THROW.exec(msg);
      if (t) {
        s.throws++;
        lastBall = t[1];
        (s.balls[lastBall] ||= { throws: 0, caught: 0 }).throws++;
      }
      const c = CAUGHT.exec(msg);
      if (c) {
        s.catches++; s.caught[c[1]] = (s.caught[c[1]] || 0) + 1;
        if (lastBall) (s.balls[lastBall] ||= { throws: 0, caught: 0 }).caught++;
      }
    } else if (cat === 'EXP') {
      const x = EXP_POOL.exec(msg);
      if (x) { s.exp += +x[1]; s.foes++; }
    } else if (cat === 'RESET' && msg === RELOAD) s.reloads++;
    else if (cat === 'FAINT' && FAINT.test(msg)) s.faints++;
    else if (cat === 'BATTLE' && BATTLE_START.test(msg)) s.battles++;
  }
  s.seconds = first === null ? 0 : last - first;
  return s;
}

function parseEncounters(file) {
  const byRoute = {};
  for (const line of fs.readFileSync(file, 'latin1').split(/\r?\n/)) {
    const p = line.trim().split(' ');
    if (p.length < 6) continue;
    const route = p.slice(5).join(' ');
    const e = (byRoute[route] ||= { count: 0, species: {} });
    e.count++;
    e.species[p[1]] = (e.species[p[1]] || 0) + 1;
  }
  return byRoute;
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; }
}

// kit-item-text.txt is plain text: id <tab> name <tab> description ...
function readItemNames(file, desc) {
  const names = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const p = line.replace('\r', '').split('\t');
      if (p.length >= 2 && /^[0-9]+$/.test(p[0])) { names[p[0]] = p[1]; if (desc && p[2]) desc[p[0]] = p[2]; }
    }
  } catch {}
  return names;
}

// The bag in a save. READ-ONLY. Each pocket is a row of 4-byte slots (item number, quantity); an empty slot has item 0.
// Offsets were found by matching runs of plausible slots in this game's saves (first half of the file is the live copy).
const BAG = [['Items', 0x63c, 165], ['Key Items', 0x8d0, 50], ['TMs & HMs', 0x998, 100], ['Mail', 0xb28, 12], ['Medicine', 0xb58, 40],
  ['Berries', 0xbf8, 64], ['Poké Balls', 0xcf8, 15], ['Battle Items', 0xd34, 30]];
function readBag(file, maxId) {
  let buf; try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 0x42000) return null;
  const out = {};
  for (const [name, off, n] of BAG) {
    const list = [];
    for (let i = 0; i < n; i++) {
      const id = buf[off + i * 4] | (buf[off + i * 4 + 1] << 8), q = buf[off + i * 4 + 2] | (buf[off + i * 4 + 3] << 8);
      if (id >= 1 && id <= maxId && q >= 1 && q <= 999) list.push([id, q]);
    }
    out[name] = list;
  }
  return Object.values(out).some(l => l.length) ? out : null;
}

// The trainer card details in a save. READ-ONLY. This game's saves keep the trainer block 0x0C bytes later than the usual Gen 4 layout:
// name at 0x74, then (from 0x84) trainer ID, secret ID, money (4 bytes), gender. Checked against the trainer ID on the party's own Pokémon.
function readTrainer(file) {
  let buf; try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 0x42000) return null;
  const tid = buf.readUInt16LE(0x84), sid = buf.readUInt16LE(0x86), money = buf.readUInt32LE(0x88);
  if (money > 999999) return null;
  // name (0x74), badges (a bit each at 0x8e) and play time (hours 0x96, minutes 0x98) are read the same way, as a backup for world-card.ini
  let name = '';
  for (let i = 0; i < 8; i++) { const c = buf.readUInt16LE(0x74 + i * 2); if (c === 0xffff) break; name += NICK_CHAR(c); }
  let badges = 0; for (let v = buf[0x8e]; v; v >>= 1) badges += v & 1;
  return { tid, sid, money, gender: buf[0x8c] === 1 ? 'F' : 'M', name, badges, hours: buf.readUInt16LE(0x96), minutes: buf[0x98] };
}

// A world's own settings, from its world.ini. READ-ONLY. The file is plain "key=value" lines the game keeps; only the numbers are read
// here (the app turns them into words), because the game's own "Now:" comments are not always kept up to date.
const WORLD_KEYS = ['game_type', 'rules', 'level_caps', 'party', 'lives', 'lives_scope', 'pool_kind', 'pool_type', 'pool_wrong', 'preset', 'random_species',
  'randomize_eggs', 'starter_region', 'challenge_state', 'run_over', 'free_play', 'modern_types', 'double_battles', 'expanded_encounters', 'new_routes',
  'one_hour_day', 'partner_starters', 'start_exp_share', 'skip_tutorials'];
function readWorldSettings(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^([a-z_]+)=(-?[0-9]+)\s*$/.exec(line.replace('\r', ''));
      if (m && WORLD_KEYS.includes(m[1])) out[m[1]] = +m[2];
    }
  } catch { return null; }
  return Object.keys(out).length ? out : null;
}

// The Sinnoh (regional) Pokédex. READ-ONLY. poketool/shinzukan.narc is the game's own list of the regional Pokédex: a count, then the
// national number of each Pokédex entry in regional order (210 of them in Platinum). A .narc file is a small archive; its first file is read.
function readSinnohDex(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString('latin1', 0, 4) !== 'NARC') return null;
    const fat = 0x10, count = b.readUInt16LE(fat + 8);
    if (!count) return null;
    let at = fat + b.readUInt32LE(fat + 4);       // skip the file table
    at += b.readUInt32LE(at + 4);                 // skip the names table, landing on the file data
    const start = at + 8 + b.readUInt32LE(fat + 12), end = at + 8 + b.readUInt32LE(fat + 16);
    const out = [];
    for (let o = start + 2; o + 2 <= end; o += 2) { const v = b.readUInt16LE(o); if (v >= 1 && v <= 493) out.push(v); }
    return out.length >= 100 ? out : null;
  } catch { return null; }
}

// The game's own NPC trades (fielddata/pokemon_trade/fld_trade.narc): four 80-byte records, each starting with the species number you get
// and holding that Pokémon's trainer ID at byte 32. A Pokémon in a save with that trainer ID (and secret ID 0) came from that NPC. READ-ONLY.
function readNpcTrades(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString('latin1', 0, 4) !== 'NARC') return [];
    const fat = 0x10, count = b.readUInt16LE(fat + 8);
    let at = fat + b.readUInt32LE(fat + 4);
    at += b.readUInt32LE(at + 4);
    const out = [];
    for (let i = 0; i < count; i++) {
      const start = at + 8 + b.readUInt32LE(fat + 12 + i * 8), end = at + 8 + b.readUInt32LE(fat + 16 + i * 8);
      if (end - start >= 36) out.push({ species: b.readUInt32LE(start), tid: b.readUInt32LE(start + 32) });
    }
    return out;
  } catch { return []; }
}

// world-card.ini: name, badges, play time, place, ?, party "species.form.?" list, ?  (tab separated)
function readWorldCard(file) {
  try {
    const p = fs.readFileSync(file, 'utf8').split(/\r?\n/)[0].split('\t');
    if (p.length < 6) return null;
    return {
      trainer: p[0], badges: +p[1] || 0, playTime: p[2], place: p[3],
      party: p[5].split(',').map(x => x.split('.')[0]).filter(x => /^\d+$/.test(x)),
    };
  } catch { return null; }
}

// The game's own Pokédex, read from a save file. READ-ONLY: the save is opened to read and never written.
// A Gen 4 Pokédex block starts with the magic 0xBEEFCAFE, then a "caught" bitfield and a "seen" bitfield
// (bit n-1 is species n). The block is at 0x1334 with a backup copy at 0x41334. Only species 1-493 are stored this way.
const DEX_MAGIC = Buffer.from([0xfe, 0xca, 0xef, 0xbe]);
function readSaveDex(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 0x42000) return null;
  for (const at of [0x1334, 0x41334]) {
    if (buf.compare(DEX_MAGIC, 0, 4, at, at + 4) !== 0) continue;
    const bit = (base, n) => (buf[base + ((n - 1) >> 3)] >> ((n - 1) & 7)) & 1;
    const seen = [], caught = [];
    for (let n = 1; n <= 493; n++) {
      if (bit(at + 0x44, n)) seen.push(n);
      if (bit(at + 4, n)) caught.push(n);
    }
    return { seen, caught };
  }
  return null;
}

// Species the player owns, counted from the Pokémon stored in a save. READ-ONLY, like the dex reader above.
// A stored Gen 4 Pokémon is 136 bytes (PID, checksum, 128 encrypted bytes whose decrypted 16-bit sum equals the checksum).
// Boxes are runs of records 136 bytes apart and the party is a run 236 bytes apart; isolated checksum matches are ignored as chance.
// Counts are a floor: the game keeps some Pokémon elsewhere, so this is "at least these".
const BLOCK_POS = [0,1,2,3, 0,1,3,2, 0,2,1,3, 0,2,3,1, 0,3,1,2, 0,3,2,1, 1,0,2,3, 1,0,3,2, 1,2,0,3, 1,2,3,0, 1,3,0,2, 1,3,2,0,
                   2,0,1,3, 2,0,3,1, 2,1,0,3, 2,1,3,0, 2,3,0,1, 2,3,1,0, 3,0,1,2, 3,0,2,1, 3,1,0,2, 3,1,2,0, 3,2,0,1, 3,2,1,0];
// BLOCK_POS lists which original block (A=0..D=3) sits at each stored position, so the stored position of a block is the
// index where it appears (the inverse), not the value at that index.
const blockPos = (sv, block) => { for (let j = 0; j < 4; j++) if (BLOCK_POS[sv * 4 + j] === block) return j; return 0; };
// One stored Pokémon, fully decoded. READ-ONLY. Returns null unless the record's checksum holds. In the four 32-byte blocks:
//   A: species, item, trainer ID and secret ID, experience, EVs     B: moves, then the six IVs packed into one 32-bit number
//   C: the nickname (11 characters)
// Nature is the PID modulo 25, and it is shiny when trainer ID xor secret ID xor both halves of the PID is under 8.
const NICK_CHAR = c => (c >= 0x121 && c <= 0x12a) ? String.fromCharCode(48 + c - 0x121)
  : (c >= 0x12b && c <= 0x144) ? String.fromCharCode(65 + c - 0x12b)
  : (c >= 0x145 && c <= 0x15e) ? String.fromCharCode(97 + c - 0x145) : c === 0xffff ? '' : '';
function decodeMon(buf, off) {
  const u16 = o => buf[o] | (buf[o + 1] << 8);
  const pid = (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
  if (!pid) return null;
  const stored = u16(off + 6);
  let seed = stored, sum = 0;
  const w = [];
  for (let i = 0; i < 64; i++) {
    seed = (Math.imul(seed, 0x41c64e6d) + 0x6073) >>> 0;
    const x = (u16(off + 8 + i * 2) ^ (seed >>> 16)) & 0xffff;
    w.push(x); sum = (sum + x) & 0xffff;
  }
  if (sum !== stored) return null;
  const sv = ((pid & 0x3e000) >> 13) % 24;
  const blk = b => w.slice(blockPos(sv, b) * 16, blockPos(sv, b) * 16 + 16);
  const A = blk(0), B = blk(1), C = blk(2), D = blk(3);
  const iv32 = (B[8] | (B[9] << 16)) >>> 0;
  const bits = s => (iv32 >>> s) & 31;
  return {
    pid, species: A[0], nature: pid % 25, item: A[1], moves: [B[0], B[1], B[2], B[3]],
    tid: A[2], sid: A[3], ot: D.slice(0, 8).map(NICK_CHAR).join(''),   // original trainer: ID, secret ID and name
    // block D: where it was met (a place number), where its egg came from (0 if it was not an egg), the ball, and the level it was met at
    loc: D[12], eggLoc: D[11], ball: D[13] >> 8, mlv: D[14] & 0x7f,
    nick: C.slice(0, 11).map(NICK_CHAR).join(''),
    iv: [bits(0), bits(5), bits(10), bits(20), bits(25), bits(15)],                 // HP, Atk, Def, SpA, SpD, Spe
    ev: [A[8] & 255, A[8] >> 8, A[9] & 255, A[10] & 255, A[10] >> 8, A[9] >> 8],     // same order
    shiny: ((A[2] ^ A[3] ^ (pid >>> 16) ^ (pid & 0xffff)) < 8) ? 1 : 0,
    egg: (iv32 >>> 30) & 1,
  };
}

const ownedCache = new Map();
function readOwned(file) {
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const key = `${st.size}:${st.mtimeMs}`;
  const hit = ownedCache.get(file);
  if (hit && hit.key === key) return hit.value;
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 0x42000) return null;
  const u16 = o => buf[o] | (buf[o + 1] << 8);
  const u32 = o => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  const half = 0x40000;                       // the second half is the game's backup copy
  const hits = [];
  for (let off = 0; off + 136 <= half; off++) {
    if (u32(off) === 0) continue;
    const stored = u16(off + 6);
    let seed = stored, sum = 0;
    for (let i = 0; i < 64; i++) {
      seed = (Math.imul(seed, 0x41c64e6d) + 0x6073) >>> 0;
      sum = (sum + ((u16(off + 8 + i * 2) ^ (seed >>> 16)) & 0xffff)) & 0xffff;
    }
    if (sum === stored) hits.push(off);
  }
  const inRun = new Set();
  for (const [stride, min] of [[136, 3], [236, 2]]) {
    let run = [];
    const flush = () => { if (run.length >= min) run.forEach(o => inRun.add(o)); run = []; };
    for (const h of hits) {
      if (run.length && h - run[run.length - 1] === stride) run.push(h);
      else { flush(); run = [h]; }
    }
    flush();
  }
  const counts = {}, mons = [];
  for (const off of [...inRun].sort((a, b) => a - b)) {
    const m = decodeMon(buf, off);
    if (!m || m.species <= 0 || m.species >= 2000) continue;
    counts[m.species] = (counts[m.species] || 0) + 1;
    mons.push(m);
  }
  // every record in the live half with a valid checksum and species, in a run or not: used only to tell that a Pokémon is still in the save
  const all = [];
  for (const off of hits) {
    const m = decodeMon(buf, off);
    if (m && ((m.species >= 1 && m.species <= 493) || (m.species >= 512 && m.species <= 774))) all.push(m.pid);
  }
  const value = { counts, total: inRun.size, mons, all };
  ownedCache.set(file, { key, value });
  return value;
}

// The party in a save. READ-ONLY. The party is up to six 236-byte records in a row; each starts with the same 136 bytes as a box
// Pokémon (so the same checksum test applies) followed by a tail, encrypted with a generator seeded by the PID, that holds the level and HP.
// In this game's saves the party starts at 0xAC; if that does not hold, look for a valid record nearby.
function readParty(file) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return null; }
  if (buf.length < 0x1000) return null;
  const u16 = o => buf[o] | (buf[o + 1] << 8);
  const u32 = o => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  const record = off => {
    const m = decodeMon(buf, off);
    if (!m) return null;
    let s2 = m.pid;
    const tail = [];
    for (let k = 0; k < 5; k++) { s2 = (Math.imul(s2, 0x41c64e6d) + 0x6073) >>> 0; tail.push((u16(off + 0x88 + k * 2) ^ (s2 >>> 16)) & 0xffff); }
    return { ...m, level: tail[2] & 0xff, hp: tail[3], maxHp: tail[4] };
  };
  let start = 0xac;
  if (!record(start)) {
    start = -1;
    for (let off = 0x20; off < 0x400; off++) if (record(off)) { start = off; break; }
    if (start < 0) return null;
  }
  const party = [];
  for (let i = 0; i < 6; i++) { const m = record(start + i * 236); if (!m) break; party.push(m); }
  return party;
}

// archiveDir (optional) is the app's own folder of kept copies of session logs. A log that is in both places is read once, from
// whichever copy is bigger (the game's live log grows; a kept copy is what survives if the game later removes it).
// Parsing a file is only redone when the file has changed (its size or modified time). The app refreshes every 15 seconds, and
// nearly every log, save and encounter file is the same each time; only the log being played right now grows.
const fileCache = new Map();
function cached(kind, file, fn) {
  let st;
  try { st = fs.statSync(file); } catch { return fn(file); }
  const key = kind + '|' + file, stamp = st.size + ':' + st.mtimeMs, hit = fileCache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const value = fn(file);
  fileCache.set(key, { stamp, value });
  return value;
}

function load(gameDir, archiveDir) {
  const out = { gameDir, sessions: [], worlds: [], missing: false };
  const logDir = path.join(gameDir, 'logs');
  if (!fs.existsSync(logDir)) {
    // what a game folder should hold, so the first-run guide can say what is missing
    const has = n => { try { return fs.existsSync(path.join(gameDir, n)); } catch { return false; } };
    out.missing = true; out.found = { exists: has(''), exe: has('Platinum.exe'), logs: false, save: has('save.bin'), worlds: has('worlds') };
    return out;
  }
  const logs = new Map();
  const isLog = f => /^session-.*\.log$/.test(f);
  for (const f of fs.readdirSync(logDir).filter(isLog)) logs.set(f, path.join(logDir, f));
  if (archiveDir && fs.existsSync(archiveDir)) {
    for (const f of fs.readdirSync(archiveDir).filter(isLog)) {
      const mine = path.join(archiveDir, f), cur = logs.get(f);
      try { if (!cur || fs.statSync(mine).size > fs.statSync(cur).size) logs.set(f, mine); } catch {}
    }
  }
  for (const f of [...logs.keys()].sort()) {
    try { out.sessions.push(cached('session', logs.get(f), parseSession)); } catch {}
  }
  const dirs = [{ name: readText(path.join(gameDir, 'world-name.txt')) || 'Active world', dir: gameDir }];
  const wd = path.join(gameDir, 'worlds');
  if (fs.existsSync(wd)) {
    for (const d of fs.readdirSync(wd)) {
      const full = path.join(wd, d);
      if (fs.existsSync(path.join(full, 'encounters.ini'))) {
        dirs.push({ name: readText(path.join(full, 'world-name.txt')) || `World ${d}`, dir: full });
      }
    }
  }
  for (const { name, dir } of dirs) {
    const f = path.join(dir, 'encounters.ini');
    if (fs.existsSync(f)) {
      try { out.worlds.push({ name, routes: cached('enc', f, parseEncounters) }); } catch {}
    }
  }
  const names = new Set(dirs.map(d => d.name));
  for (const base of [wd, path.join(wd, 'deleted')]) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      const n = readText(path.join(base, d, 'world-name.txt'));
      if (n) names.add(n);
    }
  }
  out.knownWorlds = [...names].sort((a, b) => a.localeCompare(b));
  // The in-game Pokédex of each world: the root save is the active world, worlds/N/save.bin are the others.
  out.dex = {};
  const saves = [{ name: readText(path.join(gameDir, 'world-name.txt')) || 'Active world', file: path.join(gameDir, 'save.bin') }];
  if (fs.existsSync(wd)) {
    for (const d of fs.readdirSync(wd)) {
      const f = path.join(wd, d, 'save.bin');
      if (fs.existsSync(f)) saves.push({ name: readText(path.join(wd, d, 'world-name.txt')) || `World ${d}`, file: f });
    }
  }
  out.owned = {};
  out.party = {};
  out.bag = {};
  out.trainer = {};
  for (const s of saves) {
    const dx = cached('dex', s.file, readSaveDex);
    if (dx && !out.dex[s.name]) {
      out.dex[s.name] = dx;
      const ow = readOwned(s.file); if (ow) out.owned[s.name] = ow;
      const pa = cached('party', s.file, readParty); if (pa && pa.length) out.party[s.name] = pa;
      const bg = cached('bag', s.file, f => readBag(f, 700)); if (bg) out.bag[s.name] = bg;
      const tr = cached('trainer', s.file, readTrainer); if (tr) out.trainer[s.name] = tr;
    }
  }
  out.settings = {};
  for (const { name, dir } of dirs) { if (!out.settings[name]) { const st = cached('world', path.join(dir, 'world.ini'), readWorldSettings); if (st) out.settings[name] = st; } }
  // worlds the game has since deleted still show their rules (newest copy of each name wins); listed in out.goneWorlds
  out.goneWorlds = [];
  const delDir = path.join(wd, 'deleted');
  if (fs.existsSync(delDir)) {
    for (const d of fs.readdirSync(delDir).sort().reverse()) {
      const n = readText(path.join(delDir, d, 'world-name.txt'));
      if (!n || out.settings[n]) continue;
      const st = cached('world', path.join(delDir, d, 'world.ini'), readWorldSettings);
      if (st) { out.settings[n] = st; out.goneWorlds.push(n); }
    }
  }
  out.sinnoh = cached('sinnoh', path.join(gameDir, 'poketool', 'shinzukan.narc'), readSinnohDex);
  out.npcTrades = cached('npc', path.join(gameDir, 'fielddata', 'pokemon_trade', 'fld_trade.narc'), readNpcTrades);
  out.itemDesc = {};
  out.itemNames = readItemNames(path.join(gameDir, 'kit-item-text.txt'), out.itemDesc);
  out.worldCard = readWorldCard(path.join(gameDir, 'world-card.ini'));
  return out;
}

module.exports = { load };
