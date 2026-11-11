// Shared helpers: element builder, number formats, tooltips, list rows (rows, rowsX, chips).
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.
const ALL = '__all__', NONE = '__none__';
let data = null, tab = 'overview', filter = ALL;
const view = document.getElementById('view');

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === 'class' ? (e.className = v) : (e[k] = v);
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const fmt = n => n.toLocaleString();
const dur = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${m}m` : `${m}m`; };
const worldOf = s => (data.tags || {})[s.file] || NONE;
const speciesName = id => ((data && data.speciesNames) || {})[id] || `#${id}`;

// A colourful stat block: title top-left, big number bottom-right.
function stat(color, w, h, title, num, sub) {
  const text = String(num);
  const n = el('div', { class: 'num' }, text);
  n.style.setProperty('--chars', Math.max(3, text.length));   // lets the number shrink to fit its tile
  n.dataset.count = text;                                      // the final text, for the count-up on load
  return el('section', { class: `tile stat c-${color} w${w} h${h}` },
    el('h3', {}, title), sub ? el('p', { class: 'sub' }, sub) : null, n);
}
// A wide block holding a list or table.
// A small "i" that shows its text in a floating tip (one shared tip, see below), so explanations stay available without taking up room.
function info(text) {
  const b = document.createElement('span');
  b.className = 'info'; b.tabIndex = 0; b.dataset.tip = text; b.setAttribute('role', 'note'); b.setAttribute('aria-label', text); b.textContent = 'i';
  return b;
}
// Plain-text footnotes passed to a card are moved up behind the heading's "i" instead of sitting under the content.
function card(color, title, ...body) {
  const tips = [];
  const rest = body.flat().filter(b => {
    if (b && b.nodeType === 1 && b.className === 'note' && !b.children.length && b.textContent.length > 45) { tips.push(b.textContent); return false; }
    return true;
  });
  return el('section', { class: `tile card c-${color}` }, el('h3', {}, title, tips.length ? info(tips.join(' ')) : null), rest);
}
// One floating tip shared by every element that carries data-tip.
const gtip = document.createElement('div');
gtip.className = 'gtip'; gtip.hidden = true; document.body.append(gtip);
const tipFor = t => t && t.closest ? t.closest('[data-tip]') : null;
const showTip = t => {
  const r = t.getBoundingClientRect();
  gtip.replaceChildren(...t.dataset.tip.split(/(?<=[.!?])\s+(?=[A-Z★])/).map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
  gtip.hidden = false;
  const w = gtip.offsetWidth, h = gtip.offsetHeight;
  gtip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  gtip.style.top = `${r.bottom + 10 + h > innerHeight ? Math.max(8, r.top - h - 10) : r.bottom + 10}px`;
};
document.addEventListener('pointerover', e => { const t = tipFor(e.target); if (t) showTip(t); });
document.addEventListener('pointerout', e => { if (tipFor(e.target)) gtip.hidden = true; });
document.addEventListener('focusin', e => { const t = tipFor(e.target); if (t) showTip(t); });
document.addEventListener('focusout', () => { gtip.hidden = true; });
// Switch tab from code (the nav buttons use the same path).
function goTab(t) {
  tab = t; view.scrollTop = 0;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  render();
}

function visible() {
  return data.sessions.filter(s => filter === ALL || worldOf(s) === filter);
}

function totals(list) {
  const t = { wild: 0, battles: 0, catches: 0, faints: 0, seconds: 0, throws: 0, exp: 0, foes: 0, reloads: 0, species: {}, caught: {}, balls: {} };
  for (const s of list) {
    t.wild += s.wild; t.battles += s.battles; t.catches += s.catches; t.faints += s.faints; t.seconds += s.seconds;
    t.throws += s.throws; t.exp += s.exp; t.foes += s.foes; t.reloads += s.reloads;
    for (const [id, b] of Object.entries(s.balls)) {
      const a = (t.balls[id] ||= { throws: 0, caught: 0 });
      a.throws += b.throws; a.caught += b.caught;
    }
    for (const [id, e] of Object.entries(s.species)) {
      const a = (t.species[id] ||= { count: 0, levelSum: 0, min: 999, max: 0 });
      a.count += e.count; a.levelSum += e.levelSum; a.min = Math.min(a.min, e.min); a.max = Math.max(a.max, e.max);
    }
    for (const [id, c] of Object.entries(s.caught)) t.caught[id] = (t.caught[id] || 0) + c;
  }
  return t;
}

function rows(items, label, valueLabel) {
  const max = Math.max(1, ...items.map(r => r.value));
  return el('div', { class: 'rows' },
    el('div', { class: 'row head' }, el('div', {}, label), el('div', {}), el('div', { class: 'num' }, valueLabel)),
    items.map(r => el('div', { class: 'row' },
      el('div', { class: 'nm' }, r.name, r.sub ? el('small', {}, r.sub) : null),
      el('div', { class: 'bar' }, el('i', { style: `width:${r.value / max * 100}%` })),
      el('div', { class: 'val' }, fmt(r.value)))));
}

// Like rows(), but built for long lists. Each item has a short summary line (its top few names and "+N more"); clicking a row opens its full
// breakdown as small chips in a scrolling panel; and only the first rows show until "Show all" is pressed.
// item: { name, value, sub, detail: [[title, [[label, count], ...]], ...] }
const rowOpen = new Set(), rowSeen = new Set();
// A titled set of chips for a long list: a search box (when there are many), and only the first 40 shown until "Show more".
function chipList(title, list) {
  let q = '', cap = 40;
  const box = el('div', { class: 'chips' }), more = el('button', { class: 'pill ghost showall', type: 'button' }), count = el('span', { class: 'rdn' });
  const draw = () => {
    const hit = q ? list.filter(([k]) => k.toLowerCase().includes(q)) : list;
    box.replaceChildren(...hit.slice(0, cap).map(([k, n]) => el('span', { class: 'chipx' }, k, n > 1 ? el('b', {}, '×' + fmt(n)) : null)));
    if (!hit.length) box.replaceChildren(el('span', { class: 'rdn' }, 'No match'));
    count.textContent = q ? `${fmt(hit.length)} of ${fmt(list.length)}` : fmt(list.length);
    more.hidden = hit.length <= cap; more.textContent = `Show ${fmt(Math.min(100, hit.length - cap))} more`;
  };
  more.onclick = e => { e.stopPropagation(); cap += 100; draw(); };
  const search = list.length > 8 ? el('input', { class: 'rdsearch', type: 'search', placeholder: `Search ${title.toLowerCase()}`, oninput: e => { q = e.target.value.trim().toLowerCase(); cap = 40; draw(); }, onclick: e => e.stopPropagation() }) : null;
  draw();
  return el('div', { class: 'rd', onclick: e => e.stopPropagation() }, el('div', { class: 'rdh' }, el('span', { class: 'rdt' }, title), count, search), box, more);
}
function rowsX(id, items, label, valueLabel, limit = 8) {
  const max = Math.max(1, ...items.map(r => r.value));
  let all = false;
  if (!rowSeen.has(id)) { rowSeen.add(id); if (items[0]) rowOpen.add(id + ':' + items[0].name); }   // the biggest row starts open, so the card has content
  const body = el('div', {});
  const draw = () => {
    const shown = all ? items : items.slice(0, limit);
    body.replaceChildren(...[...shown.map(r => {
      const key = id + ':' + r.name, has = r.detail && r.detail.some(([, l]) => l.length);
      const panel = has ? el('div', { class: 'rowdetail' }, r.detail.filter(([, l]) => l.length).map(([t, list]) => chipList(t, list))) : null;
      if (panel) panel.hidden = !rowOpen.has(key);
      const row = el('div', { class: 'row' + (has ? ' xp' : '') + (panel && !panel.hidden ? ' open' : ''), onclick: has ? () => {
        if (rowOpen.has(key)) rowOpen.delete(key); else rowOpen.add(key);
        panel.hidden = !rowOpen.has(key); row.classList.toggle('open', !panel.hidden);
      } : null },
      el('div', { class: 'nm' }, r.name, r.sub ? el('small', {}, r.sub) : null),
      el('div', { class: 'bar' }, el('i', { style: `width:${r.value / max * 100}%` })),
      el('div', { class: 'val' }, fmt(r.value), has ? el('span', { class: 'caret' }, '▸') : null));
      return el('div', { class: 'rowwrap' }, row, panel);
    }), items.length > limit ? el('button', { class: 'pill ghost showall', onclick: () => { all = !all; draw(); } }, all ? 'Show fewer' : `Show all ${fmt(items.length)}`) : null].filter(Boolean));
  };
  draw();
  return el('div', { class: 'rows' }, el('div', { class: 'row head' }, el('div', {}, label), el('div', {}), el('div', { class: 'num' }, valueLabel)), body);
}
// counts of something about a list of Pokémon, biggest first: [[label, count], ...]
const tallyBy = (ms, keyOf) => { const c = {}; ms.forEach(m => { const k = keyOf(m); if (k) c[k] = (c[k] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
// the one-line summary: the first few names with counts, then how many more
const glance = (list, n = 4) => list.slice(0, n).map(([k, v]) => (v > 1 ? `${k} ×${fmt(v)}` : k)).join(', ') + (list.length > n ? ` +${fmt(list.length - n)} more` : '');
