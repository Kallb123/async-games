(function () {
const { Scene, K, shade } = window.IsoKit45;
const G = { leaf: '#5e9a45', pine: '#3f7f45', leafL: '#7bb357', hide: '#c9a57a', hideD: '#8e6a45', fire: '#f2a93b', rock: '#9d9a92', rockD: '#6d6b67', ore: '#b8683c', red: '#a8322f' };

function blob(s, cx, cy, z, r, col, n = 7) {
  for (let k = 0; k < n; k++) {
    const t0 = -1 + 2 * k / n, t1 = -1 + 2 * (k + 1) / n, tm = (t0 + t1) / 2;
    s.cyl('z', cx, cy, z + r + t0 * r, Math.max(0.05, r * Math.sqrt(1 - tm * tm)), (t1 - t0) * r, col, shade(col, 0.14));
  }
}
function pine(s, x, y, h = 3) {
  s.cyl('z', x, y, 0, 0.14, h * 0.3, K.bark, K.woodD);
  [[0.25, 0.75, 0.55], [0.5, 0.6, 0.45], [0.72, 0.42, 0.35]].forEach(([z, r, hh], i) => s.cone(x, y, h * z, r * h * 0.55, hh * h, i % 2 ? G.pine : shade(G.pine, 0.08), 6));
}
function oak(s, x, y, h = 2.6) {
  s.cyl('z', x, y, 0, 0.16, h * 0.45, K.bark, K.woodD);
  blob(s, x, y, h * 0.35, h * 0.38, G.leaf);
}
function crag(s, x, y, w, d, layers, col, ores) {
  let z = 0, px = x, py = y, pw = w, pd = d, tops = [];
  const rnd = (i, k) => (Math.sin(i * 12.9898 + k * 78.233 + x * 3.1) * 43758.5453) % 1;
  for (let i = 0; i < layers; i++) {
    const h = 0.6 + Math.abs(rnd(i, 1)) * 0.5;
    s.box(px, py, z, pw, pd, h, shade(col, (i % 2 ? 0.06 : -0.02)), { stone: 1, top: shade(col, 0.18) });
    tops.push([px, py, z + h, pw, pd]);
    const sx = pw * (0.12 + Math.abs(rnd(i, 2)) * 0.14), sy = pd * (0.12 + Math.abs(rnd(i, 3)) * 0.14);
    px += sx * (0.4 + Math.abs(rnd(i, 4))); py += sy * (0.4 + Math.abs(rnd(i, 5))); pw -= sx * 2; pd -= sy * 2; z += h;
    if (pw < 0.5 || pd < 0.5) break;
  }
  (ores || []).forEach(([li, fx, fy]) => { const t = tops[Math.min(li, tops.length - 1)]; s.box(t[0] + t[3] * fx, t[1] + t[4] * fy, t[2], 0.34, 0.34, 0.26, G.ore, { top: '#d88a55' }); });
  return tops;
}
function rock(s, x, y, w, d, h, c) { s.pyramid(x, y, 0, w, d, h, c || G.rock, { rows: 2 }); }
function cottage(s, x, y, w, d, h, roof, wall) {
  s.box(x, y, 0, w, d, h, wall || K.plaster, { timber: 2 });
  s.quadY(x + w * 0.4, x + w * 0.62, y + d + 0.02, 0, h * 0.75, K.woodD);
  s.roofX(x - 0.2, y - 0.2, h, w + 0.4, d + 0.4, h * 0.9, roof, { rows: 3, gable: K.plank });
}

function village() {
  const s = new Scene();
  s.box(0.2, 0.2, 0, 7.4, 7.4, 0.15, '#b9ab8c');
  cottage(s, 0.6, 0.6, 2.6, 2.0, 1.5, K.roofBrown);
  cottage(s, 4.2, 0.8, 2.6, 2.1, 1.7, K.thatch, K.wood);
  cottage(s, 0.8, 4.4, 2.3, 2.0, 1.4, K.roofBlue);
  s.cyl('z', 5.2, 5.0, 0.15, 0.6, 0.7, K.stone, '#3d6f8f');
  s.box(4.65, 4.95, 0.85, 0.08, 0.08, 1.1, K.woodD); s.box(5.67, 4.95, 0.85, 0.08, 0.08, 1.1, K.woodD);
  s.roofX(4.5, 4.4, 1.9, 1.4, 1.2, 0.4, K.roofBrown);
  for (let x = 3.6; x < 7.4; x += 0.6) s.box(x, 7.0, 0, 0.1, 0.1, 0.7, K.woodD);
  s.box(3.6, 7.0, 0.45, 3.7, 0.08, 0.1, K.wood);
  s.banner(-0.1, 3.6, 2.8, K.flag);
  return s;
}

function barbarian() {
  const s = new Scene();
  s.box(0.4, 0.4, 0, 7.2, 7.2, 0.12, '#a89878');
  s.cone(2.2, 2.0, 0.1, 1.3, 2.6, G.hide, 9);
  s.quadY(2.0, 2.4, 3.2, 0.1, 1.2, '#2b2f33');
  s.cone(5.6, 2.4, 0.1, 1.1, 2.2, G.hideD, 9);
  s.roofX(1.0, 4.4, 0.1, 2.6, 1.8, 1.3, G.hide, { gable: G.hideD, rows: 2 });
  for (let k = 0; k < 6; k++) { const a = Math.PI * 2 * k / 6; s.box(5.0 + 0.55 * Math.cos(a), 5.0 + 0.55 * Math.sin(a), 0.1, 0.18, 0.18, 0.16, G.rockD); }
  s.cone(5.1, 5.1, 0.2, 0.42, 0.9, G.fire, 5);
  s.cone(5.1, 5.1, 0.25, 0.22, 1.1, '#ffd86b', 4);
  s.smoke(5.1, 5.1, 1.6);
  const post = (x, y, h) => { s.cyl('z', x, y, 0, 0.13, h, K.bark, K.logEnd); s.cone(x, y, h, 0.13, 0.3, K.logEnd, 2); };
  for (let x = 0.4; x <= 7.6; x += 0.45) post(x, 0.2, 1.8);
  for (let y = 0.65; y <= 7.6; y += 0.45) post(0.2, y, 1.8);
  for (let x = 0.7; x <= 3.0; x += 0.45) post(x, 7.6, 1.5);
  for (let y = 0.65; y <= 3.0; y += 0.45) post(7.6, y, 1.5);
  s.seg([4.4, 7.9, 0], [5.4, 7.0, 1.1], K.woodD, 0.1); s.seg([5.4, 7.9, 0], [4.4, 7.0, 1.1], K.woodD, 0.1);
  s.cyl('z', 7.9, 6.6, 0, 0.08, 3.3, K.woodD, K.woodL);
  blob(s, 7.9, 6.6, 3.3, 0.28, '#efe7d4', 4);
  s.banner(1.9, 3.4, 3.4, G.red);
  return s;
}

function forest() {
  const s = new Scene();
  s.box(1.4, 2.0, 0, 5.2, 4.4, 0.1, '#b89a6c', { top: '#c7ab7c' });
  s.box(2.2, 2.6, 0.1, 3.4, 0.14, 1.6, K.plank, { vseam: 0.4 });
  [[2.2, 2.7], [5.6, 2.7], [2.2, 4.9], [5.6, 4.9]].forEach(([x, y]) => s.cyl('z', x, y, 0.1, 0.13, 1.9, K.bark, K.logEnd));
  s.roofX(1.8, 2.4, 2.0, 4.2, 2.9, 1.3, K.thatch, { rows: 4, ridge: '#a97a33' });
  s.lumber(2.8, 3.3, 2.0, 0.8, 2, { z: 0.1 });
  s.box(2.6, 5.7, 0.1, 0.14, 0.7, 0.6, K.woodD); s.box(2.55, 5.65, 0.7, 0.3, 0.8, 0.1, K.wood);
  s.box(4.9, 5.7, 0.1, 0.14, 0.7, 0.6, K.woodD); s.box(4.85, 5.65, 0.7, 0.3, 0.8, 0.1, K.wood);
  s.cyl('x', 2.3, 6.05, 1.08, 0.3, 3.3, K.bark, K.logEnd, { rings: true });
  s.box(3.9, 5.98, 1.3, 0.05, 0.1, 0.55, K.metal, { top: '#dfe3e7' });
  s.pile(5.9, 3.0, 2.6, 0.3, [3, 2, 1]);
  s.cyl('z', 1.9, 6.1, 0.1, 0.35, 0.4, K.bark, K.logEnd, { rings: true });
  s.box(1.85, 6.0, 0.5, 0.06, 0.06, 0.6, K.woodL); s.box(1.76, 5.97, 0.95, 0.24, 0.12, 0.18, K.iron, { top: K.metal });
  [[0.6, 0.6, 3.0], [2.0, 0.4, 3.4], [3.6, 0.5, 3.1], [5.2, 0.4, 3.5], [6.8, 0.7, 3.0], [0.5, 2.3, 2.9], [7.4, 2.4, 3.2], [0.4, 4.2, 3.1], [7.6, 4.4, 2.8], [0.7, 6.4, 2.6], [7.3, 6.5, 2.7], [6.2, 7.3, 2.3]].forEach(([x, y, h]) => pine(s, x, y, h));
  [[1.3, 1.5, 2.4], [6.2, 1.4, 2.5], [7.8, 3.3, 2.2], [0.9, 7.4, 2.0]].forEach(([x, y, h]) => oak(s, x, y, h));
  return s;
}

function quarry() {
  const s = new Scene(), peak = facetKit(s, ['#6f6452', '#e2d6bb']);
  peak(3.4, 2.4, 3.1, 3.6, 9, 71, false, true);
  peak(6.4, 2.8, 1.8, 2.3, 7, 83, false, true);
  s.box(0.6, 5.2, 0, 1.0, 0.9, 0.8, K.plaster, { vseam: 0.5 }); s.box(1.7, 5.4, 0, 0.9, 0.8, 0.7, K.plaster, { vseam: 0.45 });
  s.box(1.0, 5.3, 0.8, 1.0, 0.8, 0.7, shade(K.plaster, -0.05), { vseam: 0.5 });
  s.box(4.6, 6.2, 0, 1.6, 1.0, 0.7, K.wood, { boards: 2 });
  [4.9, 5.9].forEach(x => s.disc('xz', x, 7.2, 0.25, 0.25, K.woodD, { spokes: 4 }));
  s.box(4.7, 6.3, 0.7, 1.4, 0.8, 0.3, shade(K.plaster, -0.08));
  s.cyl('z', 7.4, 5.2, 0, 0.1, 3.4, K.woodD, K.woodL); s.seg([7.4, 5.2, 3.4], [5.8, 5.2, 3.4], K.woodD, 0.1);
  s.seg([5.9, 5.2, 3.4], [5.9, 5.2, 1.8], K.rope, 0.04); s.box(5.65, 5.0, 1.3, 0.5, 0.4, 0.45, K.plaster);
  s.seg([7.2, 7.6, 0], [6.6, 8.3, 0.9], K.woodD, 0.08); s.box(6.4, 8.2, 0.85, 0.5, 0.12, 0.12, K.metal);
  return s;
}

function facetKit(s, pal) {
  const { P, f } = window.IsoKit45, L = (() => { const v = [-0.6, -0.4, 0.8], l = Math.hypot(...v); return v.map(x => x / l); })();
  const mixh = (h1, h2, t) => { const A = [1, 3, 5].map(i => parseInt(h1.substr(i, 2), 16)), B = [1, 3, 5].map(i => parseInt(h2.substr(i, 2), 16)); return 'rgb(' + A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',') + ')'; };
  const peak = (cx, cy, rad, h, n, seed, ores, bands) => {
    let sd = seed; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const base = []; for (let i = 0; i < n; i++) { const an = Math.PI * 2 * i / n + (rnd() - 0.5) * 0.4, d = rad * (0.75 + rnd() * 0.25); base.push([cx + Math.cos(an) * d, cy + Math.sin(an) * d, 0]); }
    const A = [cx + (rnd() - 0.5) * rad * 0.2, cy + (rnd() - 0.5) * rad * 0.2, h];
    s.add([cx - rad, cy - rad, 0, cx + rad, cy + rad, h], () => {
      const F = [];
      for (let i = 0; i < n; i++) {
        const p = base[i], q = base[(i + 1) % n], u = [p[0] - A[0], p[1] - A[1], p[2] - A[2]], v = [q[0] - A[0], q[1] - A[1], q[2] - A[2]];
        let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (ny + nz <= 0) continue;
        const nl = Math.hypot(nx, ny, nz), dif = Math.max(0, Math.min(1, (nx * L[0] + ny * L[1] + nz * L[2]) / nl));
        F.push({ p, q, d: p[1] + q[1], dif, i });
      }
      const pt = x => P(...x).map(f).join(',');
      let out = '';
      F.sort((m1, m2) => m1.d - m2.d).forEach(({ p, q, dif, i }) => {
        const col = mixh(pal[0], pal[1], Math.min(1, 0.15 + dif * 1.05));
        out += '<polygon points="' + [A, p, q].map(pt).join(' ') + '" fill="' + col + '" stroke="' + col + '" stroke-width="0.03" stroke-linejoin="round"/>';
        out += '<polygon points="' + [[A[0] + (p[0] - A[0]) * 0.75, A[1] + (p[1] - A[1]) * 0.75, A[2] * 0.25], p, q, [A[0] + (q[0] - A[0]) * 0.75, A[1] + (q[1] - A[1]) * 0.75, A[2] * 0.25]].map(pt).join(' ') + '" fill="rgba(110,140,70,0.45)"/>';
        if (bands) [0.3, 0.55, 0.78].forEach(t => { const e1 = [A[0] + (p[0] - A[0]) * t, A[1] + (p[1] - A[1]) * t, A[2] * (1 - t)], e2 = [A[0] + (q[0] - A[0]) * t, A[1] + (q[1] - A[1]) * t, A[2] * (1 - t)]; out += '<line x1="' + P(...e1).map(f)[0] + '" y1="' + P(...e1).map(f)[1] + '" x2="' + P(...e2).map(f)[0] + '" y2="' + P(...e2).map(f)[1] + '" stroke="' + mixh(pal[0], pal[1], Math.max(0, dif * 0.8)) + '" stroke-width="0.09"/>'; out += '<line x1="' + P(...e1).map(f)[0] + '" y1="' + (P(...e1)[1] + 0.07).toFixed(3) + '" x2="' + P(...e2).map(f)[0] + '" y2="' + (P(...e2)[1] + 0.07).toFixed(3) + '" stroke="rgba(255,250,235,0.5)" stroke-width="0.04"/>'; });
        if (ores && (i % 2 === 0)) [[0.45, 0.3], [0.62, 0.55]].forEach(([t1, t2]) => {
          const c = [A[0] + (p[0] - A[0]) * t1 * (1 - t2 * 0.3) + (q[0] - A[0]) * t1 * t2 * 0.6, A[1] + (p[1] - A[1]) * t1 * (1 - t2 * 0.3) + (q[1] - A[1]) * t1 * t2 * 0.6, A[2] * (1 - t1)];
          const r0 = rad * 0.07, q4 = [[c[0] - r0, c[1], c[2]], [c[0], c[1], c[2] + r0 * 1.2], [c[0] + r0, c[1], c[2]], [c[0], c[1], c[2] - r0 * 1.1]];
          out += '<polygon points="' + q4.map(pt).join(' ') + '" fill="' + (dif > 0.5 ? '#e0914f' : '#b4622f') + '" stroke="#7a3f1c" stroke-width="0.03"/>';
        });
      });
      return out;
    });
  };
  return peak;
}

function ironHill() {
  const s = new Scene(), peak = facetKit(s, ['#4f4a45', '#bdb6a8']);
  peak(3.0, 2.6, 2.9, 4.6, 8, 11, true);
  peak(6.0, 3.2, 2.1, 3.0, 7, 29, true);
  peak(1.6, 5.0, 1.6, 1.9, 7, 47, false);
  s.box(3.9, 5.2, 0, 1.8, 0.2, 1.7, '#2b2f33');
  s.box(3.7, 5.35, 0, 0.22, 0.22, 1.85, K.woodD); s.box(5.6, 5.35, 0, 0.22, 0.22, 1.85, K.woodD);
  s.box(3.6, 5.3, 1.85, 2.3, 0.35, 0.25, K.wood);
  for (let y = 5.8; y < 8.6; y += 0.5) s.box(4.0, y, 0, 1.6, 0.18, 0.08, K.woodD);
  [4.25, 5.25].forEach(x => s.box(x, 5.7, 0.08, 0.08, 3.0, 0.08, K.metal, { top: '#e3e7ea' }));
  s.box(4.1, 6.9, 0.3, 1.4, 1.1, 0.8, K.iron, { top: '#4a5057' });
  [[4.3, 7.1], [4.5, 7.5], [4.9, 7.2], [5.1, 7.6], [4.7, 7.7]].forEach(([x, y]) => s.box(x, y, 1.1, 0.3, 0.26, 0.24, G.ore, { top: '#d88a55' }));
  [4.08, 5.52].forEach(x => s.disc('xz', x + 0.35, 8.0, 0.3, 0.22, K.iron, { spokes: 4 }));
  s.cyl('z', 7.2, 6.4, 0, 0.35, 0.5, K.plaster, '#ffffff');
  return s;
}

function plot() {
  const s = new Scene();
  s.box(0.3, 0.3, 0, 7.4, 7.4, 0.1, '#b89a6c', { top: '#cbb083' });
  [[1.4, 2.2], [4.6, 1.6], [2.8, 5.4], [5.9, 5.0]].forEach(([x, y], i) => s.box(x, y, 0.1, 0.5 + (i % 2) * 0.3, 0.3, 0.06, '#a88b5f', { top: '#b99c6f' }));
  const pts = []; for (let k = 0; k <= 4; k++) { const t = 0.5 + k * 1.75; pts.push([t, 0.5]); } for (let k = 1; k <= 4; k++) pts.push([7.5, 0.5 + k * 1.75]); for (let k = 3; k >= 0; k--) pts.push([0.5 + k * 1.75, 7.5]); for (let k = 3; k >= 1; k--) pts.push([0.5, 0.5 + k * 1.75]);
  pts.forEach(([x, y]) => { s.cyl('z', x, y, 0, 0.11, 1.35, K.woodD, K.woodL); s.cone(x, y, 1.35, 0.11, 0.18, K.woodL, 2); });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], mdp = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    [[1.18, 0.12], [0.7, 0.08]].forEach(([z, sag]) => { s.seg([a[0], a[1], z], [mdp[0], mdp[1], z - sag], K.rope, 0.035); s.seg([mdp[0], mdp[1], z - sag], [b[0], b[1], z], K.rope, 0.035); });
  }
  s.cyl('z', 6.4, 6.6, 0, 0.08, 1.9, K.woodD, K.woodL);
  s.box(5.75, 6.6, 1.25, 1.3, 0.08, 0.7, K.plank, { boards: 2 });
  return s;
}
function villageLv(n) {
  const s = new Scene();
  s.box(0.2, 0.2, 0, 7.6, 7.6, 0.12, '#b9ab8c', { top: '#c9bb99' });
  const hs = 1.3 + n * 0.08, roofs = [K.roofBrown, K.thatch, K.roofBlue, K.roofBrown, K.roofBlue];
  const slots = [[3.0, 2.6, 2.4, 1.9], [1.1, 1.0, 2.1, 1.7], [4.9, 1.1, 2.0, 1.7], [1.2, 4.6, 2.0, 1.6], [4.8, 4.5, 2.0, 1.6]];
  const order = n === 1 ? [0] : [1, 2, 3, 4, 0].slice(0, n);
  order.forEach((k, i) => { const [x, y, w, d] = slots[k]; cottage(s, x, y, w, d, hs + (k === 0 && n >= 4 ? 0.5 : 0), roofs[(k + n) % 5], n >= 4 && k !== 0 ? K.plaster : n >= 3 ? K.plaster : K.wood); });
  if (n <= 2) { s.cyl('z', 6.6, 6.6, 0.12, 0.45, 0.6, K.stone, '#3d6f8f'); s.box(6.2, 6.55, 0.7, 0.06, 0.06, 0.9, K.woodD); s.box(6.95, 6.55, 0.7, 0.06, 0.06, 0.9, K.woodD); s.roofX(6.05, 6.1, 1.55, 1.1, 1.0, 0.35, K.roofBrown); }
  const rail = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), N = Math.max(1, Math.round(L / 0.8)); for (let i = 0; i <= N; i++) s.box(a[0] + dx * i / N - 0.05, a[1] + dy * i / N - 0.05, 0.12, 0.1, 0.1, 0.75, K.woodD); s.seg([a[0], a[1], 0.7], [b[0], b[1], 0.7], K.wood, 0.05); s.seg([a[0], a[1], 0.42], [b[0], b[1], 0.42], K.wood, 0.05); };
  const pal = (a, b, h) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), N = Math.round(L / 0.36); for (let i = 0; i <= N; i++) { const x = a[0] + dx * i / N, y = a[1] + dy * i / N; s.cyl('z', x, y, 0.12, 0.17, h, K.bark, K.logEnd); s.cone(x, y, 0.12 + h, 0.17, 0.3, K.logEnd, 2); } };
  const wall = (x, y, w, d) => { s.box(x, y, 0.12, w, d, 1.3, K.stone, { stone: 2 }); const along = w > d; for (let t = 0.1; t < (along ? w : d) - 0.2; t += 0.55) s.box(along ? x + t : x, along ? y : y + t, 1.42, along ? 0.3 : w, along ? d : 0.3, 0.28, K.stone); };
  const tower = (x, y, h, stone) => {
    if (stone) { s.cyl('z', x, y, 0.12, 0.62, h, K.stone, K.stone); s.cyl('z', x, y, 0.12 + h, 0.75, 0.3, shade(K.stone, -0.1), K.stone); s.cone(x, y, 0.42 + h, 0.8, 1.5, K.roofBlue, 7); }
    else { [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].forEach(([dx, dy]) => s.box(x + dx - 0.07, y + dy - 0.07, 0.12, 0.14, 0.14, h, K.woodD)); s.box(x - 0.65, y - 0.65, h, 1.3, 1.3, 0.25, K.wood, { boards: 1 }); s.box(x - 0.65, y + 0.6, h + 0.25, 1.3, 0.05, 0.4, K.plank); s.cone(x, y, h + 0.25, 0.95, 1.0, K.roofBrown, 5); }
  };
  const P0 = 0.3, P1 = 7.7, g0 = 3.3, g1 = 4.7;
  if (n === 1) rail([P0, P1], [2.6, P1]);
  if (n === 2) { rail([P0, P0], [P1, P0]); rail([P1, P0], [P1, P1]); rail([P0, P0], [P0, P1]); rail([P0, P1], [g0, P1]); rail([g1, P1], [P1, P1]); }
  if (n === 3 || n === 4) {
    const h = n === 3 ? 1.5 : 1.9; pal([P0, P0], [P1, P0], h); pal([P1, P0], [P1, P1], h); pal([P0, P0], [P0, P1], h); pal([P0, P1], [g0, P1], h); pal([g1, P1], [P1, P1], h);
    if (n === 3) tower(6.8, 6.6, 2.4, false);
    else { tower(g0 - 0.3, P1, 2.8, false); tower(g1 + 0.3, P1, 2.8, false); s.box(g0 - 0.3, P1 - 0.1, 2.3, g1 - g0 + 0.6, 0.2, 0.3, K.wood); s.banner(0.9, 6.9, 3.4, K.flag); }
  }
  if (n === 5) {
    wall(P0, P0, P1 - P0, 0.4); wall(P1 - 0.4, P0, 0.4, P1 - P0); wall(P0, P0, 0.4, P1 - P0); wall(P0, P1 - 0.4, g0 - P0, 0.4); wall(g1, P1 - 0.4, P1 - g1, 0.4);
    [[P0 + 0.2, P0 + 0.2], [P1 - 0.2, P0 + 0.2], [P0 + 0.2, P1 - 0.2], [P1 - 0.2, P1 - 0.2]].forEach(([x, y]) => tower(x, y, 2.3, true));
    s.box(g0 - 0.2, P1 - 0.5, 0.12, 0.35, 0.6, 2.0, K.stone, { stone: 3 }); s.box(g1 - 0.15, P1 - 0.5, 0.12, 0.35, 0.6, 2.0, K.stone, { stone: 3 });
    s.box(g0 - 0.2, P1 - 0.5, 1.7, g1 - g0 + 0.35, 0.6, 0.45, K.stone, { stone: 1 });
    s.banner(2.2, 7.9, 3.8, K.flag); s.banner(5.4, 7.9, 3.8, K.flag);
  }
  return s;
}
const B = { village, barbarian, forest, quarry, iron: ironHill, plot, village1: () => villageLv(1), village2: () => villageLv(2), village3: () => villageLv(3), village4: () => villageLv(4), village5: () => villageLv(5) };
window.MapIcons45 = { build(key, opt = {}) { return B[key]().render(Object.assign({ id: 'mi' + key, fit: true, pad: 0.1 }, opt)); } };
})();
