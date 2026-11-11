// Overview tab: the world card (trainer card + party), the quiet tiles, world rules and the ticker.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// Latest snapshot of the active world, from world-card.ini (not history).
function worldCard() {
  const c = data.worldCard;
  // Each party member shows the game's own icon for its number, with its name underneath.
  // The party comes from the save itself (newer and exact). world-card.ini is only the fallback: it can lag the save and
  // numbers the newer species differently.
  const live = (data.party || {})[data.activeWorld];
  const party = live && live.length ? live.map(m => ({ id: m.species, level: m.level })) : c.party.map(id => ({ id: +id }));
  const mon = ({ id, level }) => {
    const cell = id, ico = el('div', { class: 'pico' });
    ico.style.setProperty('--col', cell % 32);
    ico.style.setProperty('--row', Math.floor(cell / 32));
    return el('div', { class: 'pm', title: `${speciesName(id)}${level ? ` · Lv ${level}` : ''}` },
      icons ? ico : null, el('span', {}, speciesName(id)), level ? el('small', {}, `Lv ${level}`) : null);
  };
  const dexCaught = ((data.dex || {})[data.activeWorld] || {}).caught ? data.dex[data.activeWorld].caught.length : null;
  const dexSeen = ((data.dex || {})[data.activeWorld] || {}).seen ? data.dex[data.activeWorld].seen.length : null;
  const tr = (data.trainer || {})[data.activeWorld];
  const tileEl = el('section', { class: 'tile world c-navy w4 h4' },
    el('h3', {}, data.activeWorld ? data.activeWorld : 'Active world'),
    el('p', { class: 'sub' }, 'Active world · latest save'),
    // the trainer card sits right above the party it belongs to
    el('div', { class: 'tcard' },
      el('div', { class: 'tc-main' }, el('span', { class: 'k' }, 'Trainer'), el('b', { class: 'tc-name' }, c.trainer || '–')),
      el('div', { class: 'tc-badges' }, el('span', { class: 'k' }, `Badges ${c.badges} / 8`),
        el('div', { class: 'pips' }, Array.from({ length: 8 }, (_, i) => el('i', { class: 'pip' + (i < c.badges ? ' on' : '') })))),
      ...[['Play time', c.playTime || '–'], ['Location', c.place || '–'], ['Pokédex', dexCaught == null ? '–' : `${dexCaught} caught`],
        ['Trainer ID', tr ? String(tr.tid).padStart(5, '0') : '–'], ['Money', tr ? `₽${fmt(tr.money)}` : '–'], ['Seen', dexSeen == null ? '–' : `${dexSeen} Pokémon`]]
        .map(([k, v]) => el('div', { class: 'fact' }, el('span', { class: 'k' }, k), el('b', {}, v)))),
    el('div', { class: 'party' }, party.length ? party.map(mon) : [el('span', {}, 'Empty party')]));
  return tileEl;
}

function overview() {
  const list = visible(), t = totals(list);
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
  const perHour = t.seconds >= 600 ? (t.wild / (t.seconds / 3600)).toFixed(1) : '–';
  // Pokémon that have left the save since tracking began (see trackReleased in main.js); the world filter applies
  const rel = Object.entries((data.released && data.released.worlds) || {}).filter(([w]) => filter === ALL || w === filter)
    .flatMap(([, v]) => v.left).sort((a, b) => b.when.localeCompare(a.when));
  // Opening view: one hero (the active world and the four numbers that matter most), then everything else as small quiet tiles.
  const hero = el('div', { class: 'ovhero' + (data.worldCard ? '' : ' nohero') },
    data.worldCard ? worldCard() : null,
    stat('yellow', 3, 1, 'Wild encounters', fmt(t.wild)),
    stat('lime', 3, 1, 'Pokémon caught', fmt(t.catches), `${pct(t.catches, t.wild)} of encounters`),
    stat('flame', 3, 1, 'Catch success', pct(t.catches, t.throws), 'per ball thrown'),
    stat('lilac', 3, 1, 'Logged time', dur(t.seconds)));
  const mini = (k, v, sub) => el('div', { class: 'mini' }, el('span', { class: 'mk' }, k), el('b', { class: 'mv' }, v), sub ? el('span', { class: 'ms' }, sub) : null);
  const more = el('div', { class: 'ovmore' },
    mini('Battles started', fmt(t.battles)), mini('Encounters / hour', perHour), mini('Balls thrown', fmt(t.throws)), mini('Faints', fmt(t.faints), 'both sides'),
    mini('Save reloads', fmt(t.reloads)), mini('EXP pool', fmt(t.exp), `from ${fmt(t.foes)} foes`), mini('Play sessions', fmt(list.length)),
    mini('Left your boxes', fmt(rel.length), 'released or traded'));
  const out = [hero, more];
  const rules = worldRulesCard();
  if (rules) out.push(rules);
  if (rel.length) {
    out.push(card('plum', 'Released or traded away',
      el('div', { class: 'note' }, `Counted since ${new Date(data.released.since).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}. The save can’t tell a release from a trade, and anything you let go before the app started tracking isn’t here.`),
      el('div', { class: 'relist' }, rel.slice(0, 60).map(r => el('div', { class: 'prow' },
        el('span', { class: 'pn' }, speciesName(r.species) + (r.nick && r.nick.toLowerCase() !== speciesName(r.species).toLowerCase() ? ` “${r.nick}”` : '') + (r.shiny ? ' ✦' : '')),
        el('span', { class: 'pt' }, r.loc ? placeName(r.loc) : ''),
        el('span', { class: 'pt' }, new Date(r.when).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })))))));
  }
  if (filter === ALL) {
    const groups = {};
    for (const s of data.sessions) {
      const g = (groups[worldOf(s)] ||= { sessions: 0, wild: 0, battles: 0, catches: 0 });
      g.sessions++; g.wild += s.wild; g.battles += s.battles; g.catches += s.catches;
    }
    const items = Object.entries(groups).sort((a, b) => b[1].wild - a[1].wild).map(([w, g]) => ({
      name: w === NONE ? 'Unassigned' : w, value: g.wild,
      sub: `${g.sessions} sessions · ${g.battles} battles · ${g.catches} caught`,
    }));
    out.push(el('div', { class: 'stack' }, card('yellow', 'Encounters per world', rows(items, 'World', 'Wild'),
      groups[NONE] ? el('div', { class: 'note warn' }, `${groups[NONE].sessions} session${groups[NONE].sessions === 1 ? ' has' : 's have'} no world yet `, el('button', { class: 'pill', onclick: () => { subPick.stats = 'sessions'; goTab('stats'); } }, 'Assign')) : null)));
  }
  return el('div', { class: 'stack' }, out);
}

// World rules, from each world's world.ini: what kind of run it is and which options it uses. The numbers are the game's own; these tables
// turn them into words (only values that were checked against the game's own descriptions are named; anything else is left out).
const TYPE_NAMES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];
const RULE_SETS = ['Easy', 'Classic', 'Hardcore', 'Soul Link', 'Hardlocke'];   // the game's "rules" value, counted from 0
const PRESETS = ['', 'Nuzlocke', 'Hardlocke', 'Randomlocke', 'Easy Nuzlocke', 'Hardcore Nuzlocke', 'Soul Link', 'Duallocke', 'Legendlocke', 'Monolocke'];
const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Let’s Go'];
function worldBadges(st) {
  const main = [], extra = [];
  if (st.game_type === 1) main.push('Nuzlocke' + (st.rules >= 0 && RULE_SETS[st.rules] ? ' · ' + RULE_SETS[st.rules] : ''));
  else if (st.game_type === 2) main.push('Duallocke');
  else main.push('Normal run');
  if (st.preset > 0 && PRESETS[st.preset]) main.push('Preset: ' + PRESETS[st.preset]);
  main.push(['No level cap', 'Level cap', 'Level cap + no grind'][st.level_caps] || 'Level cap ?');
  if (st.pool_kind === 1) main.push('Monotype' + (st.pool_type >= 0 && TYPE_NAMES[st.pool_type] ? ' · ' + TYPE_NAMES[st.pool_type] : ''));
  else if (st.pool_kind === 2) main.push('Legends only');
  if (st.random_species > 0) main.push('Random · ' + ['by route', 'one for one', 'fully random'][st.random_species]);
  if (st.randomize_eggs === 1) main.push('Random eggs');
  if (st.lives > 0) main.push(`${st.lives} lives (${st.lives_scope ? 'whole team' : 'each player'})`);
  if (st.party > 1) main.push(`${st.party} players`);
  if (st.game_type > 0 && st.challenge_state) main.push(['', 'Run in progress', 'Run completed', 'Run failed'][st.challenge_state] || '');
  if (st.run_over === 1) main.push('Run over');
  if (REGIONS[st.starter_region]) extra.push('Starters: ' + REGIONS[st.starter_region]);
  for (const [k, t] of [['expanded_encounters', 'More Pokémon'], ['new_routes', 'New routes'], ['modern_types', 'Modern types'], ['double_battles', 'Double battles'],
    ['partner_starters', 'Partner starters'], ['start_exp_share', 'Exp. Share from start'], ['one_hour_day', '1-hour days'], ['free_play', 'Free play'], ['skip_tutorials', 'Tutorials skipped']]) if (st[k] === 1) extra.push(t);
  return { main: main.filter(Boolean), extra };
}
function worldRulesCard() {
  const all = data.settings || {};
  let names = Object.keys(all).sort((a, b) => (a === data.activeWorld ? -1 : b === data.activeWorld ? 1 : a.localeCompare(b)));
  if (filter !== ALL && filter !== NONE) names = names.filter(n => n === filter);
  if (!names.length) return null;
  return card('lilac', 'World rules',
    el('div', { class: 'rulelist' }, names.map(n => {
      const b = worldBadges(all[n]);
      return el('div', { class: 'rulerow' },
        el('div', { class: 'rulename' }, n, n === data.activeWorld ? el('small', {}, 'active now') : (data.goneWorlds || []).includes(n) ? el('small', {}, 'deleted in the game') : null),
        el('div', { class: 'rulebadges' }, b.main.map(t => el('span', { class: 'rb main' }, t)), b.extra.map(t => el('span', { class: 'rb' }, t))));
    })));
}

// The ticker band under the world chips: its colour follows the tab (and, while you scroll the highlights, the panel you are on).
const TAB_COLORS = { overview: ['var(--blue)', 'var(--tf-overview)'], collection: ['var(--yellow)', 'var(--tf-collection)'], catching: ['var(--orange)', 'var(--tf-catching)'], map: ['var(--purple)', 'var(--tf-map)'], stats: ['var(--green)', 'var(--tf-stats)'] };
function updateTicker() {
  const tk = document.getElementById('ticker');
  if (!tk) return;
  const c = TAB_COLORS[tab] || TAB_COLORS.overview;
  tk.dataset.base = c[0]; tk.dataset.basefg = c[1];
  if (!tk.dataset.hsOn) { tk.style.setProperty('--tc', c[0]); tk.style.setProperty('--tf', c[1]); }
  if (!data || data.missing) { tk.replaceChildren(); tk.dataset.sig = ''; return; }
  const t = totals(visible()), w = data.activeWorld || '';
  const ow = (data.owned || {})[w], items = Object.keys((data.itemsEver || {})[w] || {}).length;
  const relN = Object.values((data.released && data.released.worlds) || {}).reduce((a, v) => a + v.count, 0);
  const bits = [`${fmt(t.wild)} wild encounters`, `${fmt(t.catches)} caught`, `${fmt(t.throws)} balls thrown`, `${dur(t.seconds)} logged`,
    ow ? `${Object.keys(ow.counts).length} species in your boxes` : '', items ? `${items} items found` : '', relN ? `${relN} left your boxes` : '', w ? `Playing: ${w}` : ''].filter(Boolean);
  const sig = bits.join('|');
  if (tk.dataset.sig === sig) return;   // unchanged, so the band keeps sliding instead of restarting
  tk.dataset.sig = sig;
  const grp = () => el('div', { class: 'grp' }, [...bits.map(b => el('span', { class: 'it' }, b)), ...bits.map(b => el('span', { class: 'it dup' }, b))]);
  tk.replaceChildren(el('div', { class: 'track' }, grp(), grp()));
}
