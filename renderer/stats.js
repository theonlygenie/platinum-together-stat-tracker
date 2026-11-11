// Stats tab: SVG chart helpers and every analysis card (shiny luck, IVs, natures, activity, funnel ...).
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// ---------------------------------------------------------------------------------------------------------------------------
// Analysis tab: charts that say something a bar cannot. Each one is drawn as plain SVG and says what it means underneath.
// ---------------------------------------------------------------------------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const ACCENT = '#fb5a1f';
const lin = (d0, d1, r0, r1) => v => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
const plotSvg = (w, h) => svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'plot', role: 'img' });
const tx = (str, x, y, o = {}) => svg('text', {
  x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': o.anchor || 'middle', 'font-size': ((o.size || 12) * 1.15).toFixed(1),   // a touch larger: the charts scale down to fit their card
  'font-weight': o.weight || 600, opacity: o.opacity ?? 0.9, fill: o.fill || 'currentColor',
  ...(o.rotate ? { transform: `rotate(${o.rotate} ${x.toFixed(1)} ${y.toFixed(1)})` } : {}),
}, str);
const ln = (x1, y1, x2, y2, o = {}) => svg('line', {
  x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1),
  stroke: o.stroke || 'currentColor', 'stroke-opacity': o.opacity ?? 0.18, 'stroke-width': o.width || 1.2, ...(o.dash ? { 'stroke-dasharray': o.dash } : {}),
});
const pathOf = (pts, o = {}) => svg('path', {
  d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + (o.close ? ' Z' : ''),
  fill: o.fill || 'none', 'fill-opacity': o.fillOpacity ?? 1, stroke: o.stroke || 'none', 'stroke-width': o.width || 2.5,
  'stroke-linejoin': 'round', 'stroke-linecap': 'round', ...(o.dash ? { 'stroke-dasharray': o.dash } : {}),
});
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
const kfmt = v => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(Math.round(v)));
const pctFmt = v => `${Math.round(v * 100)}%`;
// Headline numbers. The player's own figures are big; a third entry of true marks a number that is simply known (a game constant), shown small
// and dim. A "(random: X)" at the end of a label is pulled out as a small reference line under the number.
const bigStats = items => el('div', { class: 'bigstat', style: `--n:${items.length}` }, items.map(([v, l, known]) => {
  let ref = null;
  const m = / \((random[^)]*)\)$/.exec(l);   // a trailing " (random: 15.5)"
  if (m) { l = l.slice(0, m.index); ref = m[1]; }
  return el('div', { class: known ? 'known' : '' }, el('b', {}, v), el('span', {}, l), ref ? el('em', {}, ref) : null);
}));
const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious',
  'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];
const IV_NAMES = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

// small statistics helpers
function erfc(x) {   // complementary error function, accurate to about 1e-7
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const normCdf = z => 0.5 * erfc(-z / Math.SQRT2);
const chiSquareP = (x, df) => 0.5 * erfc(((Math.cbrt(x / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df))) / Math.SQRT2);   // upper tail, Wilson-Hilferty
function wilson(k, n, z = 1.96) {   // 95% interval for a success rate; behaves sensibly at small n and at 0% or 100%
  if (!n) return { p: 0, lo: 0, hi: 1 };
  const p = k / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

// 1. Shiny luck: the chance that at least one shiny should have appeared by now, from the odds the game logs on every encounter
function shinyCard() {
  let n = 0, exp = 0;
  for (const s of visible()) { n += s.wild; exp += s.shinyExp || 0; }
  if (!n || !exp) return card('yellow', 'Shiny luck', el('div', { class: 'note' }, 'No wild encounters with shiny odds in the logs yet.'));
  const p = exp / n, at = k => 1 - Math.pow(1 - p, k);
  const k50 = Math.log(0.5) / Math.log(1 - p), k90 = Math.log(0.1) / Math.log(1 - p);
  const W = 640, H = 300, m = { l: 56, r: 22, t: 26, b: 48 }, xmax = Math.max(k90 * 1.08, n * 1.25);
  const X = lin(0, xmax, m.l, W - m.r), Y = lin(0, 1, H - m.b, m.t);
  const root = plotSvg(W, H);
  for (const g of [0, 0.25, 0.5, 0.75, 1]) root.append(ln(m.l, Y(g), W - m.r, Y(g)), tx(pctFmt(g), m.l - 8, Y(g) + 4, { anchor: 'end', size: 11 }));
  const step = niceStep(xmax / 6);
  for (let v = 0; v <= xmax; v += step) root.append(ln(X(v), H - m.b, X(v), H - m.b + 5, { opacity: 0.5 }), tx(kfmt(v), X(v), H - m.b + 19, { size: 11 }));
  const pts = Array.from({ length: 121 }, (_, i) => { const k = (xmax * i) / 120; return [X(k), Y(at(k))]; });
  root.append(pathOf([[X(0), Y(0)], ...pts, [X(xmax), Y(0)]], { close: true, fill: 'currentColor', fillOpacity: 0.12 }), pathOf(pts, { stroke: 'currentColor', width: 3 }));
  for (const [k, g] of [[k50, 0.5], [k90, 0.9]]) {
    root.append(svg('circle', { cx: X(k).toFixed(1), cy: Y(g).toFixed(1), r: 4.5, fill: 'currentColor' }),
      tx(`${pctFmt(g)} by ~${kfmt(k)}`, X(k) + (X(k) > W * 0.8 ? -10 : 8), Y(g) + (X(k) > W * 0.8 ? -12 : 16), { anchor: X(k) > W * 0.8 ? 'end' : 'start', size: 11, opacity: 0.8 }));
  }
  const here = [X(n), Y(at(n))], left = here[0] > W * 0.6;
  root.append(ln(here[0], H - m.b, here[0], here[1], { stroke: ACCENT, opacity: 1, width: 2, dash: '5 4' }),
    svg('circle', { cx: here[0].toFixed(1), cy: here[1].toFixed(1), r: 7, fill: ACCENT, stroke: 'currentColor', 'stroke-width': 2 }, svg('title', {}, `${fmt(n)} encounters: ${(at(n) * 100).toFixed(1)}%`)),
    tx(`You: ${pctFmt(at(n))} after ${fmt(n)}`, here[0] + (left ? -12 : 12), here[1] + 30, { anchor: left ? 'end' : 'start', size: 13, weight: 700 }),
    tx('Wild encounters', (m.l + W - m.r) / 2, H - 8, { size: 12, opacity: 0.8 }),
    tx('Chance of at least one shiny', 14, (m.t + H - m.b) / 2, { size: 12, opacity: 0.8, rotate: -90 }));
  const savedShiny = (ivSource().stored || []).filter(x => x.shiny).length;
  return card('yellow', 'Shiny luck',
    bigStats([[fmt(n), 'wild encounters'], [pctFmt(at(n)), 'chance of a shiny by now'], [exp.toFixed(2), 'shinies you would expect'], [`1 in ${fmt(Math.round(1 / p))}`, 'odds per encounter', true]]),
    root,
    el('div', { class: 'note' }, `The curve is 1 − (1 − odds)^encounters, using the shiny odds the game logs on every wild encounter. Half of players would have a shiny by about ${kfmt(k50)} encounters.`),
    el('div', { class: 'note' }, `Your save holds ${savedShiny} shiny Pokémon. That counts every source (breeding, trades, gifts), so it isn't comparable to wild encounters alone.`));
}

// 2. Catch rate by ball with a 95% interval, so a rate from 12 throws is not mistaken for a rate from 120
function forestCard() {
  const t = totals(visible());
  const balls = Object.entries(t.balls).sort((a, b) => b[1].throws - a[1].throws).map(([id, b]) => ({
    name: (data.itemNames || {})[id] || `Ball #${id}`, k: b.caught, n: b.throws, ...wilson(b.caught, b.throws),
  }));
  if (!balls.length) return card('lilac', 'Catch rate by ball', el('div', { class: 'note' }, 'No ball throws in the logs yet.'));
  const rowH = 64, W = 640, m = { l: 128, r: 168, t: 30, b: 40 }, H = m.t + m.b + balls.length * rowH;
  const X = lin(0, 1, m.l, W - m.r), root = plotSvg(W, H);
  for (const g of [0, 0.25, 0.5, 0.75, 1]) root.append(ln(X(g), m.t - 8, X(g), H - m.b), tx(pctFmt(g), X(g), H - m.b + 18, { size: 11 }));
  const all = wilson(t.catches, t.throws);
  root.append(ln(X(all.p), m.t - 8, X(all.p), H - m.b, { stroke: 'currentColor', opacity: 0.7, width: 1.8, dash: '5 4' }),
    tx(`all balls ${pctFmt(all.p)}`, X(all.p), m.t - 12, { size: 11, weight: 700 }));
  balls.forEach((b, i) => {
    const y = m.t + i * rowH + rowH / 2;
    root.append(tx(b.name, m.l - 12, y + 4, { anchor: 'end', size: 13, weight: 700 }),
      ln(X(b.lo), y, X(b.hi), y, { opacity: 0.45, width: 9 }),
      svg('circle', { cx: X(b.p).toFixed(1), cy: y.toFixed(1), r: 7, fill: ACCENT, stroke: 'currentColor', 'stroke-width': 2 }, svg('title', {}, `${b.name}: ${b.k}/${b.n}`)),
      tx(`${b.k}/${b.n} · ${pctFmt(b.lo)}–${pctFmt(b.hi)}`, W - m.r + 12, y + 4, { anchor: 'start', size: 12, weight: 600 }));
  });
  root.querySelectorAll('line').forEach(l => { if (l.getAttribute('stroke-width') === '9') l.setAttribute('stroke-linecap', 'round'); });
  const best = [...balls].sort((a, b) => b.p - a.p)[0];
  return card('lilac', 'Catch rate by ball',
    bigStats([[pctFmt(all.p), 'overall success'], [best.name, `best · ${pctFmt(best.p)}`], [String(balls.length), `ball${balls.length === 1 ? '' : 's'} tried`]]), root,
    el('div', { class: 'note' }, 'Dot: success rate. Bar: where the true rate probably lies (95% interval). Where two bars overlap heavily, the data cannot yet tell those balls apart. Bars narrow as you throw more.'));
}

// 3. Species accumulation: how fast new species stop turning up, and how many probably exist (Chao1 estimate)
function accumulationCard() {
  const seq = visible().flatMap(s => s.seq || []);
  if (seq.length < 5) return card('blue', 'How many species are out there?', el('div', { class: 'note' }, 'Not enough wild encounters in the logs yet.'));
  const seen = new Set(), freq = new Map(), curve = [];
  for (const id of seq) { seen.add(id); freq.set(id, (freq.get(id) || 0) + 1); curve.push(seen.size); }
  let f1 = 0, f2 = 0;
  for (const c of freq.values()) { if (c === 1) f1++; else if (c === 2) f2++; }
  const S = seen.size, est = S + (f1 * (f1 - 1)) / (2 * (f2 + 1)), W = 640, H = 300, m = { l: 52, r: 24, t: 28, b: 48 };
  const ymax = Math.max(est * 1.15, S + 3), X = lin(0, seq.length, m.l, W - m.r), Y = lin(0, ymax, H - m.b, m.t), root = plotSvg(W, H);
  const yStep = niceStep(ymax / 5);
  for (let v = 0; v <= ymax; v += yStep) root.append(ln(m.l, Y(v), W - m.r, Y(v)), tx(String(v), m.l - 8, Y(v) + 4, { anchor: 'end', size: 11 }));
  const xStep = niceStep(seq.length / 6);
  for (let v = 0; v <= seq.length; v += xStep) root.append(ln(X(v), H - m.b, X(v), H - m.b + 5, { opacity: 0.5 }), tx(kfmt(v), X(v), H - m.b + 19, { size: 11 }));
  const every = Math.max(1, Math.ceil(seq.length / 240)), pts = [];
  curve.forEach((c, i) => { if (i % every === 0 || i === curve.length - 1) pts.push([X(i + 1), Y(c)]); });
  root.append(pathOf([[X(0), Y(0)], ...pts, [X(seq.length), Y(0)]], { close: true, fill: 'currentColor', fillOpacity: 0.14 }), pathOf(pts, { stroke: 'currentColor', width: 3 }),
    ln(m.l, Y(est), W - m.r, Y(est), { stroke: ACCENT, opacity: 1, width: 2, dash: '6 5' }),
    tx(`estimated total ≈ ${Math.round(est)}`, W - m.r, Y(est) - 8, { anchor: 'end', size: 12, weight: 700, fill: ACCENT }),
    svg('circle', { cx: X(seq.length).toFixed(1), cy: Y(S).toFixed(1), r: 6, fill: ACCENT, stroke: 'currentColor', 'stroke-width': 2 }),
    tx(`${S} seen`, X(seq.length) - 10, Y(S) + 22, { anchor: 'end', size: 12, weight: 700 }),
    tx('Wild encounters, in order', (m.l + W - m.r) / 2, H - 8, { size: 12, opacity: 0.8 }),
    tx('Different species seen', 14, (m.t + H - m.b) / 2, { size: 12, opacity: 0.8, rotate: -90 }));
  return card('blue', 'How many species are out there?',
    bigStats([[String(S), 'species met'], [`≈ ${Math.round(est)}`, 'estimated in these areas'], [pctFmt(S / est), 'of the estimate found'], [String(f1), 'seen only once']]),
    root,
    el('div', { class: 'note' }, `A curve that is still climbing means more species are waiting. The dashed line is the Chao1 estimate: species seen only once (${f1}) or twice (${f2}) hint at how many you have not met yet. It is an estimate, and a floor, not a count.`));
}

// 4 and 5. IVs from the Pokémon stored in the save
let ivPick = null;
function ivSource() {
  const worlds = Object.keys(data.owned || {});
  const pick = worlds.includes(dexWorld) ? dexWorld : (worlds.includes(data.activeWorld) ? data.activeWorld : worlds[0]);
  const o = pick ? data.owned[pick] : null;
  return { pick, worlds, stored: o ? o.mons || [] : [], party: (data.party || {})[pick] || [] };
}

function histChart(counts, expected, labels, W = 440, H = 250) {
  const m = { l: 46, r: 12, t: 18, b: 44 }, n = counts.length, ymax = Math.max(...counts, ...expected, 1) * 1.15, root = plotSvg(W, H);
  const X = i => m.l + (i / n) * (W - m.l - m.r), bw = (W - m.l - m.r) / n, Y = lin(0, ymax, H - m.b, m.t);
  const yStep = niceStep(ymax / 4);
  for (let v = 0; v <= ymax; v += yStep) root.append(ln(m.l, Y(v), W - m.r, Y(v)), tx(String(Math.round(v)), m.l - 8, Y(v) + 4, { anchor: 'end', size: 11 }));
  counts.forEach((c, i) => root.append(svg('rect', { x: (X(i) + 1).toFixed(1), y: Y(c).toFixed(1), width: Math.max(1, bw - 2).toFixed(1), height: Math.max(0, H - m.b - Y(c)).toFixed(1), fill: 'currentColor', 'fill-opacity': 0.55 }, svg('title', {}, `${labels.title(i)}: ${c}`))));
  root.append(pathOf(expected.map((e, i) => [X(i) + bw / 2, Y(e)]), { stroke: ACCENT, width: 3 }));
  for (const [i, str] of labels.ticks) root.append(tx(str, X(i) + bw / 2, H - m.b + 17, { size: 11 }));
  root.append(tx(labels.x, (m.l + W - m.r) / 2, H - 6, { size: 12, opacity: 0.8 }));
  return root;
}

function ivDistCard() {
  const src = ivSource(), mons = src.stored.filter(x => !x.egg);
  if (mons.length < 5) return card('plum', 'IVs of your Pokémon', el('div', { class: 'note' }, 'Not enough stored Pokémon were found in the save.'));
  const values = mons.flatMap(x => x.iv), N = values.length, counts = Array(32).fill(0);
  values.forEach(v => counts[v]++);
  const exp = N / 32, chi2 = counts.reduce((s, c) => s + ((c - exp) ** 2) / exp, 0), p = chiSquareP(chi2, 31);
  const mean = values.reduce((a, b) => a + b, 0) / N, at31 = counts[31] / N;
  const totals6 = mons.map(x => x.iv.reduce((a, b) => a + b, 0)), tb = Array(32).fill(0);
  totals6.forEach(v => tb[Math.min(31, Math.floor(v / 6))]++);
  const sd = Math.sqrt(6 * ((32 * 32 - 1) / 12)), expTot = tb.map((_, i) => {
    const lo = i * 6, hi = Math.min(lo + 5, 186);
    return mons.length * (normCdf((hi + 0.5 - 93) / sd) - normCdf((lo - 0.5 - 93) / sd));
  });
  const single = histChart(counts, Array(32).fill(exp), { x: 'IV value (0–31)', ticks: [0, 5, 10, 15, 20, 25, 31].map(i => [i, String(i)]), title: i => `IV ${i}` });
  const total = histChart(tb, expTot, { x: 'Sum of the six IVs (0–186)', ticks: [0, 5, 10, 15, 20, 25, 31].map(i => [i, String(i * 6)]), title: i => `Total ${i * 6}–${Math.min(186, i * 6 + 5)}` });
  const worldSelect = src.worlds.length > 1 ? el('select', { onchange: e => { dexWorld = e.target.value; ivPick = null; render(); } },
    src.worlds.map(n => el('option', { value: n, selected: n === src.pick }, `Save: ${n}`))) : null;
  return card('plum', 'IVs of your Pokémon', worldSelect,
    bigStats([[String(mons.length), 'Pokémon read'], [mean.toFixed(1), 'average IV (random: 15.5)'], [pctFmt(at31), 'at 31 (random: 3%)'], [String(mons.filter(x => x.iv.every(v => v === 31)).length), 'perfect 6-IV Pokémon']]),
    el('div', { class: 'twoplots' },
      el('div', {}, single, el('div', { class: 'plotcap' }, 'Every IV, compared with the flat line a random spread would give')),
      el('div', {}, total, el('div', { class: 'plotcap' }, 'Total per Pokémon, compared with the bell curve a random spread would give'))),
    el('div', { class: 'note' }, `Bars: your Pokémon. Line: what perfectly random IVs would look like. Bred, hyper-trained or set IVs pile up at 31, as they do here. Based on the ${mons.length} stored Pokémon the scan found, which is not necessarily all of them.`));
}

function ivHexCard() {
  const src = ivSource(), all = src.stored.filter(x => !x.egg);
  if (!all.length) return card('navy', 'IV hexagon', el('div', { class: 'note' }, 'No stored Pokémon were found in the save.'));
  const partyPids = new Set(src.party.map(x => x.pid));
  const list = [...src.party.map(x => ({ ...x, where: 'party' })), ...all.filter(x => !partyPids.has(x.pid)).map(x => ({ ...x, where: 'stored' }))];
  const sel = list.find(x => x.pid === ivPick) || list[0];
  const avg = IV_NAMES.map((_, i) => all.reduce((s, x) => s + x.iv[i], 0) / all.length);
  const W = 400, H = 360, cx = W / 2, cy = 184, R = 112, ang = i => -Math.PI / 2 + (i * Math.PI) / 3;
  const at = (i, v) => [cx + Math.cos(ang(i)) * R * (v / 31), cy + Math.sin(ang(i)) * R * (v / 31)];
  const root = plotSvg(W, H);
  for (const ring of [8, 16, 24, 31]) root.append(pathOf(IV_NAMES.map((_, i) => at(i, ring)), { close: true, stroke: 'currentColor', width: 1.2, fill: 'none' }), svg('title', {}, `${ring}`));
  root.querySelectorAll('path').forEach(el2 => el2.setAttribute('stroke-opacity', '0.22'));
  IV_NAMES.forEach((_, i) => root.append(ln(cx, cy, ...at(i, 31))));
  root.append(pathOf(IV_NAMES.map((_, i) => at(i, avg[i])), { close: true, stroke: 'currentColor', width: 2, dash: '5 4' }),
    pathOf(sel.iv.map((v, i) => at(i, v)), { close: true, fill: ACCENT, fillOpacity: 0.4, stroke: ACCENT, width: 3 }));
  IV_NAMES.forEach((nm, i) => {
    const [lx, ly] = at(i, 31 * 1.2), [vx, vy] = at(i, sel.iv[i]);
    root.append(svg('circle', { cx: vx.toFixed(1), cy: vy.toFixed(1), r: 4.5, fill: ACCENT, stroke: 'currentColor', 'stroke-width': 1.5 }),
      tx(nm, lx, ly - 2, { size: 13, weight: 700 }), tx(String(sel.iv[i]), lx, ly + 14, { size: 13, weight: 600, opacity: 0.85 }));
  });
  const name = sel.nick || speciesName(sel.species), tot = sel.iv.reduce((a, b) => a + b, 0), evTot = sel.ev.reduce((a, b) => a + b, 0);
  const picker = el('select', { onchange: e => { ivPick = +e.target.value; render(); } },
    list.map(x => el('option', { value: x.pid, selected: x.pid === sel.pid }, `${x.where === 'party' ? '★ ' : ''}${x.nick || speciesName(x.species)} · ${speciesName(x.species)}`)));
  return card('navy', 'IV hexagon', picker,
    bigStats([[name, speciesName(sel.species)], [NATURES[sel.nature], 'nature'], [`#${1 + all.filter(x => x.iv.reduce((p, q) => p + q, 0) > tot).length}`, `of ${all.length} by IVs`], [String(evTot), 'EVs trained']]),
    root,
    el('div', { class: 'note' }, `Filled shape: ${name}. Dashed shape: the average of all ${all.length} stored Pokémon. ★ marks your party. A full hexagon is a perfect-IV Pokémon. A dent is an IV left low on purpose, such as 0 Attack on a special attacker.${sel.shiny ? ' This one is shiny.' : ''}`));
}

// 6. When you play: minutes played in each hour of each weekday, from the start and length of every session
function activityCard() {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hourName = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  let total = 0;
  for (const s of visible()) {
    if (!s.started || !s.seconds) continue;
    const start = new Date(s.started).getTime();
    for (let t = 0; t < s.seconds; t += 60) {              // one step per minute of the session
      const d = new Date(start + t * 1000), mins = Math.min(60, s.seconds - t) / 60;
      grid[(d.getDay() + 6) % 7][d.getHours()] += mins; total += mins;
    }
  }
  if (!total) return card('lime', 'When you play', el('div', { class: 'note' }, 'No sessions in the logs yet.'));
  const max = Math.max(...grid.flat()), W = 960, H = 270, m = { l: 56, r: 10, t: 30, b: 14 };
  const cw = (W - m.l - m.r) / 24, ch = (H - m.t - m.b) / 7, root = plotSvg(W, H);
  root.classList.add('fill');
  for (let h = 0; h < 24; h += 3) root.append(tx(hourName(h), m.l + h * cw + cw / 2, m.t - 10, { size: 12, weight: 600 }));
  DAYS.forEach((d, r) => root.append(tx(d, m.l - 10, m.t + r * ch + ch / 2 + 4.5, { anchor: 'end', size: 12, weight: 600 })));
  grid.forEach((row, r) => row.forEach((v, h) => {
    const cell = svg('rect', {
      x: (m.l + h * cw + 1.5).toFixed(1), y: (m.t + r * ch + 1.5).toFixed(1), width: (cw - 3).toFixed(1), height: (ch - 3).toFixed(1), rx: 5,
      fill: v ? 'currentColor' : 'none', 'fill-opacity': v ? (0.16 + 0.84 * Math.sqrt(v / max)).toFixed(2) : 0,
      stroke: 'currentColor', 'stroke-opacity': v ? 0 : 0.12, 'stroke-width': 1,
    }, svg('title', {}, `${DAYS[r]} ${hourName(h)}: ${Math.round(v)} min`));
    root.append(cell);
  }));
  let best = [0, 0];
  grid.forEach((row, r) => row.forEach((v, h) => { if (v > grid[best[0]][best[1]]) best = [r, h]; }));
  const sumHours = (a, b) => grid.reduce((s, row) => s + row.slice(a, b).reduce((x, y) => x + y, 0), 0);
  const weekend = grid[5].concat(grid[6]).reduce((a, b) => a + b, 0);
  return card('lime', 'When you play',
    bigStats([[`${(total / 60).toFixed(1)} h`, 'played in the logs'], [`${DAYS[best[0]]} ${hourName(best[1])}`, 'busiest hour'], [pctFmt(sumHours(18, 24) / total), 'after 6pm'], [pctFmt(weekend / total), 'on weekends']]),
    root,
    el('div', { class: 'note' }, 'Darker means more minutes played in that hour, summed over every session. A session counts from its first to its last log line, so time left idle counts as play.'));
}

// 7. Where the ball throws go: each ball type flowing into caught or got away
function funnelCard() {
  const t = totals(visible());
  const balls = Object.entries(t.balls).sort((a, b) => b[1].throws - a[1].throws).map(([id, b]) => ({
    name: (data.itemNames || {})[id] || `Ball #${id}`, n: b.throws, k: b.caught, a: b.throws - b.caught,
  }));
  if (!t.throws) return card('amber', 'Where the throws go', el('div', { class: 'note' }, 'No ball throws in the logs yet.'));
  const W = 640, gap = 12, pad = 14, H = Math.max(260, balls.length * 52 + 40), xL = 168, xR = W - 190, nodeW = 14, xm = (xL + xR) / 2;
  const scale = (H - 2 * pad - gap * (balls.length - 1)) / t.throws, root = plotSvg(W, H);
  const K = t.catches, A = t.throws - t.catches;
  const outH = (H - 2 * pad - gap) / (K + A || 1);
  const out = { caught: { y: pad, h: K * outH, used: 0 }, away: { y: pad + K * outH + gap, h: A * outH, used: 0 } };
  let y = pad;
  const band = (x0, ya, yb, x1, yc, yd, fill, op) => root.append(svg('path', {
    d: `M${x0} ${ya.toFixed(1)} C${xm} ${ya.toFixed(1)} ${xm} ${yc.toFixed(1)} ${x1} ${yc.toFixed(1)} L${x1} ${yd.toFixed(1)} C${xm} ${yd.toFixed(1)} ${xm} ${yb.toFixed(1)} ${x0} ${yb.toFixed(1)} Z`,
    fill, 'fill-opacity': op,
  }));
  balls.forEach(b => {
    const h = b.n * scale;
    let cursor = y;
    for (const [key, v] of [['caught', b.k], ['away', b.a]]) {
      if (!v) continue;
      const sh = v * scale, oh = v * outH, o = out[key];
      band(xL + nodeW, cursor, cursor + sh, xR, o.y + o.used, o.y + o.used + oh, key === 'caught' ? ACCENT : 'currentColor', key === 'caught' ? 0.6 : 0.22);
      cursor += sh; o.used += oh;
    }
    root.append(svg('rect', { x: xL, y: y.toFixed(1), width: nodeW, height: Math.max(2, h).toFixed(1), rx: 3, fill: 'currentColor', 'fill-opacity': 0.85 }),
      tx(`${b.name} · ${b.n}`, xL - 8, y + h / 2 + 4, { anchor: 'end', size: 13, weight: 700 }));
    y += h + gap;
  });
  for (const [key, label, fill, op] of [['caught', 'Caught', ACCENT, 1], ['away', 'Got away', 'currentColor', 0.55]]) {
    const o = out[key];
    if (!o.h) continue;
    root.append(svg('rect', { x: xR, y: o.y.toFixed(1), width: nodeW, height: Math.max(2, o.h).toFixed(1), rx: 3, fill, 'fill-opacity': op }),
      tx(`${label} · ${key === 'caught' ? K : A}`, xR + nodeW + 8, o.y + o.h / 2 + 4, { anchor: 'start', size: 13, weight: 700 }),
      tx(pctFmt((key === 'caught' ? K : A) / t.throws), xR + nodeW + 8, o.y + o.h / 2 + 20, { anchor: 'start', size: 12, weight: 500, opacity: 0.8 }));
  }
  return card('amber', 'Where the throws go',
    bigStats([[fmt(t.wild), 'wild Pokémon met'], [fmt(t.throws), `balls thrown (${(t.throws / Math.max(1, t.wild) * 100).toFixed(1)} per 100 met)`], [fmt(t.catches), `caught (${pctFmt(t.catches / t.throws)} of throws)`]]),
    root,
    el('div', { class: 'note' }, 'Band thickness is the number of throws. Bands that end in Caught are throws that caught; the others got away. The logs do not tie each throw to a particular encounter, so the encounter figures above stay a separate summary rather than the first step of the flow.'));
}

// 8. Natures: all 25 in the game's own grid (row = stat raised, column = stat lowered, diagonal = neutral), counted from the save
function natureCard() {
  const src = ivSource(), mons = src.stored.filter(x => !x.egg);
  if (mons.length < 5) return card('flame', 'Natures', el('div', { class: 'note' }, 'Not enough stored Pokémon were found in the save.'));
  const counts = Array(25).fill(0);
  mons.forEach(x => counts[x.nature]++);
  const N = mons.length, exp = N / 25, chi2 = counts.reduce((s, c) => s + ((c - exp) ** 2) / exp, 0), p = chiSquareP(chi2, 24);
  const STATS = ['Atk', 'Def', 'Spe', 'SpA', 'SpD'], max = Math.max(...counts);
  const W = 640, H = 340, m = { l: 62, t: 36, r: 6, b: 6 }, cw = (W - m.l - m.r) / 5, ch = (H - m.t - m.b) / 5, root = plotSvg(W, H);
  root.classList.add('fill');   // spread across the whole card instead of a small chart in the middle
  STATS.forEach((nm, i) => root.append(tx(`−${nm}`, m.l + i * cw + cw / 2, m.t - 12, { size: 13, weight: 700, opacity: 0.9 }), tx(`+${nm}`, m.l - 10, m.t + i * ch + ch / 2 + 5, { anchor: 'end', size: 13, weight: 700, opacity: 0.9 })));
  counts.forEach((c, i) => {
    const r = Math.floor(i / 5), col = i % 5, x = m.l + col * cw, y = m.t + r * ch, neutral = r === col;
    root.append(svg('rect', {
      x: (x + 2).toFixed(1), y: (y + 2).toFixed(1), width: (cw - 4).toFixed(1), height: (ch - 4).toFixed(1), rx: 9,
      fill: c ? 'currentColor' : 'none', 'fill-opacity': c ? (0.12 + 0.88 * Math.sqrt(c / max)).toFixed(2) : 0,
      stroke: 'currentColor', 'stroke-opacity': neutral ? 0.7 : 0.14, 'stroke-width': neutral ? 2 : 1, ...(neutral ? { 'stroke-dasharray': '5 4' } : {}),
    }, svg('title', {}, `${NATURES[i]}: ${c}`)));
    const dark = c / max > 0.55;   // keep the label readable on a dark cell
    root.append(tx(NATURES[i], x + cw / 2, y + ch / 2 - 4, { size: 13.5, weight: 600, opacity: 1, fill: dark ? 'var(--bg)' : 'currentColor' }),
      tx(String(c), x + cw / 2, y + ch / 2 + 19, { size: 18, weight: 800, fill: dark ? 'var(--bg)' : 'currentColor' }));
  });
  const top = counts.indexOf(max), neutral = [0, 6, 12, 18, 24].reduce((s, i) => s + counts[i], 0);
  return card('flame', 'Natures',
    bigStats([[NATURES[top], `most common (${max} of ${N})`], [pctFmt(neutral / N), 'neutral natures (random: 20%)'], [`${counts.filter(c => c > 0).length} / 25`, 'natures you own']]),
    root,
    el('div', { class: 'note' }, `Rows are the stat a nature raises, columns the stat it lowers; the dashed diagonal holds the five neutral natures. If natures were random, each of the 25 cells would hold about ${exp.toFixed(1)} Pokémon. Breeding for a nature, or farming one species, makes a few cells dominate. Based on the ${N} stored Pokémon the scan found.`));
}

function analysis() {
  const iv = ivDistCard();
  iv.classList.add('wide');   // two charts side by side need the full width
  const activity = activityCard();
  activity.classList.add('wide');
  // Order matters for the grid: two similar-sized cards per row, the wide ones on rows of their own.
  return el('div', { class: 'analysis' }, ...[shinyCard(), accumulationCard(), ivHexCard(), natureCard(), activity, funnelCard(), forestCard(), sparklyCard(), globalBoxCard(), iv].filter(Boolean));
}
