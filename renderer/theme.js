// Colour themes. Original is the colourful default. The rest are one background + one accent (palettes from cmfbooth.vercel.app), and the
// stylesheet works every card colour out as a tone of the page. "Custom" lets you pick both colours. Applied before first paint.
(function () {
  const KEY = 'pt-theme', CKEY = 'pt-theme-custom';
  const THEMES = {
    original: { name: 'Original' },
    lamp: { name: 'Lamp', page: '#252423', ink: '#dad5d0', acc: '#e2543b', dark: 1 },
    studio: { name: 'Studio', page: '#efeeea', ink: '#161616', acc: '#d9421f', dark: 0 },
    black: { name: 'Black', page: '#0b0b0b', ink: '#e4e1dd', acc: '#e2543b', dark: 1 },
    midnight: { name: 'Midnight', page: '#0d1117', ink: '#d6dde6', acc: '#ff7a5e', dark: 1, bg: 'linear-gradient(135deg,#33414f,#0d1117 62%)' },
    custom: { name: 'Custom' },
  };
  const LEGACY = { dark: 'lamp', paper: 'studio' };
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const get = () => { let v = read(KEY); v = LEGACY[v] || v; return THEMES[v] ? v : 'original'; };
  const custom = () => { try { return Object.assign({ page: '#252423', acc: '#e2543b' }, JSON.parse(read(CKEY) || '{}')); } catch { return { page: '#252423', acc: '#e2543b' }; } };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const VARS = ['--page', '--ink', '--acc', '--onacc', '--deep', '--pagebg'];
  const apply = () => {
    const id = get(), root = document.documentElement;
    root.dataset.theme = id;
    let t = THEMES[id];
    if (id === 'custom') { const c = custom(); const dark = lum(c.page) < .35; t = { page: c.page, acc: c.acc, dark, ink: dark ? '#e6e3df' : '#161616' }; }
    root.classList.toggle('themed', id !== 'original');
    VARS.forEach(v => root.style.removeProperty(v));
    if (id !== 'original') {
      root.style.setProperty('--page', t.page); root.style.setProperty('--ink', t.ink); root.style.setProperty('--acc', t.acc);
      root.style.setProperty('--onacc', lum(t.acc) > .3 ? '#111' : '#fff');
      root.style.setProperty('--deep', t.dark ? 'color-mix(in srgb,#000 38%,' + t.page + ')' : t.ink);
      if (t.bg) root.style.setProperty('--pagebg', t.bg);
    }
    document.querySelectorAll('.themebtns .pill').forEach(b => b.classList.toggle('on', b.dataset.theme === id));
    const cb = document.querySelector('.themecustom'); if (cb) cb.hidden = id !== 'custom';
    root.style.colorScheme = id !== 'original' && t.dark ? 'dark' : 'light';
    window.dispatchEvent(new Event('pt-theme'));
  };
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    const box = document.querySelector('.themebtns');
    if (box) for (const [k, t] of Object.entries(THEMES)) { const b = document.createElement('button'); b.className = 'pill ghost'; b.dataset.theme = k; b.textContent = t.name; b.onclick = () => { store(KEY, k); apply(); }; box.append(b); }
    const bg = document.getElementById('thbg'), ac = document.getElementById('thacc');
    if (bg && ac) {
      const c = custom(); bg.value = c.page; ac.value = c.acc;
      const save = () => { store(CKEY, JSON.stringify({ page: bg.value, acc: ac.value })); apply(); };
      bg.oninput = save; ac.oninput = save;
    }
    apply();
  });
})();
