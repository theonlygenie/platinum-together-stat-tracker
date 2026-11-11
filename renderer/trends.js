// Trends sub-tab.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

function trends() {
  const list = visible().filter(s => s.seconds >= 300 && s.wild > 0);
  if (!list.length) return el('div', { class: 'empty' }, 'Not enough play time yet. Sessions under 5 minutes are skipped.');
  const items = list.map(s => ({
    name: s.started ? new Date(s.started).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
      new Date(s.started).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : s.file,
    value: Math.round(s.wild / (s.seconds / 3600)),
    sub: `${s.wild} encounters in ${dur(s.seconds)} · ${s.catches} caught`,
  }));
  return card('lilac', 'Encounters per hour, by session', rows(items, 'Session', 'Per hour'),
    el('div', { class: 'note' }, 'Oldest first. Length is first to last log line, so idle time counts.'));
}
