// Motion and scroll effects, modelled on the units.gr homepage: inertial smooth scrolling, blocks that rise into place as they scroll
// into view, a ticker, a short opening wipe, and arrows for the highlight strip on the Overview. Nothing here touches data. All of it
// stands down when motion is set to "reduced": by the switch in the Settings panel, or by the system's own reduced-motion setting.
(() => {
  const view = document.getElementById('view');
  const root = document.documentElement;
  const sys = matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'pt-motion';
  const pref = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const isCalm = () => (pref() ? pref() === 'calm' : sys.matches);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const apply = () => {
    root.classList.toggle('calm', isCalm());
    const b = document.getElementById('motbtn');
    if (b) b.textContent = isCalm() ? 'Motion: reduced' : 'Motion: full';
  };
  apply();
  const motbtn = document.getElementById('motbtn');
  if (motbtn) motbtn.onclick = () => { try { localStorage.setItem(KEY, isCalm() ? 'full' : 'calm'); } catch {} apply(); arm(); };

  // opening wipe
  const intro = document.getElementById('intro');
  if (intro) {
    if (isCalm()) intro.remove();
    else setTimeout(() => { intro.classList.add('gone'); setTimeout(() => intro.remove(), 1100); }, 850);
  }

  // inertial scrolling: wheel movement sets a target and the page eases toward it
  let target = 0, raf = 0;
  const canScrollInside = (el, dy) => {
    for (; el && el !== view; el = el.parentElement) {
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return true;
      }
    }
    return false;
  };
  const glide = () => {
    if (raf) return;
    const step = () => {
      const d = target - view.scrollTop;
      if (Math.abs(d) < 0.4 || isCalm()) { if (!isCalm()) view.scrollTop = target; raf = 0; return; }
      view.scrollTop += d * 0.11;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  view.addEventListener('wheel', e => {
    if (isCalm() || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || canScrollInside(e.target, e.deltaY)) return;
    e.preventDefault();
    if (!raf) target = view.scrollTop;
    const dy = e.deltaMode === 1 ? e.deltaY * 34 : e.deltaMode === 2 ? e.deltaY * view.clientHeight : e.deltaY;
    target = clamp(target + dy, 0, view.scrollHeight - view.clientHeight);
    glide();
  }, { passive: false });
  view.addEventListener('scroll', () => { if (!raf) target = view.scrollTop; });

  // back-to-top button: appears once you have scrolled a screen or so down any page
  const topBtn = document.createElement('button');
  topBtn.className = 'totop'; topBtn.type = 'button';
  topBtn.setAttribute('aria-label', 'Back to top'); topBtn.title = 'Back to top';
  topBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  document.body.append(topBtn);
  topBtn.onclick = () => { if (isCalm()) { view.scrollTop = 0; } else { target = 0; glide(); } };
  const syncTop = () => { topBtn.classList.toggle('show', view.scrollTop >= 500); };
  view.addEventListener('scroll', syncTop, { passive: true });

  // blocks rise into place as they enter view
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(entries => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('fx-in'); io.unobserve(en.target); }
    }, { root: view, threshold: 0, rootMargin: '0px' });
  }
  let lastPage = null;
  function arm() {
    if (!io || isCalm()) return;
    // Only a new page rises into place. A refresh that redraws the same page (new play, a new world chip) shows it at once, so nothing
    // blinks out and fades back in under you.
    const page = view.dataset.page || '';
    const same = page === lastPage;
    lastPage = page;
    if (same) return;
    let n = 0;
    for (const el of view.querySelectorAll('.tile, .mapgrid > section, .hs')) {
      if (el.classList.contains('fx') || el.closest('.hs-track')) continue;
      el.classList.add('fx');
      el.style.setProperty('--d', `${Math.min(n++, 6) * 80}ms`);
      io.observe(el);
    }
    // safety net: if the observer is slow (for example the window is in the background), anything already on screen is shown anyway
    setTimeout(() => {
      const vr = view.getBoundingClientRect();
      for (const el of view.querySelectorAll('.fx:not(.fx-in)')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > vr.top && r.top < vr.bottom) el.classList.add('fx-in');
      }
    }, 400);
  }

  // the Overview's highlight strip: a row you can swipe or step through with the arrows
  function wireStrips() {
    for (const hs of view.querySelectorAll('.hs')) {
      if (hs.dataset.wired) continue;
      hs.dataset.wired = '1';
      const track = hs.querySelector('.hs-track'), prev = hs.querySelector('.hs-arrow.prev'), next = hs.querySelector('.hs-arrow.next');
      if (!track) continue;
      const step = () => (track.children[1] ? track.children[1].offsetLeft - track.children[0].offsetLeft : track.clientWidth) * 1;
      const sync = () => {
        if (prev) prev.hidden = track.scrollLeft < 8;
        if (next) next.hidden = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
      };
      if (prev) prev.onclick = () => track.scrollBy({ left: -step(), behavior: isCalm() ? 'auto' : 'smooth' });
      if (next) next.onclick = () => track.scrollBy({ left: step(), behavior: isCalm() ? 'auto' : 'smooth' });
      track.addEventListener('scroll', sync, { passive: true });
      sync();
    }
  }

  // the renderer replaces the page contents on every refresh, so arm the effects again whenever that happens
  let pending = 0;
  new MutationObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(() => { arm(); wireStrips(); }, 30);   // a timer, not a frame callback, so it also runs while the window is in the background
  }).observe(view, { childList: true });
  arm(); wireStrips();
})();
