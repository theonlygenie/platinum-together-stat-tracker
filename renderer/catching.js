// Catching tab: the 3D pyramid ball chart and its key.
// Part of the app's renderer: plain scripts loaded in order from index.html, sharing one global scope.

// A 3D chart on a canvas with a small hand-written projection (no libraries): each ball type is a triangular pyramid.
// The three corners of the base lie on spokes at 120 degrees: Thrown, Caught and Missed (thrown but not caught). The top point stands
// on the middle at a height that is the Success rate. Pick one ball in the key and its pyramid is drawn solid with every value written
// on it, while the others stay as thin outlines for comparison; "All" draws every pyramid solid. The numbers for the picked ball are
// also written out underneath. Drag to rotate; it turns slowly on its own, and keeps turning while the pointer is over it. Dragging turns it any way, including over onto its back.
let radarSel = null;   // radarSel: a ball id, 'all', or null for the busiest ball
// The camera survives a redraw. New play makes the page rebuild every 15 seconds or so, and the chart should not jump back
// to its starting angle or grow in from nothing each time.
const radarState = { yaw: 0.5, pitch: 0.32, seen: -1e9 };
const BALL_COLORS = ['#fb5a1f', '#0061fe', '#8c1f56', '#fad34f', '#243556', '#c9b4ee', '#ff8c1a', '#ebe7e0'];   // the app's own palette
function radar3d(all) {
  const totalThrows = all.reduce((s, b) => s + b.throws, 0);
  const themed = document.documentElement.classList.contains('themed');
  const pal = themed ? [(getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#ffffff'), '#4ea1ff', '#f2c94c', '#6fcf97', '#bb86fc', '#56ccf2', '#9aa5b1', '#e0e0e0'] : BALL_COLORS;
  const balls = all.slice(0, 6).map((b, i) => ({ ...b, hex: pal[i], missed: b.throws - b.caught, rate: b.throws ? b.caught / b.throws : 0 }));
  const maxOf = k => Math.max(1, ...balls.map(b => b[k]));
  const AXES = [{ name: 'Thrown', k: 'throws' }, { name: 'Caught', k: 'caught' }, { name: 'Missed', k: 'missed' }].map(a => ({ ...a, max: maxOf(a.k) }));
  const spoke = i => { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; return [Math.cos(a), Math.sin(a)]; };   // [x, z] on the floor
  const HEIGHT = 1.7;   // how tall a 100% success rate stands, against a spoke length of 1
  if (radarSel == null) radarSel = 'all';
  if (radarSel !== 'all' && !balls.some(b => b.id === radarSel)) radarSel = balls[0].id;
  const canvas = el('canvas', { role: 'img', 'aria-label': 'Balls thrown, caught, missed and success rate by ball type, as 3D pyramids.' });
  const readout = el('div', { class: 'r3dstats' });
  const chips = [];
  const setSel = id => { radarSel = id; chips.forEach(([c, v]) => c.classList.toggle('on', v === id)); fillReadout(); };
  const chip = (id, label, color) => {
    const c = el('button', { class: 'r3dchip' + (radarSel === id ? ' on' : ''), onclick: () => setSel(id) }, color ? el('i', { style: `background:${color}` }) : null, label);
    chips.push([c, id]);
    return c;
  };
  let resetView = () => {};
  const resetBtn = el('button', { class: 'iconbtn', title: 'Reset the view', onclick: () => resetView() });
  resetBtn.setAttribute('aria-label', 'Reset the view');
  resetBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.2v4.6h4.6"/></svg>';
  const key = el('div', { class: 'r3dkey' }, chip('all', 'All'), ...balls.map(b => chip(b.id, b.name, b.hex)),
    all.length > 6 ? el('span', { class: 'dragtip' }, `Top 6 of ${all.length}`) : null, resetBtn);
  const fillReadout = () => {
    const b = balls.find(x => x.id === radarSel);
    const stat = (v, l) => el('div', {}, el('b', {}, v), el('span', {}, l));
    if (!b) {
      const T = balls.reduce((a, x) => ({ throws: a.throws + x.throws, caught: a.caught + x.caught }), { throws: 0, caught: 0 });
      readout.replaceChildren(el('div', { class: 'r3dname' }, 'All balls'), stat(fmt(T.throws), 'thrown'), stat(fmt(T.caught), 'caught'), stat(fmt(T.throws - T.caught), 'missed'),
        stat(T.throws ? `${Math.round(T.caught / T.throws * 100)}%` : '–', 'success rate'));
      return;
    }
    readout.replaceChildren(el('div', { class: 'r3dname' }, el('i', { style: `background:${b.hex}` }), b.name),
      stat(fmt(b.throws), 'thrown'), stat(fmt(b.caught), 'caught'), stat(fmt(b.missed), 'missed'), stat(`${Math.round(b.rate * 100)}%`, 'success rate'),
      stat(b.caught ? (b.throws / b.caught).toFixed(1) : '–', 'throws per catch'), stat(totalThrows ? `${Math.round(b.throws / totalThrows * 100)}%` : '–', 'of all throws'),
      stat(String(b.sessions), `session${b.sessions === 1 ? '' : 's'} used in`));
  };
  fillReadout();
  const wrap = el('div', { class: 'chart chart3d' }, canvas, key, readout);
  const ctx = canvas.getContext('2d');
  const stillQ = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => document.documentElement.classList.contains('calm') || (stillQ.matches && !localStorage.getItem('pt-motion'));
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const inkOf = () => { ctx.fillStyle = getComputedStyle(wrap).color; const h = ctx.fillStyle; return h[0] === '#' ? rgb(h) : [16, 87, 58]; };
  const bgOf = () => { const t = wrap.closest('.tile'); ctx.fillStyle = t ? getComputedStyle(t).backgroundColor : '#b6e01a'; const h = ctx.fillStyle; return h[0] === '#' ? rgb(h) : [182, 224, 26]; };
  let yaw = radarState.yaw, pitch = radarState.pitch, dragging = false, lastX = 0, lastY = 0, back = null;
  const wrapTurn = d => { const t = Math.PI * 2; return ((d + Math.PI) % t + t) % t - Math.PI; };   // the short way round
  resetView = () => { back = { t0: performance.now(), yaw, pitch, dy: wrapTurn(0.5 - yaw), dp: wrapTurn(0.32 - pitch) }; if (still()) { yaw = 0.5; pitch = 0.32; draw(performance.now()); } };
  const born = performance.now();
  const instant = born - radarState.seen < 2000;   // a chart was on screen a moment ago, so this is a redraw, not a first visit
  let prev = born;
  const ease = k => 1 - Math.pow(1 - k, 3);
  const css = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const LIGHT = (() => { const l = [-0.5, 0.9, -0.7], m = Math.hypot(...l); return l.map(v => v / m); })();

  const draw = now => {
    const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (back) {
      const k = Math.min(1, (now - back.t0) / 650), e2 = 1 - Math.pow(1 - k, 3);
      yaw = back.yaw + back.dy * e2; pitch = back.pitch + back.dp * e2;
      if (k >= 1) back = null;
    } else if (!dragging && !still()) yaw += dt * 0.22;
    const g = still() || instant ? 1 : ease(Math.min(1, (now - born) / 900));
    radarState.yaw = yaw; radarState.pitch = pitch; radarState.seen = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const ink = inkOf(), bg = bgOf(), font = getComputedStyle(canvas).fontFamily;
    const S = Math.max(40, Math.min((w / 2 - 55) / 1.25, (h / 2 - 50) / 1.55)), cx = w / 2, cy = h / 2 - S * 0.05;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // world: x right, y up, z away. Turn about the upright axis, then tip the top toward the viewer; the result's last number is depth.
    const rot = (x, y, z) => { y -= HEIGHT / 2.2; const X = x * cyw + z * syw, Z0 = -x * syw + z * cyw; return [X, y * cp + Z0 * sp, Z0 * cp - y * sp]; };
    const proj = ([X, Y, Z]) => { const k = 4 / (4 + Z); return [cx + X * k * S, cy - Y * k * S]; };
    const P = (x, y, z) => proj(rot(x, y, z));
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    const text = (str, x, y, size, weight, alpha = 1, align = 'center') => {
      ctx.font = `${weight} ${size}px ${font}`; ctx.textAlign = align; ctx.globalAlpha = alpha; ctx.fillStyle = css(ink, 1);
      ctx.fillText(str, x, y); ctx.globalAlpha = 1;
    };
    // a value written on a small pill so it reads over any colour
    const tag = (str, x, y, color) => {
      ctx.font = `700 14px ${font}`;
      const tw = ctx.measureText(str).width + 12, th = 20;
      ctx.beginPath(); ctx.roundRect(x - tw / 2, y - th / 2, tw, th, 10);
      ctx.fillStyle = css(bg, 0.96); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = css(ink, 1); ctx.fillText(str, x, y + 0.5); ctx.textBaseline = 'alphabetic';
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // the floor: the base triangle at a third, two thirds and the full length of the spokes, with the values at those marks
    const ring = f => AXES.map((_, i) => { const [x, z] = spoke(i); return P(x * f, 0, z * f); });
    ctx.fillStyle = css(ink, 0.06);
    ctx.beginPath(); ring(1).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1.5;
    for (const f of [1 / 3, 2 / 3, 1]) {
      ctx.strokeStyle = css(ink, f === 1 ? 0.4 : 0.22);
      const r = ring(f); line(r[0], r[1]); line(r[1], r[2]); line(r[2], r[0]);
    }
    ctx.lineWidth = 3; ctx.strokeStyle = css(ink, 0.55);
    const O = P(0, 0, 0);
    AXES.forEach((_, i) => { const [x, z] = spoke(i); line(O, P(x, 0, z)); });
    line(O, P(0, HEIGHT * 1.05, 0));
    AXES.forEach((a, i) => { const [x, z] = spoke(i); for (const f of [1 / 3, 2 / 3]) { const p = P(x * f, 0, z * f); text(String(Math.round(a.max * f)), p[0], p[1] + 14, 10.5, 600, 0.6); } });
    for (const f of [0.25, 0.5, 0.75]) { const p = P(0, f * HEIGHT, 0); text(`${f * 100}%`, p[0] + 8, p[1] + 3, 10.5, 600, 0.6, 'left'); }

    // each ball's pyramid: a base triangle on the floor and three sides meeting at the top point
    const faces = [], outlines = [];
    for (const b of balls) {
      const B = AXES.map((a, i) => { const [x, z] = spoke(i), r = Math.max(0.05, (b[a.k] / a.max) * g); return [x * r, 0, z * r]; });
      const A = [0, Math.max(0.06, b.rate * HEIGHT * g), 0];
      const c = rgb(b.hex), solid = radarSel === 'all' || radarSel === b.id;
      b.base = B.map(p => P(...p)); b.top = P(...A); b.solid = solid;
      if (!solid) { outlines.push(b); continue; }
      const face = (pts, shade, alpha) => {
        const R = pts.map(p => rot(...p));
        faces.push({ pts: R.map(proj), depth: R.reduce((s, p) => s + p[2], 0) / R.length, c: c.map(v => Math.round(Math.min(255, v * shade))), alpha });
      };
      for (let i = 0; i < 3; i++) {
        const p = B[i], q = B[(i + 1) % 3];
        // a side's brightness follows how squarely it faces the light
        const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [A[0] - p[0], A[1] - p[1], A[2] - p[2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const cen = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
        if (n[0] * cen[0] + n[2] * cen[2] < 0) n = n.map(v => -v);
        const m = Math.hypot(...n) || 1, nr = rot(n[0] / m, n[1] / m + HEIGHT / 2.2, n[2] / m);   // direction only, so undo the lift
        const lit = Math.max(0, nr[0] * LIGHT[0] + nr[1] * LIGHT[1] + nr[2] * LIGHT[2]);
        face([p, q, A], 0.72 + 0.4 * lit, radarSel === 'all' ? 0.55 : 0.78);
      }
      face(B, 0.7, radarSel === 'all' ? 0.3 : 0.42);
    }
    // the balls that are not picked: thin dashed outlines only, behind the solid one
    ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
    for (const b of outlines) {
      ctx.strokeStyle = css(rgb(b.hex).map(v => Math.round(v * 0.75)), 0.7);
      const [p0, p1, p2] = b.base;
      for (const [u, v] of [[p0, p1], [p1, p2], [p2, p0], [p0, b.top], [p1, b.top], [p2, b.top]]) line(u, v);
    }
    ctx.setLineDash([]);
    faces.sort((a, b) => b.depth - a.depth);   // far to near
    for (const f of faces) {
      ctx.beginPath(); f.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      ctx.fillStyle = css(f.c, f.alpha); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = css(f.c.map(v => Math.round(v * 0.6)), 0.9); ctx.stroke();
    }

    // axis names at the ends of the spokes and the top of the upright axis, then a dot on every corner
    AXES.forEach((a, i) => {
      const [x, z] = spoke(i), tip = P(x, 0, z), lab = P(x * 1.45, 0, z * 1.45);
      ctx.beginPath(); ctx.arc(tip[0], tip[1], 4, 0, Math.PI * 2); ctx.fillStyle = css(ink, 1); ctx.fill();
      text(a.name, lab[0], lab[1], 15, 700);
      text(`up to ${a.max}`, lab[0], lab[1] + 14, 12, 500, 0.75);
    });
    const top = P(0, HEIGHT * 1.05, 0);
    ctx.beginPath(); ctx.arc(top[0], top[1], 4, 0, Math.PI * 2); ctx.fillStyle = css(ink, 1); ctx.fill();
    text('Success rate', top[0], top[1] - 24, 15, 700);
    text('100% at the top', top[0], top[1] - 9, 12, 500, 0.75);
    for (const b of balls) {
      for (const [x, y] of [...b.base, b.top]) {
        ctx.beginPath(); ctx.arc(x, y, b.solid ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = b.hex; ctx.fill();
        ctx.lineWidth = b.solid ? 2.5 : 1.5; ctx.strokeStyle = css(ink, 1); ctx.stroke();
      }
    }
    // with one ball picked, a dashed line from its top point down to the floor, and every value written beside its point
    const pick = balls.find(b => b.id === radarSel);
    if (pick) {
      ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.strokeStyle = css(ink, 0.55); line(pick.top, O); ctx.setLineDash([]);
      const col = pick.hex;
      tag(`${Math.round(pick.rate * 100)}%`, pick.top[0], pick.top[1] - 18, col);
      AXES.forEach((a, i) => {
        const [bx, by] = pick.base[i], dx = bx - O[0], dy = by - O[1], m = Math.hypot(dx, dy) || 1;
        tag(String(pick[a.k]), bx + (dx / m) * 22, by + (dy / m) * 14 + 4, col);
      });
    }
  };

  canvas.addEventListener('pointerdown', e => { back = null; dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.01;
    pitch += (e.clientY - lastY) * 0.008;   // no limit: it can be turned over and seen from underneath
    lastX = e.clientX; lastY = e.clientY;
    if (still()) draw(performance.now());
  });
  const release = () => { dragging = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // run only while the canvas is on the page, so leaving the tab stops it
  const loop = now => { if (!canvas.isConnected) return; if (!document.hidden) draw(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return wrap;
}

function catching() {
  const t = totals(visible());
  const balls = Object.entries(t.balls).sort((a, b) => b[1].throws - a[1].throws).map(([id, b]) => ({
    id, name: (data.itemNames || {})[id] || `Ball #${id}`, throws: b.throws, caught: b.caught,
    sessions: visible().filter(x => ((x.balls || {})[id] || {}).throws > 0).length,   // in how many play sessions this ball was thrown
  }));
  if (!balls.length) return el('div', { class: 'empty' }, 'No ball throws found.');
  const items = balls.map(b => ({
    name: b.name, value: b.throws, sub: `caught ${b.caught} · ${b.throws ? Math.round(b.caught / b.throws * 100) : 0}% success`,
  }));
  const list = rows(items, 'Ball', 'Thrown');
  return card('lime', 'Balls thrown, by type',
    el('div', { class: 'radar' }, radar3d(balls), list),
    el('div', { class: 'note' }, `${t.catches} caught from ${t.throws} throws. Each catch is matched to the ball thrown just before it.`));
}
