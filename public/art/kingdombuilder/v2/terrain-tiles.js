(function () {
const TYPES = [
  { key: 'sea', name: 'Sea', sw: '#3d7fc0' },
  { key: 'lake', name: 'Lake', sw: '#5ea5da' },
  { key: 'coast', name: 'Coast', sw: '#e3cf96' },
  { key: 'grass', name: 'Grassland', sw: '#9cc05c' },
  { key: 'wheat', name: 'Wheat fields', sw: '#dcb553' },
  { key: 'hills', name: 'Hills', sw: '#98ae58' },
  { key: 'forest', name: 'Forest', sw: '#4f8a3c' },
  { key: 'mountain', name: 'Mountains', sw: '#8e86a0' }
];
const OLD = { grass: 0, wheat: 1, hills: 2, forest: 3, mountain: 4, sea: 5, lake: 6, coast: 7 };
const SHADOW = [0, 0, 0, 0, 0, 0.08, 0.18, 0.1];
const WATER = t => t < 2;
const hx = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const cl = (v, a, b) => v < a ? a : v > b ? b : v;
const C = h => hx(h);
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function pnoise(seed, T, oct) {
  const out = new Float32Array(T * T), r = rng(seed); let tot = 0;
  oct.forEach(([G, a]) => {
    const g = new Float32Array(G * G); for (let i = 0; i < G * G; i++) g[i] = r();
    for (let y = 0; y < T; y++) {
      const fy = y / T * G, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % G;
      for (let x = 0; x < T; x++) {
        const fx = x / T * G, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % G;
        out[y * T + x] += ((g[y0 * G + x0] * (1 - sx) + g[y0 * G + x1] * sx) * (1 - sy) + (g[y1 * G + x0] * (1 - sx) + g[y1 * G + x1] * sx) * sy) * a;
      }
    }
    tot += a;
  });
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}


function ground(ti, T) {
  const t = OLD[TYPES[ti].key], out = new Float32Array(T * T * 3);
  const n1 = pnoise(11 + t * 7, T, [[3, 1], [6, 0.7], [12, 0.35], [24, 0.15]]);
  const n2 = pnoise(97 + t * 13, T, [[48, 1], [24, 0.5]]);
  const n3 = pnoise(301 + t, T, [[5, 1], [10, 0.5]]);
  const w1 = t === 1 ? pnoise(71, T, [[3, 1], [6, 0.6], [12, 0.3]]) : null, w2 = t === 1 ? pnoise(83, T, [[4, 1], [8, 0.5]]) : null;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = y * T + x, a = n1[i], s = n2[i], p = n3[i], k = cl((a - 0.3) * 2.5, 0, 1);
    let c;
    if (t === 0) { c = mixc(C('#88b04c'), C('#a9cb66'), k); c = mixc(c, C('#c9a283'), cl((p - 0.68) / 0.05, 0, 1) * 0.8).map(v => v * (0.97 + 0.06 * s)); }
    else if (t === 1) {
      const ph = 2 * Math.PI * (9 * y / T + 7 * x / T) + (w1[i] - 0.5) * 22, st = 0.5 + 0.5 * Math.sin(ph), hue = cl((w2[i] - 0.35) * 3.3, 0, 1);
      c = mixc(mixc(C('#c4a646'), C('#e8c96a'), k), C('#b3b556'), hue * 0.4);
      c = mixc(c, c.map(v => v * 0.85), st * 0.35 * (0.5 + s)).map(v => v * (0.95 + 0.1 * s));
    }
    else if (t === 2) { c = mixc(C('#86a24a'), C('#a4be62'), k); c = mixc(c, C('#a89a66'), cl((p - 0.64) / 0.06, 0, 1) * 0.5).map(v => v * (0.97 + 0.06 * s)); }
    else if (t === 3) { c = mixc(C('#3f6d34'), C('#557f3c'), k).map(v => v * (0.95 + 0.1 * s)); }
    else if (t === 4) { c = mixc(C('#7a9a50'), C('#96b262'), k); c = mixc(c, C('#8e86a0'), cl((p - 0.56) / 0.1, 0, 1) * 0.75).map(v => v * (0.96 + 0.08 * s)); }
    else if (t === 5) {
      const ph = 2 * Math.PI * (5 * x / T + 3 * y / T) + (p - 0.5) * 14, cr = Math.pow(0.5 + 0.5 * Math.sin(ph), 10);
      c = mixc(C('#3574b6'), C('#4a90cf'), k); c = mixc(c, C('#a6d4ef'), cr * 0.35);
    }
    else if (t === 6) { c = mixc(C('#4488c7'), C('#5fa6da'), k); if (s > 0.8) c = mixc(c, C('#ffffff'), (s - 0.8) * 2); }
    else { c = mixc(C('#d6be86'), C('#ecdcaa'), k).map(v => v * (0.96 + 0.08 * s)); }
    out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
  }
  if (t === 2) {
    const hh = pnoise(701, T, [[7, 1], [9, 0.8], [13, 0.4]]), K = 9 * T / 128, LO = C('#7d8a45'), HI = C('#b7cf74');
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = y * T + x, xl = (x + T - 2) % T, xr = (x + 2) % T, yu = (y + T - 2) % T, yd = (y + 2) % T;
      const gx = hh[y * T + xr] - hh[y * T + xl], gy = hh[yd * T + x] - hh[yu * T + x];
      const sh = cl(1 + (0.6 * gx + 0.4 * gy) * K, 0.88, 1.12), ht = cl((hh[i] - 0.35) * 3.3, 0, 1);
      const base = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]], c = mixc(mixc(base, LO, (1 - ht) * 0.25), HI, ht * 0.2).map(v => Math.min(255, v * sh));
      out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
    }
  }
  return out;
}
const assetCache = {};
function assets(T) {
  if (assetCache[T]) return assetCache[T];
  return (assetCache[T] = { ground: TYPES.map((_, t) => ground(t, T)), mnoise: TYPES.map((_, t) => pnoise(501 + t * 31, T, [[3, 1], [6, 0.6], [12, 0.35], [24, 0.2]])) });
}

const FLAT = { lily: 1, cap: 1, drift: 1, flower: 1 };
const featCache = {};
function feats(ti, v) {
  const key = ti + ':' + v; if (featCache[key]) return featCache[key];
  const t = OLD[TYPES[ti].key], r = rng(1000 + t * 101 + v * 17), L = [];
  const place = (n, rmin, rmax, sep, tries, mk) => {
    let c = 0;
    for (let k = 0; k < tries && c < n; k++) {
      const rr = lerp(rmin, rmax, r()), m = rr + 0.02, x = lerp(m, 1 - m, r()), y = lerp(m, 1 - m, r());
      if (L.every(o => Math.hypot(o.x - x, o.y - y) > (o.r + rr) * sep)) { L.push(mk(x, y, rr)); c++; }
    }
  };
  const pine = (x, y, rr) => ({ k: 'pine', x, y, r: rr, alt: r() < 0.4 });
  const oak = (x, y, rr) => ({ k: 'oak', x, y, r: rr, lobes: [0, 1, 2, 3, 4].map(i => { const a = i * 1.257 + r() * 0.5; return [Math.cos(a) * 0.5, Math.sin(a) * 0.35, 0.6 + r() * 0.15]; }) });
  if (t === 0) { if (v) place(v, 0.028, 0.036, 4, 100, pine); place(2, 0.025, 0.032, 2.5, 200, (x, y, rr) => ({ k: 'bush', x, y, r: rr })); place(7, 0.018, 0.024, 1.4, 300, (x, y, rr) => ({ k: 'tuft', x, y, r: rr })); }
  if (t === 1) { const n = 15; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (((i + 0.5 + (r() - 0.5) * 0.9) / n) % 1 + 1) % 1, y = (((j + 0.5 + (r() - 0.5) * 0.9) / n) % 1 + 1) % 1; if (r() < 0.9) L.push({ k: 'wheat', x, y, r: 0.022, h: lerp(0.055, 0.07, r()), s: Math.floor(r() * 1e6) }); } place(5, 0.008, 0.012, 3, 200, (x, y, rr) => ({ k: 'flower', x, y, r: rr, col: r() < 0.5 ? '#c8463a' : '#f2efe4' })); }
  if (t === 2) {
    const hill = (x, y, rr) => { const n = 10 + Math.floor(r() * 3), a0 = r() * 6.28, pts = []; for (let i = 0; i < n; i++) { const a = a0 + Math.PI * 2 * i / n + (r() - 0.5) * 0.25, d = rr * lerp(0.85, 1, r()); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); } return { k: 'peak', hill: true, x, y, r: rr, pts, ax: x + (r() - 0.5) * rr * 0.25, ay: y + (r() - 0.5) * rr * 0.25, h: rr * lerp(0.55, 0.75, r()) }; };
    place(1, 0.2, 0.24, 1, 100, hill); place(2 + (v % 2), 0.13, 0.18, 0.62, 400, hill); place(2, 0.08, 0.1, 0.7, 300, hill); place(2, 0.026, 0.032, 2, 200, pine); place(2, 0.022, 0.03, 2, 200, (x, y, rr) => ({ k: 'bush', x, y, r: rr })); place(6, 0.018, 0.024, 1.4, 300, (x, y, rr) => ({ k: 'tuft', x, y, r: rr })); }
  if (t === 3) {
    const grid = (n, rmin, rmax, off) => { for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const rr = lerp(rmin, rmax, r()), x = (((i + off + (r() - 0.5) * 0.8) / n) % 1 + 1) % 1, y = (((j + off + (r() - 0.5) * 0.8) / n) % 1 + 1) % 1; L.push(r() < 0.7 ? pine(x, y, rr) : oak(x, y, rr * 1.05)); } };
    grid(9, 0.036, 0.05, 0.5); grid(8, 0.03, 0.042, 0.0); grid(9, 0.022, 0.03, 0.25);
  }
  if (t === 4) {
    const peak = (x, y, rr) => { const n = 6 + Math.floor(r() * 3), a0 = r() * 6.28, pts = []; for (let i = 0; i < n; i++) { const a = a0 + Math.PI * 2 * i / n + (r() - 0.5) * 0.5, d = rr * lerp(0.75, 1, r()); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); } return { k: 'peak', x, y, r: rr, pts, ax: x + (r() - 0.5) * rr * 0.3, ay: y + (r() - 0.5) * rr * 0.3, h: rr * lerp(1.4, 1.8, r()) }; };
    place(1, 0.27, 0.33, 1, 100, peak); place(2, 0.13, 0.19, 0.6, 300, peak); place(3, 0.028, 0.036, 1.4, 400, pine);
  }
  if (t === 5) place(6, 0.03, 0.05, 2, 300, (x, y, rr) => ({ k: 'cap', x, y, r: rr }));
  if (t === 6) place(6, 0.022, 0.036, 1.5, 300, (x, y, rr) => ({ k: 'lily', x, y, r: rr, a: r() * 6.28 }));
  if (t === 7) { place(3, 0.018, 0.026, 3, 200, (x, y, rr) => ({ k: 'stone', x, y, r: rr })); place(2, 0.03, 0.04, 3, 200, (x, y, rr) => ({ k: 'drift', x, y, r: rr, a: r() * 3.14 })); }
  return (featCache[key] = L);
}

function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function ell(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function tri(ctx, a, b, c, fill) { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...c); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = fill; ctx.lineWidth = 0.6; ctx.stroke(); }
function rgb(c) { return 'rgb(' + c.map(v => Math.round(cl(v, 0, 255))).join(',') + ')'; }

function drawFlat(ctx, f) {
  const { x, y, r } = f;
  if (f.k === 'cap') { ctx.strokeStyle = 'rgba(235,248,255,0.85)'; ctx.lineWidth = 0.008; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y + r * 0.6, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  else if (f.k === 'lily') {
    circle(ctx, x + r * 0.15, y + r * 0.2, r, 'rgba(20,60,90,0.25)');
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, f.a + 0.35, f.a + Math.PI * 2 - 0.35); ctx.closePath(); ctx.fillStyle = '#5fa648'; ctx.fill();
    circle(ctx, x - r * 0.25, y - r * 0.25, r * 0.35, '#83c35e');
    if (r > 0.03) circle(ctx, x + r * 0.2, y - r * 0.1, r * 0.3, '#f0a8c4');
  }
  else if (f.k === 'drift') { const dx = Math.cos(f.a) * r, dy = Math.sin(f.a) * r; ctx.lineCap = 'round'; ctx.strokeStyle = '#a3825a'; ctx.lineWidth = r * 0.35; ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke(); }
  else if (f.k === 'flower') { circle(ctx, x, y, r, f.col); circle(ctx, x, y, r * 0.4, '#e8b93a'); }
}

const LIGHT = (() => { const v = [-0.6, -0.4, 0.8], l = Math.hypot(...v); return v.map(a => a / l); })();
const VIEW = [0, 1, 1];
function dims(T) { const Wt = Math.round(T * 1.25), Ht = Math.round(Wt * Math.SQRT1_2), S = Math.round(Wt * 0.6), Z = Math.round(Wt * Math.SQRT1_2); return { Wt, Ht, S, Z, PX: Math.round(Wt * 0.18), HR: Math.round(Z * 0.95), BP: Math.round(Ht * 0.12) }; }
const Wt3 = P => P(1, 0, 0)[0] - P(0, 0, 0)[0];
function drawUp(ctx, f, P, S) {
  const [sx, sy] = P(f.x, f.y, 0), k = f.r * S * 1.15;
  const shadow = (w, h, dx) => { ctx.beginPath(); ctx.ellipse(sx + dx, sy + h * 0.2, w, h, -0.15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(30,55,20,0.24)'; ctx.fill(); };
  if (f.k === 'pine') {
    const R = f.r, pal = f.alt ? ['#2a6139', '#7cc466'] : ['#22533a', '#68b35a'];
    shadow(k * 1.5, k * 0.55, k * 1.1);
    const tb = P(f.x, f.y, 0), tt = P(f.x, f.y, R * 1.0);
    ctx.fillStyle = '#5e4128'; ctx.fillRect(tb[0] - k * 0.12, tt[1], k * 0.24, tb[1] - tt[1]);
    const N = 7, a0 = f.x * 37;
    [[0.35, 1.05, 1.5], [1.05, 0.8, 1.25], [1.7, 0.55, 1.05]].forEach(([z0, rb, th]) => {
      const z = z0 * R, rr = rb * R, ap = [f.x, f.y, z + th * R], ring = [];
      for (let i = 0; i < N; i++) { const an = a0 + Math.PI * 2 * i / N; ring.push([f.x + Math.cos(an) * rr, f.y + Math.sin(an) * rr, z]); }
      const Fs = [];
      for (let i = 0; i < N; i++) {
        const p = ring[i], q = ring[(i + 1) % N], a = [p[0] - ap[0], p[1] - ap[1], p[2] - ap[2]], b = [q[0] - ap[0], q[1] - ap[1], q[2] - ap[2]];
        let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        if (nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] <= 0) continue;
        const nl = Math.hypot(nx, ny, nz), dif = cl((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl, 0, 1);
        Fs.push({ p, q, d: p[1] + q[1], dif });
      }
      const A2 = P(...ap);
      Fs.sort((m, o) => m.d - o.d).forEach(({ p, q, dif }) => tri(ctx, A2, P(...p), P(...q), rgb(mixc(C(pal[0]), C(pal[1]), cl(dif * 1.15 - 0.05, 0, 1)))));
    });
  } else if (f.k === 'oak') {
    const R = f.r, cz = R * 1.55, c = P(f.x, f.y, cz), rs = R * Wt3(P) * 1.0, tb = P(f.x, f.y, 0);
    shadow(k * 1.6, k * 0.6, k * 1.2);
    ctx.fillStyle = '#5e4128'; ctx.fillRect(tb[0] - k * 0.14, c[1], k * 0.28, tb[1] - c[1]);
    const ball = (x, y, rad) => { const g = ctx.createRadialGradient(x - rad * 0.4, y - rad * 0.45, rad * 0.1, x, y, rad); g.addColorStop(0, '#9fd46e'); g.addColorStop(0.55, '#5f9f3f'); g.addColorStop(1, '#3a6f2a'); circle(ctx, x, y, rad, g); };
    const lobes = f.lobes.slice().sort((m, o) => m[1] - o[1]);
    lobes.forEach(([dx, dy, lr]) => ball(c[0] + dx * rs * 0.9, c[1] + dy * rs * 0.9 - rs * 0.1, lr * rs * 0.85));
    ball(c[0], c[1] - rs * 0.25, rs * 0.75);
  } else if (f.k === 'bridge') {
    const ax = f.axis === 'x' ? [1, 0] : [0, 1], bx = [-ax[1], ax[0]], L = 0.21, Wb = 0.09, hd = 0.075, ra = 0.5, ha = 0.052, pw = 0.014, ph = 0.022, N = 28;
    const prof = []; for (let i = 0; i <= N; i++) { const sv = -1 + 2 * i / N; prof.push([sv, hd * Math.pow(Math.cos(sv * Math.PI / 2), 0.55), Math.abs(sv) < ra ? ha * Math.sqrt(1 - (sv / ra) ** 2) : 0]); }
    const pt = (sv, off, z) => P(0.5 + ax[0] * sv * L + bx[0] * off, 0.5 + ax[1] * sv * L + bx[1] * off, z);
    const poly = (pts, fill, stroke) => { ctx.beginPath(); pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...p)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); } };
    const tone = (nx, ny, nz) => cl(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2], 0, 1);
    poly(prof.map(([sv]) => pt(sv, Wb / 2, 0)).concat(prof.slice().reverse().map(([sv]) => pt(sv, -Wb / 2, 0))).map(([x, y]) => [x + 3, y + 3]), 'rgba(20,40,60,0.28)');
    const side = sg => {
      const off = sg * Wb / 2, vis = bx[1] * sg * VIEW[1];
      if (vis <= 0) return;
      const col = rgb(mixc(C('#7d7567'), C('#d2cab8'), cl(0.3 + tone(bx[0] * sg, bx[1] * sg, 0), 0, 1)));
      poly(prof.map(([sv, h]) => pt(sv, off, h)).concat(prof.slice().reverse().map(([sv, , az]) => pt(sv, off, az))), col, 'rgba(70,64,55,0.5)');
      ctx.strokeStyle = 'rgba(80,72,60,0.35)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); prof.forEach(([sv, h, az], i) => { const z = Math.max(az, h * 0.5) + (h - Math.max(az, h * 0.5)) * 0.4; ctx[i ? 'lineTo' : 'moveTo'](...pt(sv, off, z)); }); ctx.stroke();
      for (let k = -4; k <= 4; k++) { const th = Math.PI / 2 + k * Math.PI / 10, sv = Math.cos(th) * ra, z = ha * Math.sin(th); ctx.beginPath(); ctx.moveTo(...pt(sv, off, z)); ctx.lineTo(...pt(sv * 1.28, off, z * 1.28)); ctx.stroke(); }
    };
    const parapet = sg => {
      const o1 = sg * Wb / 2, o0 = sg * (Wb / 2 - pw), sl = prof.slice(2, -2);
      if (bx[1] * sg * VIEW[1] > 0) poly(sl.map(([sv, h]) => pt(sv, o1, h)).concat(sl.slice().reverse().map(([sv, h]) => pt(sv, o1, h + ph))), rgb(mixc(C('#8a8272'), C('#cdc5b3'), 0.5)));
      else if (bx[1] * sg * VIEW[1] < 0) poly(sl.map(([sv, h]) => pt(sv, o0, h)).concat(sl.slice().reverse().map(([sv, h]) => pt(sv, o0, h + ph))), '#c3bba9');
      poly(sl.map(([sv, h]) => pt(sv, o1, h + ph)).concat(sl.slice().reverse().map(([sv, h]) => pt(sv, o0, h + ph))), '#e0d9c8', 'rgba(90,84,72,0.4)');
    };
    const back = bx[1] >= 0 ? -1 : 1;
    poly(prof.map(([sv, h]) => pt(sv, Wb / 2, h)).concat(prof.slice().reverse().map(([sv, h]) => pt(sv, -Wb / 2, h))), '#cfc6b3', 'rgba(90,84,72,0.45)');
    ctx.strokeStyle = 'rgba(120,110,95,0.35)'; ctx.lineWidth = 0.6;
    for (let i = 3; i < N - 2; i += 2) { const [sv, h] = prof[i]; ctx.beginPath(); ctx.moveTo(...pt(sv, Wb / 2 - pw, h)); ctx.lineTo(...pt(sv, -Wb / 2 + pw, h)); ctx.stroke(); }
    parapet(back); parapet(-back);
    side(-back);
  } else if (f.k === 'reed') {
    const Wu = Wt3(P), b = P(f.x, f.y, 0);
    ctx.lineCap = 'round';
    [[-0.9, 0.9, 0.06], [-0.3, 1.2, -0.02], [0.3, 1.0, 0.04], [0.8, 0.8, -0.05]].forEach(([dx, hh, lean], i) => {
      const bx = b[0] + dx * Wu * 0.008, tx = bx + lean * Wu * 0.3, ty = b[1] - hh * Wu * 0.06;
      ctx.strokeStyle = i % 2 ? '#5f9a3e' : '#78b24c'; ctx.lineWidth = Math.max(0.8, Wu * 0.004); ctx.beginPath(); ctx.moveTo(bx, b[1]); ctx.quadraticCurveTo(bx, (b[1] + ty) / 2, tx, ty); ctx.stroke();
      if (i === 1 || i === 2) ell(ctx, tx, ty + Wu * 0.006, Wu * 0.0045, Wu * 0.011, '#7a5230');
    });
  } else if (f.k === 'wheat') {
    const rr = rng(f.s), n = 7, Wu = Wt3(P);
    ctx.beginPath(); const b0 = P(f.x, f.y, 0); ctx.ellipse(b0[0] + Wu * 0.012, b0[1] + 1, Wu * 0.026, Wu * 0.011, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(90,70,20,0.22)'; ctx.fill();
    const st = [];
    for (let i = 0; i < n; i++) { const a = rr() * 6.28, d = rr() * f.r * 0.8, bx = f.x + Math.cos(a) * d, by = f.y + Math.sin(a) * d * 0.6, lean = (rr() - 0.5) * 0.02 + 0.006; st.push([bx, by, lean, f.h * lerp(0.85, 1.1, rr())]); }
    st.sort((m, o) => m[1] - o[1]).forEach(([bx, by, lean, h]) => {
      const b = P(bx, by, 0), t = P(bx + lean, by, h), e = P(bx + lean * 1.2, by, h * 1.18), left = lean < 0.006;
      ctx.strokeStyle = left ? '#c9a24a' : '#a98233'; ctx.lineWidth = Math.max(0.8, Wu * 0.005); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(...b); ctx.quadraticCurveTo(b[0], (b[1] + t[1]) / 2, t[0], t[1]); ctx.stroke();
      const ang = Math.atan2(e[1] - t[1], e[0] - t[0]) + Math.PI / 2, len = Math.hypot(e[0] - t[0], e[1] - t[1]) + Wu * 0.012;
      ctx.beginPath(); ctx.ellipse((t[0] + e[0]) / 2, (t[1] + e[1]) / 2 - Wu * 0.004, Wu * 0.0075, len * 0.55, ang, 0, Math.PI * 2); ctx.fillStyle = left ? '#f3d27a' : '#d9ad4c'; ctx.fill();
      ctx.beginPath(); ctx.ellipse((t[0] + e[0]) / 2 - Wu * 0.002, (t[1] + e[1]) / 2 - Wu * 0.006, Wu * 0.003, len * 0.3, ang, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,240,190,0.7)'; ctx.fill();
    });
  } else if (f.k === 'bush') {
    shadow(k * 1.1, k * 0.45, k * 0.6);
    circle(ctx, sx, sy - k * 0.45, k * 0.75, '#4f8b36'); circle(ctx, sx - k * 0.1, sy - k * 0.6, k * 0.6, '#68a647'); circle(ctx, sx - k * 0.3, sy - k * 0.8, k * 0.28, '#8cc462');
  } else if (f.k === 'tuft' || f.k === 'wtuft') {
    ctx.strokeStyle = f.k === 'tuft' ? '#6e9c3e' : '#b88a36'; ctx.lineWidth = Math.max(1, k * 0.12); ctx.lineCap = 'round';
    [-0.5, -0.15, 0.2, 0.5].forEach(dx => { ctx.beginPath(); ctx.moveTo(sx + dx * k * 0.4, sy); ctx.quadraticCurveTo(sx + dx * k * 0.6, sy - k * 0.6, sx + dx * k * 1.1, sy - k * 1.1); ctx.stroke(); });
    if (f.k === 'wtuft') [-0.5, -0.15, 0.2, 0.5].forEach(dx => ell(ctx, sx + dx * k * 1.1, sy - k * 1.15, k * 0.14, k * 0.26, '#f0cf73'));
  } else if (f.k === 'mound') {
    const gs = ctx.createRadialGradient(sx + k * 0.6, sy + k * 0.05, 0, sx + k * 0.6, sy + k * 0.05, k * 1.6);
    gs.addColorStop(0, 'rgba(50,70,25,0.28)'); gs.addColorStop(1, 'rgba(50,70,25,0)');
    ctx.fillStyle = gs; ctx.beginPath(); ctx.ellipse(sx + k * 0.6, sy + k * 0.05, k * 1.7, k * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(sx - k * 0.5, sy - k * 0.55, k * 0.05, sx, sy - k * 0.1, k * 1.5);
    g.addColorStop(0, 'rgba(198,220,138,1)'); g.addColorStop(0.45, 'rgba(160,190,96,0.95)'); g.addColorStop(0.8, 'rgba(128,160,74,0.6)'); g.addColorStop(1, 'rgba(128,160,74,0)');
    ctx.beginPath(); ctx.ellipse(sx, sy - k * 0.15, k * 1.5, k * 0.9, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  } else if (f.k === 'crag') {
    shadow(k * 1.6, k * 0.55, k * 0.9);
    const L = [sx - k * 1.2, sy], R = [sx + k * 1.15, sy - k * 0.05], F = [sx + k * 0.1, sy + k * 0.35], T1 = [sx - k * 0.55, sy - k * 1.05], T2 = [sx + k * 0.35, sy - k * 1.25], T3 = [sx + k * 0.8, sy - k * 0.6];
    tri(ctx, L, T1, F, '#cfcab9'); tri(ctx, T1, T2, F, '#b9b3a2'); tri(ctx, T2, T3, F, '#9b9586'); tri(ctx, T3, R, F, '#7f796c');
    ctx.beginPath(); ctx.moveTo(...T1); ctx.lineTo(...T2); ctx.lineTo(...T3); ctx.quadraticCurveTo(sx + k * 0.3, sy - k * 0.75, sx - k * 0.2, sy - k * 0.7); ctx.closePath(); ctx.fillStyle = '#8fbd58'; ctx.fill();
    ell(ctx, sx - k * 0.05, sy - k * 1.02, k * 0.35, k * 0.14, '#a9d271');
  } else if (f.k === 'stone') {
    shadow(k * 1.0, k * 0.4, k * 0.5);
    tri(ctx, [sx - k, sy], [sx - k * 0.2, sy - k * 1.1], [sx + k * 0.1, sy + k * 0.15], '#cfcabb');
    tri(ctx, [sx - k * 0.2, sy - k * 1.1], [sx + k, sy - k * 0.1], [sx + k * 0.1, sy + k * 0.15], '#9a9486');
  } else if (f.k === 'ridge') {
    const face = (Q) => {
      const a = [Q[1][0] - Q[0][0], Q[1][1] - Q[0][1], Q[1][2] - Q[0][2]], b = [Q[2][0] - Q[0][0], Q[2][1] - Q[0][1], Q[2][2] - Q[0][2]];
      let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz) || 1;
      if (nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] <= 0) return;
      const dif = cl((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl, 0, 1), col = rgb(mixc(C('#544a6a'), C('#bdb3d0'), cl(0.15 + dif * 1.05, 0, 1)));
      const pp = Q.map(q => P(...q));
      ctx.beginPath(); pp.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...p)); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke();
      const by = Math.max(...pp.map(p => p[1])), ty = Math.min(...pp.map(p => p[1])), g = ctx.createLinearGradient(0, by, 0, by - (by - ty) * 1.2 - 4);
      g.addColorStop(0, 'rgba(124,164,78,0.95)'); g.addColorStop(0.55, 'rgba(124,164,78,0.4)'); g.addColorStop(1, 'rgba(124,164,78,0)');
      ctx.fillStyle = g; ctx.fill();
    };
    const sg = f.segs;
    for (let i = 0; i < sg.length - 1; i++) {
      const [p0, h0, w0] = sg[i], [p1, h1, w1] = sg[i + 1], dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      const nx0 = sg[i].n ? sg[i].n[0] : nx, ny0 = sg[i].n ? sg[i].n[1] : ny, nx1 = sg[i + 1].n ? sg[i + 1].n[0] : nx, ny1 = sg[i + 1].n ? sg[i + 1].n[1] : ny;
      const T0 = [p0[0], p0[1], h0], T1 = [p1[0], p1[1], h1];
      const L0 = [p0[0] + nx0 * w0, p0[1] + ny0 * w0, 0], L1 = [p1[0] + nx1 * w1, p1[1] + ny1 * w1, 0], R0 = [p0[0] - nx0 * w0, p0[1] - ny0 * w0, 0], R1 = [p1[0] - nx1 * w1, p1[1] - ny1 * w1, 0];
      const sides = [[L0, L1, T1, T0], [R0, R1, T1, T0]].sort((A, B) => (A[0][1] + A[1][1]) - (B[0][1] + B[1][1]));
      sides.forEach(face);
    }
  } else if (f.k === 'peak') {
    const A = [f.ax, f.ay, f.h], base = f.pts.map(([u, v]) => [u, v, 0]);
    const sh = [f.ax - LIGHT[0] / LIGHT[2] * f.h * 0.9, f.ay - LIGHT[1] / LIGHT[2] * f.h * 0.9];
    const hp = base.map(([u, v]) => P(u, v, 0)).concat([P(sh[0], sh[1], 0)]).sort((m, o) => m[0] - o[0] || m[1] - o[1]);
    const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]), lo = [], up = [];
    for (const p of hp) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = hp.length - 1; i >= 0; i--) { const p = hp[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1));
    ctx.beginPath(); hull.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...p)); ctx.closePath();
    ctx.fillStyle = f.hill ? 'rgba(40,60,25,0.16)' : 'rgba(40,50,30,0.22)'; ctx.fill();
    const n = base.length, F = [];
    for (let i = 0; i < n; i++) {
      const p = base[i], q = base[(i + 1) % n], a = [p[0] - A[0], p[1] - A[1], p[2] - A[2]], b = [q[0] - A[0], q[1] - A[1], q[2] - A[2]];
      let nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const nl = Math.hypot(nx, ny, nz);
      if (nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] <= 0) continue;
      const dif = cl((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl, 0, 1);
      F.push({ p, q, d: p[1] + q[1], dif });
    }
    const top = P(...A), hS = top[1] - P(A[0], A[1], 0)[1] < 0 ? P(A[0], A[1], 0)[1] - top[1] : f.h * S;
    F.sort((m, o) => m.d - o.d).forEach(({ p, q, dif }) => {
      const pa = P(p[0], p[1], 0), pb = P(q[0], q[1], 0);
      tri(ctx, top, pa, pb, rgb(f.hill ? mixc(C('#5f8a3c'), C('#bcd97c'), cl(0.1 + dif * 1.05, 0, 1)) : mixc(C('#544a6a'), C('#bdb3d0'), cl(0.15 + dif * 1.05, 0, 1))));
      if (f.hill) { ctx.strokeStyle = 'rgba(255,255,240,' + (0.06 + dif * 0.12) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...top); ctx.lineTo(...pa); ctx.stroke(); return; }
      const by = Math.max(pa[1], pb[1]), g = ctx.createLinearGradient(0, by, 0, by - hS * 0.55);
      g.addColorStop(0, 'rgba(124,164,78,0.95)'); g.addColorStop(0.5, 'rgba(124,164,78,0.45)'); g.addColorStop(1, 'rgba(124,164,78,0)');
      ctx.beginPath(); ctx.moveTo(...top); ctx.lineTo(...pa); ctx.lineTo(...pb); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 + dif * 0.2) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(...top); ctx.lineTo(...pa); ctx.stroke();
    });
    if (f.snow) {
      const fr = 0.36;
      F.forEach(({ p, q, dif }, i) => {
        const j1 = fr * (0.85 + 0.3 * ((i * 7) % 5) / 4), j2 = fr * (0.85 + 0.3 * (((i + 1) * 7) % 5) / 4);
        const sp = [A[0] + (p[0] - A[0]) * j1, A[1] + (p[1] - A[1]) * j1, A[2] * (1 - j1)], sq = [A[0] + (q[0] - A[0]) * j2, A[1] + (q[1] - A[1]) * j2, A[2] * (1 - j2)];
        tri(ctx, top, P(...sp), P(...sq), rgb(mixc(C('#aab4c6'), C('#ffffff'), cl(0.25 + dif * 1.0, 0, 1))));
      });
    }
  }
}

const MID = { 8: [0.5, 0, 0, 1], 4: [1, 0.5, -1, 0], 2: [0.5, 1, 0, -1], 1: [0, 0.5, 1, 0] };
function riverCurves(bits) {
  const on = [8, 4, 2, 1].filter(b => bits & b).map(b => MID[b]), Cc = [];
  if (on.length === 2) {
    const [a, b] = on;
    if (a[2] === -b[2] && a[3] === -b[3]) {
      const px = -a[3] * 0.13, py = a[2] * 0.13;
      Cc.push([[a[0], a[1]], [a[0] + a[2] * 0.2, a[1] + a[3] * 0.2], [0.5 - a[2] * 0.14 + px, 0.5 - a[3] * 0.14 + py], [0.5, 0.5]]);
      Cc.push([[0.5, 0.5], [0.5 + a[2] * 0.14 - px, 0.5 + a[3] * 0.14 - py], [b[0] + b[2] * 0.2, b[1] + b[3] * 0.2], [b[0], b[1]]]);
    } else Cc.push([[a[0], a[1]], [a[0] + a[2] * 0.32, a[1] + a[3] * 0.32], [b[0] + b[2] * 0.32, b[1] + b[3] * 0.32], [b[0], b[1]]]);
  } else on.forEach(a => Cc.push([[a[0], a[1]], [a[0] + a[2] * 0.2, a[1] + a[3] * 0.2], [0.5 - a[2] * 0.12, 0.5 - a[3] * 0.12], [0.5, 0.5]]));
  return { C: Cc, pool: on.length === 1 ? 2 : on.length >= 3 ? 1 : 0 };
}
function cubicPts(c, n = 24) { const out = []; for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([0, 1].map(d => u * u * u * c[0][d] + 3 * u * u * t * c[1][d] + 3 * u * t * t * c[2][d] + t * t * t * c[3][d])); } return out; }
const RW = 0.14;
function riverSides(c, seed) {
  const pts = cubicPts(c, 48), n = pts.length - 1, rr = rng(seed), H = side => [1, 2, 3, 5].map(k => [k, rr() * 6.28, (0.5 + rr() * 0.5) / k]);
  const hl = H(), hr = H(), nz = (h, t) => h.reduce((v, [k, p, a]) => v + a * Math.sin(Math.PI * 2 * k * t + p), 0) / 1.6;
  return pts.map((p, i) => {
    const q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)], tx = q[0] - o[0], ty = q[1] - o[1], l = Math.hypot(tx, ty) || 1, t = i / n, env = Math.sin(Math.PI * t);
    return { p, nx: -ty / l, ny: tx / l, t, env, wl: RW / 2 * (1 + env * 0.45 * nz(hl, t)), wr: RW / 2 * (1 + env * 0.45 * nz(hr, t)), jl: nz(hl, t * 3.7), jr: nz(hr, t * 4.3) };
  });
}
function drawRiver(ctx, bits, noPool) {
  const rc = riverCurves(bits), pool = noPool ? 0 : rc.pool;
  const sides = rc.C.map((c, i) => riverSides(c, bits * 31 + i * 7 + 1));
  const band = (extra, jag, col) => {
    ctx.fillStyle = col;
    sides.forEach(S => {
      ctx.beginPath();
      S.forEach((o, i) => { const w = o.wl + extra + o.env * jag * o.jl; ctx[i ? 'lineTo' : 'moveTo'](o.p[0] + o.nx * w, o.p[1] + o.ny * w); });
      for (let i = S.length - 1; i >= 0; i--) { const o = S[i], w = o.wr + extra + o.env * jag * o.jr; ctx.lineTo(o.p[0] - o.nx * w, o.p[1] - o.ny * w); }
      ctx.closePath(); ctx.fill();
    });
    if (pool) { ctx.beginPath(); ctx.ellipse(0.5, 0.5, (RW * 0.5 + extra) * (pool === 2 ? 2.2 : 1.35), (RW * 0.5 + extra) * (pool === 2 ? 1.8 : 1.35), 0.3, 0, Math.PI * 2); ctx.fill(); }
  };
  band(0.05, 0.02, 'rgba(60,90,35,0.18)');
  band(0.032, 0.014, '#cdb886');
  band(0.014, 0.006, '#e6f4f6');
  band(0, 0, '#3a7cc0');
  band(-RW * 0.2, 0, '#3470b3');
  ctx.fillStyle = 'rgba(80,150,215,0.55)';
  sides.forEach(S => { ctx.beginPath(); S.forEach((o, i) => ctx[i ? 'lineTo' : 'moveTo'](o.p[0] + o.nx * o.wl * 0.25, o.p[1] + o.ny * o.wl * 0.25)); for (let i = S.length - 1; i >= 0; i--) { const o = S[i]; ctx.lineTo(o.p[0] - o.nx * o.wr * 0.05, o.p[1] - o.ny * o.wr * 0.05); } ctx.closePath(); ctx.fill(); });
  const sr = rng(bits * 97 + 5);
  sides.forEach(S => {
    for (let k = 0; k < 10; k++) { const o = S[Math.floor(sr() * S.length)], side = sr() < 0.5 ? 1 : -1, w = (side > 0 ? o.wl : o.wr) * (0.55 + sr() * 0.35); ctx.fillStyle = 'rgba(235,248,255,0.8)'; ctx.beginPath(); ctx.ellipse(o.p[0] + o.nx * w * side, o.p[1] + o.ny * w * side, 0.006 + sr() * 0.006, 0.003, Math.atan2(o.ny, o.nx) + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); }
    if (sr() < 0.7) { const o = S[Math.floor(S.length * (0.25 + sr() * 0.5))], side = sr() < 0.5 ? 1 : -1, w = (side > 0 ? o.wl : o.wr) * 0.5, x = o.p[0] + o.nx * w * side, y = o.p[1] + o.ny * w * side; drawFlat(ctx, { k: 'lily', x, y, r: 0.018, a: sr() * 6.28 }); if (sr() < 0.6) drawFlat(ctx, { k: 'lily', x: x + 0.025, y: y + 0.01, r: 0.013, a: sr() * 6.28 }); }
  });
}
function riverBankFeats(bits) {
  const rc = riverCurves(bits), out = [], sr = rng(bits * 131 + 9);
  rc.C.forEach((c, i) => { const S = riverSides(c, bits * 31 + i * 7 + 1); for (let k = 0; k < 7; k++) { const o = S[Math.floor(S.length * (0.12 + sr() * 0.76))], side = sr() < 0.5 ? 1 : -1, w = (side > 0 ? o.wl : o.wr) + 0.03 + sr() * 0.015; out.push({ k: sr() < 0.6 ? 'reed' : 'stone', x: o.p[0] + o.nx * w * side, y: o.p[1] + o.ny * w * side, r: 0.014 + sr() * 0.008, bank: true }); } });
  return out;
}
const cache = new Map();
function render(corners, T, opt = {}) {
  const v = opt.variant || 0, fx = opt.effects !== false, grid = opt.grid !== false, rb = opt.river || 0, sm = !!opt.summit, br = !!opt.bridge && (rb === 5 || rb === 10), key = [T, corners.join(''), v, fx, grid, rb, sm, br].join('|');
  if (cache.has(key)) return cache.get(key);
  const A = assets(T), present = [...new Set(corners)].sort((a, b) => a - b), base = present[0], layers = present.slice(1);
  const gc = document.createElement('canvas'); gc.width = gc.height = T;
  const g2 = gc.getContext('2d'), img = g2.createImageData(T, T), d = img.data, typeMap = new Uint8Array(T * T);
  const cw = layers.map(t => corners.map(c => c >= t ? 1 : 0)), W = 2.2 / T, Sh = Math.round(T * 0.03);
  const field = (li, x, y) => {
    x = x < 0 ? 0 : x > T - 1 ? T - 1 : x; y = y < 0 ? 0 : y > T - 1 ? T - 1 : y;
    const c = cw[li], u = (x + 0.5) / T, w = (y + 0.5) / T;
    return (c[0] * (1 - u) + c[1] * u) * (1 - w) + (c[3] * (1 - u) + c[2] * u) * w + cl((A.mnoise[layers[li]][y * T + x] - 0.5) * 1.3, -0.45, 0.45);
  };
  const ss = f => { const t = cl((f - 0.5 + W) / (2 * W), 0, 1); return t * t * (3 - 2 * t); };
  const gb = A.ground[base], hasWater = WATER(base);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = y * T + x;
    let r = gb[i * 3], g = gb[i * 3 + 1], b = gb[i * 3 + 2], top = base, fLand = -1;
    for (let li = 0; li < layers.length; li++) {
      const t = layers[li], f = field(li, x, y), m = ss(f);
      if (fLand < 0 && !WATER(t)) fLand = f;
      if (fx && SHADOW[t]) { const ms = ss(field(li, x - Sh, y - Sh)); if (ms > m) { const kk = 1 - SHADOW[t] * (ms - m); r *= kk; g *= kk; b *= kk; } }
      if (m > 0) { const gt = A.ground[t]; r = r * (1 - m) + gt[i * 3] * m; g = g * (1 - m) + gt[i * 3 + 1] * m; b = b * (1 - m) + gt[i * 3 + 2] * m; }
      if (m > 0.5) top = t;
    }
    if (hasWater && fLand >= 0) {
      if (WATER(top)) {
        const dd = 0.5 - fLand, sh = cl(1 - dd / 0.14, 0, 1) * 0.5, fo = cl(1 - dd / 0.035, 0, 1) * (0.6 + 0.35 * A.mnoise[0][i]);
        r = lerp(r, 140, sh); g = lerp(g, 208, sh); b = lerp(b, 232, sh); r = lerp(r, 238, fo); g = lerp(g, 248, fo); b = lerp(b, 250, fo);
      } else if (top !== 2) {
        const sd = cl(1 - (fLand - 0.5) / 0.05, 0, 1) * 0.75; r = lerp(r, 214, sd); g = lerp(g, 192, sd); b = lerp(b, 138, sd);
      }
    }
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; typeMap[i] = top;
  }
  g2.putImageData(img, 0, 0);
  const at = (u, w) => typeMap[cl(Math.floor(w * T), 0, T - 1) * T + cl(Math.floor(u * T), 0, T - 1)];
  const wetT = corners.some(c => WATER(c)), rp = rb ? riverCurves(rb).C.flatMap(c => cubicPts(c)) : [], rpool = rb && !wetT && riverCurves(rb).pool;
  const clear = f => !rb || (rp.every(([px, py]) => Math.hypot(px - f.x, py - f.y) > RW * 0.8 + 0.05 + f.r) && (!rpool || Math.hypot(0.5 - f.x, 0.5 - f.y) > RW * 1.6 + f.r));
  const ok = [];
  present.forEach(t => feats(t, v).forEach(f => { const k = f.r * 0.7; if (clear(f) && [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]].every(([dx, dy]) => at(f.x + dx, f.y + dy) === t)) ok.push(f); }));
  if (br) { for (let i = ok.length - 1; i >= 0; i--) if (Math.hypot(ok[i].x - 0.5, ok[i].y - 0.5) < 0.24 + ok[i].r) ok.splice(i, 1); ok.push({ k: 'bridge', axis: rb === 5 ? 'y' : 'x', x: 0.5, y: 0.5, r: 0 }); }
  if (rb) riverBankFeats(rb).forEach(f => { if ((!br || Math.hypot(f.x - 0.5, f.y - 0.5) > 0.24) && f.x > 0.01 && f.x < 0.99 && f.y > 0.01 && f.y < 0.99 && !WATER(at(f.x, f.y))) ok.push(f); });
  g2.save(); g2.scale(T, T);
  if (rb) drawRiver(g2, rb, wetT);
  ok.filter(f => FLAT[f.k]).forEach(f => drawFlat(g2, f));
  g2.restore();
  const D = dims(T), { Wt, Ht, S, Z, PX, HR, BP } = D, CW = Wt + 2 * PX, CH = HR + Ht + BP;
  const gcv = document.createElement('canvas'); gcv.width = CW; gcv.height = CH;
  const gx = gcv.getContext('2d'); gx.drawImage(gc, PX - 0.75, HR - 0.75, Wt + 1.5, Ht + 1.5);
  if (grid) { gx.strokeStyle = 'rgba(40,60,25,0.16)'; gx.lineWidth = 1; gx.strokeRect(PX + 0.5, HR + 0.5, Wt - 1, Ht - 1); }
  const fcv = document.createElement('canvas'); fcv.width = CW; fcv.height = CH;
  const P = (u, w, z) => [PX + u * Wt, HR + w * Ht - z * Z];
  const fctx = fcv.getContext('2d');
  if (sm) for (let i = 0; i < ok.length; i++) { const f = ok[i]; if (f.k === 'peak' && !f.hill && f.r > 0.12) ok[i] = Object.assign({}, f, { h: f.h * (f.r > 0.2 ? 1.6 : 1.35), snow: true }); }
  if (present.includes(7)) {
    const M7 = (p, q) => corners[p] === 7 && corners[q] === 7, pr = rng(4200 + v * 13);
    const mk = (x, y, rr) => { const n = 6 + Math.floor(pr() * 3), a0 = pr() * 6.28, pts = []; for (let i = 0; i < n; i++) { const an = a0 + Math.PI * 2 * i / n + (pr() - 0.5) * 0.5, dd = rr * lerp(0.78, 1, pr()); pts.push([x + Math.cos(an) * dd, y + Math.sin(an) * dd]); } return { k: 'peak', x, y, r: rr, pts, ax: x, ay: y, h: rr * lerp(1.1, 1.4, pr()) }; };
    [[M7(0, 1), (t, d) => [t, d]], [M7(1, 2), (t, d) => [1 - d, t]], [M7(2, 3), (t, d) => [t, 1 - d]], [M7(3, 0), (t, d) => [d, t]]].forEach(([on, pos]) => {
      if (!on) return;
      [[0.36, 0.13], [0.62, 0.15]].forEach(([t0, d0]) => {
        const rr = lerp(0.1, 0.13, pr()), [x, y] = pos(t0 + (pr() - 0.5) * 0.08, Math.max(d0, rr * 0.9 + 0.01));
        const f = mk(x, y, rr), kk = rr * 0.7;
        if ([[0, 0], [kk, 0], [-kk, 0], [0, kk], [0, -kk]].every(([dx, dy]) => at(x + dx, y + dy) === 7) && !ok.some(o => o.k === 'peak' && Math.hypot(o.x - x, o.y - y) < (o.r + rr) * 0.45)) ok.push(f);
      });
    });
  }
  ok.filter(f => !FLAT[f.k]).sort((p, q) => p.y - q.y).forEach(f => drawUp(fctx, f, P, S));
  const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const ctx = cv.getContext('2d'); ctx.drawImage(gcv, 0, 0); ctx.drawImage(fcv, 0, 0);
  cv.groundLayer = gcv; cv.featLayer = fcv;
  cache.set(key, cv);
  return cv;
}
const urls = new Map();
function url(corners, T, opt = {}) {
  const key = [T, corners.join(''), opt.variant || 0, opt.effects !== false, opt.grid !== false, opt.river || 0, !!opt.summit, !!opt.bridge && (opt.river === 5 || opt.river === 10)].join('|');
  if (!urls.has(key)) urls.set(key, render(corners, T, opt).toDataURL());
  return urls.get(key);
}
const PAIRS = []; for (let a = 0; a < TYPES.length; a++) for (let b = a + 1; b < TYPES.length; b++) PAIRS.push([a, b]);
const cornersFor = (a, b, i) => [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1].map(bit => bit ? b : a);
function compose(T, W, H, tileAt, opt) {
  const D = dims(T), c = document.createElement('canvas'); c.width = W * D.Wt + 2 * D.PX; c.height = H * D.Ht + D.HR + D.BP;
  const ctx = c.getContext('2d'), R = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const [corners, variant, river, summit, bridge] = tileAt(i, j); R.push([i, j, render(corners, T, Object.assign({}, opt, { variant, river, summit, bridge }))]); }
  R.forEach(([i, j, cv]) => ctx.drawImage(cv.groundLayer, i * D.Wt, j * D.Ht));
  ctx.save(); ctx.beginPath(); ctx.rect(D.PX, 0, W * D.Wt, H * D.Ht + D.HR); ctx.clip();
  R.forEach(([i, j, cv]) => ctx.drawImage(cv.featLayer, i * D.Wt, j * D.Ht));
  ctx.restore();
  return Object.assign({ canvas: c }, D);
}
function genMap(W, H, seed) {
  const r = rng(seed * 7919 + 3);
  const lat = G => { const g = []; for (let i = 0; i < (G + 2) * (G + 2); i++) g.push(r()); return { G, g }; };
  const smp = ({ G, g }, u, v) => {
    const fx = u * G, fy = v * G, x0 = Math.min(G, Math.floor(fx)), y0 = Math.min(G, Math.floor(fy)), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), R = G + 2;
    return (g[y0 * R + x0] * (1 - sx) + g[y0 * R + x0 + 1] * sx) * (1 - sy) + (g[(y0 + 1) * R + x0] * (1 - sx) + g[(y0 + 1) * R + x0 + 1] * sx) * sy;
  };
  const e1 = lat(3), e2 = lat(6), m1 = lat(4), m2 = lat(8), l1 = lat(5), side = r() < 0.5 ? 1 : -1;
  const elev = (u, v) => (smp(e1, u, v) + smp(e2, u, v) * 0.5) / 1.5 + (u - 0.5) * 0.45 * side;
  const corners = [];
  for (let j = 0; j <= H; j++) {
    const row = [];
    for (let i = 0; i <= W; i++) {
      const u = i / W, v = j / H, e = elev(u, v), m = (smp(m1, u, v) + smp(m2, u, v) * 0.4) / 1.4, l = smp(l1, u, v);
      row.push(e < 0.33 ? 0 : e < 0.39 ? 2 : e > 0.7 ? 7 : e > 0.6 ? 5 : l > 0.74 ? 1 : m > 0.56 ? 6 : m < 0.42 ? 4 : 3);
    }
    corners.push(row);
  }
  const ns = Array.from({ length: H + 1 }, () => new Array(W).fill(0)), ew = Array.from({ length: H }, () => new Array(W + 1).fill(0));
  const te = (i, j) => elev((i + 0.5) / W, (j + 0.5) / H), wet = (i, j) => [corners[j][i], corners[j][i + 1], corners[j + 1][i], corners[j + 1][i + 1]].some(c => c < 2);
  const allWet = (i, j) => [corners[j][i], corners[j][i + 1], corners[j + 1][i], corners[j + 1][i + 1]].every(c => c < 2);
  const high = (i, j) => [corners[j][i], corners[j][i + 1], corners[j + 1][i], corners[j + 1][i + 1]].some(c => c >= 5);
  const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]], dist = Array.from({ length: H }, () => new Array(W).fill(Infinity)), Q = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (wet(i, j)) { dist[j][i] = 0; Q.push([i, j]); }
  for (let q = 0; q < Q.length; q++) { const [i, j] = Q[q]; for (const [dx, dy] of D4) { const a = i + dx, b = j + dy; if (a >= 0 && b >= 0 && a < W && b < H && dist[b][a] === Infinity) { dist[b][a] = dist[j][i] + 1; Q.push([a, b]); } } }
  let best = null, bs = -1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const d = dist[j][i]; if (d === Infinity || d === 0) continue; const sc = d + (high(i, j) ? 1.5 : 0) + te(i, j); if (sc > bs) { bs = sc; best = [i, j]; } }
  const link = (i, j, a, b) => { if (i === a) ns[Math.max(j, b)][i] = 1; else ew[j][Math.max(i, a)] = 1; };
  if (best) {
    let [i, j] = best;
    for (let step = 0; step < 60 && dist[j][i] > 0; step++) {
      const nb = D4.map(([dx, dy]) => [i + dx, j + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && dist[b][a] === dist[j][i] - 1);
      nb.sort((p, q) => te(p[0], p[1]) - te(q[0], q[1]));
      const [a, b] = nb[0]; link(i, j, a, b); i = a; j = b;
    }
    const mouth = D4.map(([dx, dy]) => [i + dx, j + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < W && b < H && allWet(a, b));
    if (mouth.length) link(i, j, mouth[0][0], mouth[0][1]);
  }
  return { corners, ns, ew };
}


// Added for the app (not in the art-masters original): drop every cached tile and
// shrink its canvases to 0x0 so the browser frees their backing stores at once —
// iOS Safari counts undisposed canvases against a hard memory cap until GC runs.
function clearCache() {
  cache.forEach(cv => {
    [cv.groundLayer, cv.featLayer, cv].forEach(layer => { layer.width = layer.height = 0; });
  });
  cache.clear(); urls.clear();
}
window.TerrainTiles = { TYPES, PAIRS, render, url, cornersFor, genMap, compose, dims, clearCache };
})();
