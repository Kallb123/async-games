(function () {
const P = (x, y, z) => [x, (y - z) * 0.7071];
const f = n => (Math.round(n * 1000) / 1000).toString();
function h2r(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
function r2h(r) { return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function shade(h, a) { const r = h2r(h); return r2h(a >= 0 ? r.map(v => v + (255 - v) * a) : r.map(v => v * (1 + a))); }
const pts = a => a.map(p => f(p[0]) + ',' + f(p[1])).join(' ');
function poly(a, fill, stroke, sw, extra) { return `<polygon points="${pts(a)}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="${sw == null ? 0.04 : sw}" stroke-linejoin="round" ${extra || ''}/>`; }
function ln(a, b, stroke, sw, extra) { return `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${stroke}" stroke-width="${sw || 0.03}" stroke-linecap="round" ${extra || ''}/>`; }
function hull(p) {
  p = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}

const K = {
  wood: '#c48a4e', woodD: '#7f5230', woodL: '#e4b97e', plank: '#d6a466', bark: '#7a4d2a', logEnd: '#ecc98f',
  thatch: '#dcae55', stone: '#c2bcae', metal: '#b4bcc4', iron: '#5b626a', roofBrown: '#9a5d3c', roofBlue: '#5980a6',
  plaster: '#efe7d4', water: '#62b6e0', flag: '#2f5fa8', glass: '#34495e', rope: '#a88a5c', brick: '#b45a3f', slate: '#5e6772', steel: '#a3adb6', roofRed: '#a4483a', yellow: '#e3b23c', clad: '#4f7ea8', concrete: '#d8d4cb', wrap: '#eee6d0'
};

class Scene {
  constructor() { this.items = []; this.over = []; }
  add(b, draw) { this.items.push({ b, draw }); }

  box(x, y, z, w, d, h, c, o = {}) {
    const sc = o.stroke || shade(c, -0.5);
    this.add([x, y, z, x + w, y + d, z + h], () => {
      let s = '';
      const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
      const L = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
      const R = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
      s += poly(L, o.left || c, sc) + poly(R, o.right || shade(o.left || c, -0.2), sc) + poly(top, o.top || shade(c, 0.16), sc);
      const lc = shade(c, -0.3);
      if (o.boards) for (let i = 1; i < o.boards; i++) { const zz = z + h * i / o.boards; s += ln(P(x, y + d, zz), P(x + w, y + d, zz), lc, 0.025) + ln(P(x + w, y, zz), P(x + w, y + d, zz), lc, 0.025); }
      if (o.vseam) { for (let t = x + o.vseam; t < x + w - 0.05; t += o.vseam) s += ln(P(t, y + d, z), P(t, y + d, z + h), lc, 0.025); for (let t = y + o.vseam; t < y + d - 0.05; t += o.vseam) s += ln(P(x + w, t, z), P(x + w, t, z + h), lc, 0.025); }
      if (o.topSeam) for (let t = x + o.topSeam; t < x + w - 0.05; t += o.topSeam) s += ln(P(t, y, z + h), P(t, y + d, z + h), lc, 0.025);
      if (o.stone) {
        const n = o.stone, sl = shade(c, -0.28);
        for (let i = 0; i < n; i++) {
          const z0 = z + h * i / n, z1 = z + h * (i + 1) / n, off = i % 2 ? 0.45 : 0;
          if (i) s += ln(P(x, y + d, z0), P(x + w, y + d, z0), sl, 0.03) + ln(P(x + w, y, z0), P(x + w, y + d, z0), sl, 0.03);
          for (let t = x + 0.45 + off; t < x + w - 0.1; t += 0.9) s += ln(P(t, y + d, z0), P(t, y + d, z1), sl, 0.03);
          for (let t = y + 0.45 + off; t < y + d - 0.1; t += 0.9) s += ln(P(x + w, t, z0), P(x + w, t, z1), sl, 0.03);
        }
      }
      if (o.timber) {
        const tc = K.woodD, tw = 0.13, st = o.timber;
        s += ln(P(x, y + d, z + h * 0.52), P(x + w, y + d, z + h * 0.52), tc, tw) + ln(P(x + w, y, z + h * 0.52), P(x + w, y + d, z + h * 0.52), tc, tw);
        for (let t = x; t <= x + w + 0.01; t += w / st) s += ln(P(t, y + d, z), P(t, y + d, z + h), tc, tw);
        for (let t = y; t <= y + d + 0.01; t += d / Math.max(2, Math.round(st * d / w))) s += ln(P(x + w, t, z), P(x + w, t, z + h), tc, tw);
        s += ln(P(x, y + d, z + h), P(x + w, y + d, z + h), tc, tw) + ln(P(x + w, y, z + h), P(x + w, y + d, z + h), tc, tw);
      }
      return s;
    });
  }

  roofX(x, y, z, w, d, h, c, o = {}) {
    const sc = o.stroke || shade(c, -0.5);
    this.add([x, y, z, x + w, y + d, z + h], () => {
      const m = y + d / 2;
      let s = poly([P(x, y, z), P(x + w, y, z), P(x + w, m, z + h), P(x, m, z + h)], shade(c, -0.12), sc);
      s += poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, m, z + h)], o.gable || shade(c, -0.3), sc);
      if (o.gable) { const gl = shade(o.gable, -0.3); for (let t = y + 0.45; t < y + d; t += 0.45) { const zt = z + h * (1 - Math.abs(t - m) / (d / 2)); s += ln(P(x + w, t, z), P(x + w, t, zt), gl, 0.025); } }
      s += poly([P(x, m, z + h), P(x + w, m, z + h), P(x + w, y + d, z), P(x, y + d, z)], shade(c, 0.06), sc);
      const lc = shade(c, -0.32);
      for (let i = 1; i < (o.rows || 0); i++) { const t = i / o.rows; s += ln(P(x, m + t * d / 2, z + h * (1 - t)), P(x + w, m + t * d / 2, z + h * (1 - t)), lc, 0.035); }
      if (o.shingle) for (let i = 0; i < o.rows; i++) { const t0 = i / o.rows, t1 = (i + 1) / o.rows; for (let u = x + (i % 2 ? 0.35 : 0.7); u < x + w - 0.1; u += 0.7) s += ln(P(u, m + t0 * d / 2, z + h * (1 - t0)), P(u, m + t1 * d / 2, z + h * (1 - t1)), lc, 0.025); }
      s += ln(P(x - 0.05, m, z + h + 0.05), P(x + w + 0.05, m, z + h + 0.05), o.ridge || shade(c, -0.4), 0.16);
      return s;
    });
  }

  cyl(ax, a, b, c, r, len, col, cap, o = {}) {
    const N = 28, e0 = [], e1 = [], lit = [];
    for (let k = 0; k < N; k++) {
      const g = Math.PI * 2 * k / N, u = Math.cos(g), v = Math.sin(g);
      let p0, p1, L;
      if (ax === 'x') { p0 = [a, b + r * u, c + r * v]; p1 = [a + len, b + r * u, c + r * v]; L = v + 0.35 * u > 0.1; }
      else if (ax === 'y') { p0 = [a + r * u, b, c + r * v]; p1 = [a + r * u, b + len, c + r * v]; L = v + 0.35 * u > 0.1; }
      else { p0 = [a + r * u, b + r * v, c]; p1 = [a + r * u, b + r * v, c + len]; L = v - u > 0.2; }
      e0.push(P(...p0)); e1.push(P(...p1)); if (L) { lit.push(P(...p0), P(...p1)); }
    }
    const bb = ax === 'x' ? [a, b - r, c - r, a + len, b + r, c + r] : ax === 'y' ? [a - r, b, c - r, a + r, b + len, c + r] : [a - r, b - r, c, a + r, b + r, c + len];
    this.add(bb, () => {
      const sc = shade(col, -0.45);
      let s = poly(hull(e0.concat(e1)), shade(col, -0.12), sc) + poly(hull(lit), shade(col, 0.08), 'none');
      s += poly(e1, cap || shade(col, 0.2), sc);
      if (o.rings) {
        const ctr = e1.reduce((m, p) => [m[0] + p[0] / N, m[1] + p[1] / N], [0, 0]), rc = shade(cap, -0.22);
        [0.62, 0.3].forEach(t => { s += poly(e1.map(p => [ctr[0] + (p[0] - ctr[0]) * t, ctr[1] + (p[1] - ctr[1]) * t]), 'none', rc, 0.028); });
      }
      return s;
    });
  }

  disc(pl, cx, cy, cz, r, col, o = {}) {
    const N = o.teeth ? o.teeth * 2 : 30, t = o.thick || 0.08, ring = (rad, off, tooth) => {
      const a = [];
      for (let k = 0; k < N; k++) {
        const g = Math.PI * 2 * k / N, rr = tooth && k % 2 ? rad * 1.1 : rad;
        a.push(pl === 'xz' ? P(cx + rr * Math.cos(g), cy + off, cz + rr * Math.sin(g)) : P(cx + off, cy + rr * Math.cos(g), cz + rr * Math.sin(g)));
      }
      return a;
    };
    const pt = (rad, g) => pl === 'xz' ? P(cx + rad * Math.cos(g), cy, cz + rad * Math.sin(g)) : P(cx, cy + rad * Math.cos(g), cz + rad * Math.sin(g));
    const bb = pl === 'xz' ? [cx - r, cy - t, cz - r, cx + r, cy, cz + r] : [cx - t, cy - r, cz - r, cx, cy + r, cz + r];
    this.add(bb, () => {
      const sc = shade(col, -0.5);
      let s = poly(ring(r, -t, o.teeth), shade(col, -0.3), sc) + poly(ring(r, 0, o.teeth), col, sc);
      if (o.shine) s += poly(ring(r * 0.72, 0), 'none', shade(col, 0.35), 0.05);
      if (o.rim) s += poly(ring(r * 0.82, 0), 'none', shade(col, -0.35), 0.05);
      for (let k = 0; k < (o.spokes || 0); k++) { const g = Math.PI * 2 * k / o.spokes; s += ln(pt(0, 0), pt(r * 0.85, g), shade(col, -0.35), 0.09); }
      s += poly(ring(r * (o.hub || 0.16), 0.01), o.hubCol || K.iron, shade(K.iron, -0.4));
      return s;
    });
  }

  wheel(cx, cy, cz, r, w, col) {
    const N = 32, circ = (rad, xx) => { const a = []; for (let k = 0; k < N; k++) { const g = Math.PI * 2 * k / N; a.push(P(xx, cy + rad * Math.cos(g), cz + rad * Math.sin(g))); } return a; };
    const ringPath = (o, i) => `M${pts(o).replace(/ /g, ' L')} Z M${pts(i.slice().reverse()).replace(/ /g, ' L')} Z`;
    this.add([cx, cy - r * 1.06, cz - r * 1.06, cx + w, cy + r * 1.06, cz + r * 1.06], () => {
      const sc = shade(col, -0.5);
      let s = `<path d="${ringPath(circ(r, cx), circ(r * 0.86, cx))}" fill="${shade(col, -0.3)}" stroke="${sc}" stroke-width="0.04" fill-rule="evenodd"/>`;
      const pads = [];
      for (let k = 0; k < 14; k++) {
        const g = Math.PI * 2 * k / 14, c1 = Math.cos(g), s1 = Math.sin(g), r1 = r * 0.74, r2 = r * 1.06;
        pads.push({ dep: cy + r * c1 + cz + r * s1, q: [P(cx, cy + r1 * c1, cz + r1 * s1), P(cx, cy + r2 * c1, cz + r2 * s1), P(cx + w, cy + r2 * c1, cz + r2 * s1), P(cx + w, cy + r1 * c1, cz + r1 * s1)] });
      }
      pads.sort((a, b) => a.dep - b.dep).forEach(p => { s += poly(p.q, shade(col, 0.08), sc); });
      s += `<path d="${ringPath(circ(r, cx + w), circ(r * 0.86, cx + w))}" fill="${col}" stroke="${sc}" stroke-width="0.04" fill-rule="evenodd"/>`;
      for (let k = 0; k < 8; k++) { const g = Math.PI * 2 * k / 8; s += ln(P(cx + w, cy, cz), P(cx + w, cy + r * 0.88 * Math.cos(g), cz + r * 0.88 * Math.sin(g)), sc, 0.16) + ln(P(cx + w, cy, cz), P(cx + w, cy + r * 0.88 * Math.cos(g), cz + r * 0.88 * Math.sin(g)), col, 0.09); }
      s += poly(circ(r * 0.2, cx + w + 0.01), K.iron, shade(K.iron, -0.4));
      return s;
    });
  }

  quadY(x0, x1, y, z0, z1, fill, o = {}) {
    this.add([x0, y, z0, x1, y + 0.02, z1], () => {
      let s = poly([P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], fill, o.frame || shade(fill, -0.45), o.frame ? 0.09 : 0.04);
      if (o.cross) s += ln(P((x0 + x1) / 2, y, z0), P((x0 + x1) / 2, y, z1), o.frame, 0.06) + ln(P(x0, y, (z0 + z1) / 2), P(x1, y, (z0 + z1) / 2), o.frame, 0.06);
      if (o.bands) [0.25, 0.75].forEach(t => { s += ln(P(x0, y, z0 + (z1 - z0) * t), P(x1, y, z0 + (z1 - z0) * t), K.iron, 0.08); });
      if (o.vlines) for (let t = x0 + o.vlines; t < x1 - 0.05; t += o.vlines) s += ln(P(t, y, z0), P(t, y, z1), shade(fill, -0.35), 0.025);
      return s;
    });
  }
  quadX(x, y0, y1, z0, z1, fill, o = {}) {
    this.add([x, y0, z0, x + 0.02, y1, z1], () => {
      let s = poly([P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)], fill, o.frame || shade(fill, -0.45), o.frame ? 0.09 : 0.04);
      if (o.cross) s += ln(P(x, (y0 + y1) / 2, z0), P(x, (y0 + y1) / 2, z1), o.frame, 0.06) + ln(P(x, y0, (z0 + z1) / 2), P(x, y1, (z0 + z1) / 2), o.frame, 0.06);
      if (o.bands) [0.25, 0.75].forEach(t => { s += ln(P(x, y0, z0 + (z1 - z0) * t), P(x, y1, z0 + (z1 - z0) * t), K.iron, 0.08); });
      if (o.vlines) for (let t = y0 + o.vlines; t < y1 - 0.05; t += o.vlines) s += ln(P(x, t, z0), P(x, t, z1), shade(fill, -0.35), 0.025);
      return s;
    });
  }
  seg(a, b, col, w) {
    this.add([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[0], b[0]) + 0.01, Math.max(a[1], b[1]) + 0.01, Math.max(a[2], b[2])], () => ln(P(...a), P(...b), shade(col, -0.4), w * 1.6) + ln(P(...a), P(...b), col, w));
  }
  banner(x, y, h, col) {
    this.cyl('z', x, y, 0, 0.07, h, K.woodD, K.woodL);
    this.cyl('z', x, y, h, 0.1, 0.12, '#d7b25a', '#f0d27a');
    this.box(x - 0.05, y - 0.03, h - 0.28, 0.95, 0.06, 0.08, K.woodD);
    const x0 = x + 0.08, x1 = x + 0.85, zt = h - 0.3, zb = h - 2.0;
    this.add([x0, y + 0.03, zb, x1, y + 0.05, zt], () => {
      const m = (x0 + x1) / 2;
      let s = poly([P(x0, y + 0.04, zt), P(x1, y + 0.04, zt), P(x1, y + 0.04, zb), P(m, y + 0.04, zb + 0.3), P(x0, y + 0.04, zb)], col, shade(col, -0.5));
      s += poly([P(x0 + 0.12, y + 0.04, zt - 0.2), P(x1 - 0.12, y + 0.04, zt - 0.2), P(x1 - 0.12, y + 0.04, zt - 0.3), P(x0 + 0.12, y + 0.04, zt - 0.3)], '#e9d38a', 'none');
      s += poly([P(m, y + 0.04, zt - 0.55), P(m + 0.2, y + 0.04, zt - 0.85), P(m, y + 0.04, zt - 1.15), P(m - 0.2, y + 0.04, zt - 0.85)], '#e9d38a', 'none');
      return s;
    });
  }
  pile(x0, y0, len, r, rows, o = {}) {
    const dz = r * 1.72;
    rows.forEach((n, j) => { for (let i = 0; i < n; i++) this.cyl('y', x0 + r + j * r + i * 2 * r * 1.0, y0, r + j * dz, r * 0.98, len, K.bark, K.logEnd, { rings: true }); });
  }
  lumber(x, y, w, d, layers, o = {}) {
    let z = o.z || 0;
    for (let i = 0; i < layers; i++) {
      this.box(x, y, z, w, d, 0.28, i % 2 ? K.woodL : K.plank, { vseam: 0.36 });
      z += 0.28;
      if (i < layers - 1) { this.box(x + 0.2, y, z, 0.14, d, 0.1, K.woodD); this.box(x + w - 0.34, y, z, 0.14, d, 0.1, K.woodD); z += 0.1; }
    }
    if (o.straps) [0.6, w - 0.75].forEach(sx => { this.box(x + sx, y - 0.02, 0, 0.07, d + 0.04, z + 0.02, K.metal, { top: '#dfe3e7' }); });
  }
  smoke(x, y, z) { this.over.push({ x, y, z }); }
  roofY(x, y, z, w, d, h, c, o = {}) {
    const sc = o.stroke || shade(c, -0.5);
    this.add([x, y, z, x + w, y + d, z + h], () => {
      const m = x + w / 2;
      let s = poly([P(x, y, z), P(x, y + d, z), P(m, y + d, z + h), P(m, y, z + h)], shade(c, -0.05), sc);
      s += poly([P(x, y + d, z), P(x + w, y + d, z), P(m, y + d, z + h)], o.gable || shade(c, -0.3), sc);
      if (o.ornament) { const cz = z + h * 0.38; s += poly([P(m, y + d + 0.01, cz + 0.3), P(m + 0.25, y + d + 0.01, cz), P(m, y + d + 0.01, cz - 0.3), P(m - 0.25, y + d + 0.01, cz)], o.ornament, shade(o.ornament, -0.4)); }
      s += poly([P(m, y, z + h), P(m, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)], shade(c, -0.2), sc);
      const lc = shade(c, -0.4);
      for (let i = 1; i < (o.rows || 0); i++) { const t = i / o.rows; s += ln(P(m + t * w / 2, y, z + h * (1 - t)), P(m + t * w / 2, y + d, z + h * (1 - t)), lc, 0.035); }
      s += ln(P(m, y - 0.05, z + h + 0.05), P(m, y + d + 0.05, z + h + 0.05), o.ridge || shade(c, -0.4), 0.16);
      return s;
    });
  }
  pyramid(x, y, z, w, d, h, c, o = {}) {
    const sc = o.stroke || shade(c, -0.5), a = P(x + w / 2, y + d / 2, z + h);
    this.add([x, y, z, x + w, y + d, z + h], () => {
      let s = poly([P(x, y + d, z), P(x + w, y + d, z), a], shade(c, 0.04), sc) + poly([P(x + w, y, z), P(x + w, y + d, z), a], shade(c, -0.2), sc);
      const lc = shade(c, -0.38);
      for (let i = 1; i < (o.rows || 0); i++) { const t = i / o.rows, q = (u, v) => [u + (a[0] - u) * t, v + (a[1] - v) * t]; const A = P(x, y + d, z), B = P(x + w, y + d, z), Cc = P(x + w, y, z); s += ln(q(...A), q(...B), lc, 0.03) + ln(q(...B), q(...Cc), lc, 0.03); }
      return s;
    });
  }
  cone(cx, cy, z, r, h, col, n = 8) { for (let k = 0; k < n; k++) this.cyl('z', cx, cy, z + h * k / n, Math.max(0.03, r * (1 - k / n)), h / n, col, shade(col, 0.12)); }
  dome(cx, cy, z, r, col, n = 9) { let zz = z; for (let k = 0; k < n; k++) { const a0 = Math.PI / 2 * k / n, a1 = Math.PI / 2 * (k + 1) / n, h = r * (Math.sin(a1) - Math.sin(a0)); this.cyl('z', cx, cy, zz, r * Math.cos(a0), h, col, shade(col, 0.12)); zz += h; } return zz; }

  render(opt = {}) {
    const it = this.items, e = 0.001;
    it.forEach(o => {
      const [x0, y0, z0, x1, y1, z1] = o.b, c = [];
      [x0, x1].forEach(a => [y0, y1].forEach(b => [z0, z1].forEach(z => c.push(P(a, b, z)))));
      o.sx0 = Math.min(...c.map(p => p[0])); o.sx1 = Math.max(...c.map(p => p[0]));
      o.sy0 = Math.min(...c.map(p => p[1])); o.sy1 = Math.max(...c.map(p => p[1]));
      o.k = (x0 + x1 + y0 + y1 + z0 + z1) / 2;
    });
    const front = (A, B) => { const a = A.b, b = B.b; if (a[2] >= b[5] - e) return true; if (b[2] >= a[5] - e) return false; if (b[5] - b[2] < 0.3 && a[5] > b[5]) return true; if (a[5] - a[2] < 0.3 && b[5] > a[5]) return false; for (const d of [2, 1, 0]) { if (a[d] >= b[d + 3] - e) return true; if (b[d] >= a[d + 3] - e) return false; } return (a[1] + a[4] + a[2] + a[5]) > (b[1] + b[4] + b[2] + b[5]); };
    const n = it.length, adj = it.map(() => []), deg = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = it[i], B = it[j];
      if (A.sx1 <= B.sx0 || B.sx1 <= A.sx0 || A.sy1 <= B.sy0 || B.sy1 <= A.sy0) continue;
      if (front(A, B)) { adj[j].push(i); deg[i]++; } else { adj[i].push(j); deg[j]++; }
    }
    const done = new Array(n).fill(false), order = [];
    for (let c = 0; c < n; c++) {
      let best = -1;
      for (let i = 0; i < n; i++) if (!done[i] && deg[i] === 0 && (best < 0 || it[i].k < it[best].k)) best = i;
      if (best < 0) for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || it[i].k < it[best].k)) best = i;
      done[best] = true; order.push(best); adj[best].forEach(j => deg[j]--);
    }
    const id = 'lm' + (opt.id || '0');
    let shadow = '';
    if (opt.shadow !== false) {
      const g = [];
      it.forEach(o => { const [x0, y0, z0, x1, y1] = o.b; if (z0 < 0.05) [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].forEach(([a, b]) => g.push(P(a + 0.15, b - 0.15, 0))); });
      shadow = `<g filter="url(#${id}b)" opacity="0.26"><polygon points="${pts(hull(g))}" fill="#1d1f20" transform="translate(0.35 0.3)"/></g>`;
    }
    let smoke = '';
    this.over.forEach(({ x, y, z }) => { const p = P(x, y, z); [[0, -0.2, 0.32, 0.75], [0.3, -0.85, 0.44, 0.6], [0.05, -1.65, 0.56, 0.45], [0.45, -2.5, 0.66, 0.3]].forEach(([dx, dy, r, a]) => { smoke += `<circle cx="${f(p[0] + dx)}" cy="${f(p[1] + dy)}" r="${r}" fill="#e3e4e6" stroke="#b9bcc0" stroke-width="0.04" opacity="${a}"/>`; }); });
    let vb = opt.viewBox || '-12.6 -13.4 25.2 25.2';
    if (opt.fit) {
      let x0 = Math.min(...it.map(o => o.sx0)), x1 = Math.max(...it.map(o => o.sx1)), y0 = Math.min(...it.map(o => o.sy0)), y1 = Math.max(...it.map(o => o.sy1));
      this.over.forEach(({ x, y, z }) => { const p = P(x, y, z); y0 = Math.min(y0, p[1] - 3.2); });
      const sz = Math.max(x1 - x0, y1 - y0) * (1 + (opt.pad ?? 0.1)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      vb = [cx - sz / 2, cy - sz / 2, sz, sz].map(f).join(' ');
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${opt.size || '100%'}" height="${opt.size || '100%'}"><defs><filter id="${id}b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.35"/></filter></defs>${shadow}${order.map(i => it[i].draw()).join('')}${smoke}</svg>`;
  }
}

function level1() {
  const s = new Scene();
  s.box(2, 1.55, 0, 5.4, 0.22, 2.7, K.plank, { vseam: 0.45 });
  [[2, 2], [7.2, 2], [2, 6], [7.2, 6]].forEach(([x, y]) => s.cyl('z', x, y, 0, 0.2, 3, K.bark, K.logEnd));
  s.roofX(1.3, 1.3, 2.95, 6.8, 5.5, 2.3, K.thatch, { rows: 5, stroke: shade(K.thatch, -0.5), ridge: '#a97a33' });
  s.lumber(3, 3.2, 3.2, 1.4, 3);
  s.box(2.6, 8.1, 0, 0.22, 1.1, 0.95, K.woodD); s.box(2.5, 8.05, 0.95, 0.45, 1.2, 0.14, K.wood);
  s.box(6, 8.1, 0, 0.22, 1.1, 0.95, K.woodD); s.box(5.9, 8.05, 0.95, 0.45, 1.2, 0.14, K.wood);
  s.cyl('x', 1.8, 8.65, 1.55, 0.46, 5.2, K.bark, K.logEnd, { rings: true });
  s.cyl('z', 8.45, 3.2, 0, 0.09, 1.9, K.woodD, K.woodL); s.cyl('z', 8.45, 5.6, 0, 0.09, 1.9, K.woodD, K.woodL);
  s.pile(8.6, 2.4, 4, 0.45, [3, 2, 1]);
  s.cyl('z', 9.6, 9.6, 0, 0.55, 0.62, K.bark, K.logEnd, { rings: true });
  s.box(9.52, 9.4, 0.62, 0.08, 0.08, 0.95, K.woodL); s.box(9.4, 9.36, 1.4, 0.3, 0.16, 0.24, K.iron, { top: K.metal });
  [[8.4, 10.4], [10.7, 9.9], [8.9, 11.1]].forEach(([x, y], i) => s.box(x, y, 0, 0.55, 0.22, 0.2, i % 2 ? K.logEnd : K.woodL));
  s.banner(0.9, 9.2, 3.2, K.flag);
  return s;
}

function level2() {
  const s = new Scene();
  s.box(0.8, 0.8, 0, 6.4, 5, 0.55, K.stone, { stone: 1 });
  s.box(1, 1, 0.55, 6, 4.6, 3, K.plank, { boards: 7 });
  s.box(6.78, 5.38, 0.55, 0.26, 0.26, 3, K.woodD);
  s.quadX(7.0, 2.4, 3.8, 0.55, 2.7, K.woodD, { bands: true, vlines: 0.35 });
  s.quadX(7.0, 4.3, 5.0, 1.8, 2.7, K.glass, { frame: K.woodL, cross: true });
  s.quadY(1.7, 2.6, 5.6, 1.8, 2.7, K.glass, { frame: K.woodL, cross: true });
  s.quadY(5.3, 6.2, 5.6, 1.8, 2.7, K.glass, { frame: K.woodL, cross: true });
  s.roofX(0.45, 0.45, 3.5, 7.1, 5.7, 2.6, K.roofBrown, { rows: 6, shingle: true, gable: K.plank });
  s.cyl('x', 7.2, 3.3, 3.95, 0.14, 0.6, K.woodD, K.woodL);
  [[1.5, 7.3], [6.4, 7.3], [1.5, 10.5], [6.4, 10.5]].forEach(([x, y]) => s.box(x, y, 0, 0.28, 0.28, 2.8, K.woodD));
  s.roofX(1.15, 6.9, 2.8, 5.9, 4.3, 1.3, K.roofBrown, { rows: 3, shingle: true, gable: K.plank });
  s.box(3.7, 8.1, 0, 0.2, 0.2, 2.8, K.woodD); s.box(3.7, 9.9, 0, 0.2, 0.2, 2.8, K.woodD);
  s.box(3.62, 8.0, 2.35, 0.36, 2.2, 0.2, K.wood);
  s.box(2.2, 8.4, 0, 0.25, 1.2, 0.62, K.woodD); s.box(5.4, 8.4, 0, 0.25, 1.2, 0.62, K.woodD);
  s.cyl('x', 1.7, 9.0, 1.12, 0.5, 4.5, K.bark, K.logEnd, { rings: true });
  s.box(3.77, 8.93, 1.55, 0.05, 0.14, 0.85, K.metal, { top: '#dfe3e7' });
  s.pile(8.3, 1.1, 4.4, 0.42, [4, 3, 2, 1]);
  s.cyl('z', 8.1, 1.6, 0, 0.09, 2.2, K.woodD, K.woodL); s.cyl('z', 8.1, 5.0, 0, 0.09, 2.2, K.woodD, K.woodL);
  s.disc('xz', 9.6, 8.4, 0.62, 0.6, K.woodD, { spokes: 6, rim: true });
  s.box(8.6, 8.4, 0.7, 2.6, 1.6, 0.25, K.wood, { topSeam: 0.4 });
  s.box(11.1, 8.7, 0.8, 1.2, 0.1, 0.1, K.woodD); s.box(11.1, 9.6, 0.8, 1.2, 0.1, 0.1, K.woodD);
  s.cyl('x', 8.5, 8.85, 1.3, 0.34, 2.8, K.bark, K.logEnd, { rings: true });
  s.cyl('x', 8.5, 9.55, 1.3, 0.34, 2.8, K.bark, K.logEnd, { rings: true });
  s.cyl('x', 8.5, 9.2, 1.88, 0.34, 2.8, K.bark, K.logEnd, { rings: true });
  s.disc('xz', 9.6, 10.02, 0.62, 0.6, K.woodD, { spokes: 6, rim: true });
  s.lumber(1.2, 11.2, 3.2, 1.0, 4);
  s.banner(0.3, 6.8, 3.6, K.flag);
  s.banner(7.4, 6.6, 3.2, K.flag);
  return s;
}

function level3() {
  const s = new Scene();
  s.box(0.4, 0.4, 0, 8.2, 6.2, 1, K.stone, { stone: 2 });
  s.box(1, 1, 1, 7, 5, 2.8, K.plaster, { timber: 5 });
  s.box(0.75, 0.75, 3.8, 7.5, 5.5, 2.1, K.plank, { boards: 5 });
  [2.0, 4.2, 6.4].forEach(x => s.quadY(x - 0.45, x + 0.45, 6.25, 4.4, 5.4, K.glass, { frame: K.woodL, cross: true }));
  s.quadX(8.25, 2.3, 3.5, 4.4, 5.4, K.glass, { frame: K.woodL, cross: true });
  s.quadX(8.0, 3.8, 5.3, 1.0, 3.2, K.woodD, { bands: true, vlines: 0.35 });
  s.box(2.0, 1.4, 6.0, 1.0, 1.0, 5.0, K.stone, { stone: 5 });
  s.box(1.9, 1.3, 11.0, 1.2, 1.2, 0.25, shade(K.stone, -0.1));
  s.roofX(0.25, 0.25, 5.9, 8.5, 6.5, 3.1, K.roofBlue, { rows: 7, shingle: true, gable: K.plank, ridge: '#2f4b69' });
  s.smoke(2.5, 1.9, 11.5);
  s.box(8.85, -0.4, 0, 1.9, 7.6, 0.75, K.stone, { stone: 1, top: K.water });
  s.cyl('z', 9.35, -0.2, 0, 0.1, 4.7, K.woodD, K.woodL); s.cyl('z', 10.25, -0.2, 0, 0.1, 4.7, K.woodD, K.woodL);
  s.box(9.25, -0.6, 4.7, 1.1, 2.1, 0.4, K.wood, { top: K.water });
  s.add([9.4, 1.5, 3.3, 10.2, 1.62, 4.75], () => poly([P(9.4, 1.5, 4.75), P(10.2, 1.5, 4.75), P(10.2, 1.75, 3.3), P(9.4, 1.75, 3.3)], '#8fd0ef', '#4a9ccb', 0.03, 'opacity="0.85"'));
  s.cyl('x', 8.6, 3.5, 2.5, 0.2, 2.0, K.iron, K.metal);
  s.wheel(9.35, 3.5, 2.5, 2.25, 0.85, K.wood);
  s.box(0.8, 7.2, 0, 8.0, 3.9, 0.5, K.wood, { topSeam: 0.5 });
  s.box(1.2, 8.7, 0.5, 1.9, 1.0, 0.6, K.woodD);
  [1.5, 2.1, 2.7].forEach(x => s.cyl('y', x, 8.7, 1.22, 0.12, 1.0, K.iron, K.metal));
  s.box(3.1, 8.6, 0.5, 3.6, 1.2, 0.8, K.woodD, { boards: 2 });
  s.cyl('y', 5.6, 6.6, 1.95, 0.12, 2.5, K.iron, K.metal);
  s.cyl('x', 1.2, 9.2, 1.78, 0.45, 4.1, K.bark, K.logEnd, { rings: true });
  s.disc('xz', 5.6, 9.2, 1.95, 0.95, K.metal, { teeth: 22, shine: true, hub: 0.2 });
  s.box(6.1, 8.9, 1.3, 1.7, 0.62, 0.14, K.woodL); s.box(6.1, 8.9, 1.44, 1.7, 0.62, 0.14, K.plank);
  s.cyl('z', 10.2, 7.9, 0, 0.14, 5.1, K.woodD, K.woodL); s.cyl('z', 10.2, 11.0, 0, 0.14, 5.1, K.woodD, K.woodL);
  s.box(9.95, 7.6, 5.1, 0.5, 3.8, 0.35, K.woodD);
  s.box(9.98, 9.1, 4.8, 0.44, 0.7, 0.3, K.iron, { top: K.metal });
  s.seg([10.2, 9.45, 4.8], [10.2, 9.45, 3.2], K.rope, 0.05);
  s.seg([10.2, 9.45, 3.2], [9.5, 9.45, 2.95], K.iron, 0.04); s.seg([10.2, 9.45, 3.2], [11.0, 9.45, 2.95], K.iron, 0.04);
  s.cyl('x', 9.2, 9.45, 2.5, 0.45, 2.2, K.bark, K.logEnd, { rings: true });
  s.lumber(0.9, 11.5, 3.4, 1.1, 4, { straps: true });
  s.lumber(5.0, 11.5, 3.0, 1.1, 3, { straps: true });
  s.banner(0.1, 6.9, 4.4, K.roofBlue);
  s.banner(8.9, 7.3, 3.4, K.roofBlue);
  return s;
}

function level4() {
  const s = new Scene();
  s.box(0.4, 0.4, 0, 8.2, 5.8, 0.6, K.stone, { stone: 1 });
  s.box(0.7, 0.7, 0.6, 7.6, 5.2, 3.4, K.brick, { stone: 6 });
  [1.8, 3.9, 6.0].forEach(x => s.quadY(x - 0.5, x + 0.5, 5.92, 1.6, 3.3, K.glass, { frame: K.plaster, cross: true }));
  s.quadX(8.32, 1.4, 2.6, 1.6, 3.3, K.glass, { frame: K.plaster, cross: true });
  s.quadX(8.32, 3.4, 5.2, 0.6, 3.0, K.woodD, { bands: true, vlines: 0.35 });
  s.roofX(0.3, 0.3, 4.0, 8.4, 6.0, 2.7, K.slate, { rows: 7, shingle: true, gable: K.brick, ridge: '#3b424b' });
  s.box(3.2, 2.95, 6.7, 2, 0.7, 0.5, K.wood, { boards: 2 });
  s.roofX(3.05, 2.8, 7.2, 2.3, 1.0, 0.4, K.slate, { ridge: '#3b424b' });
  s.box(9.0, 0.3, 0, 1.3, 1.3, 1, K.stone, { stone: 1 });
  s.box(9.1, 0.4, 1, 1.1, 1.1, 9, K.brick, { stone: 14 });
  s.box(9.0, 0.3, 10, 1.3, 1.3, 0.35, shade(K.brick, -0.25));
  s.smoke(9.65, 0.95, 10.6);
  s.box(8.85, 2.1, 0, 1.6, 2.8, 0.45, K.brick, { stone: 1 });
  s.cyl('y', 9.65, 2.0, 1.3, 0.85, 3.0, K.iron, K.metal);
  s.cyl('z', 9.65, 3.4, 2.15, 0.25, 0.45, K.metal, '#dfe3e7');
  s.seg([9.65, 2.0, 1.9], [9.65, 1.5, 2.6], K.iron, 0.12);
  s.box(9.0, 5.6, 0, 1.4, 1.4, 0.9, K.iron, { top: K.metal });
  s.box(9.8, 6.1, 0.9, 0.35, 0.4, 0.88, K.iron);
  s.cyl('x', 8.95, 6.3, 1.9, 0.12, 1.25, K.iron, K.metal);
  s.disc('yz', 8.95, 6.3, 1.9, 1.3, K.iron, { spokes: 6, rim: true, thick: 0.15 });
  s.box(0.6, 7.0, 0, 7.6, 3.4, 0.5, K.wood, { topSeam: 0.5 });
  s.box(2.2, 8.0, 0.5, 0.25, 0.25, 3.6, K.woodD); s.box(2.2, 9.6, 0.5, 0.25, 0.25, 3.6, K.woodD);
  s.box(2.1, 7.9, 4.1, 0.45, 2.05, 0.3, K.wood);
  [8.55, 8.9, 9.25].forEach(y => s.box(2.27, y, 1.0, 0.1, 0.04, 2.9, K.metal, { top: '#dfe3e7' }));
  s.box(2.22, 8.3, 3.9, 0.2, 1.3, 0.2, K.iron);
  s.cyl('x', 0.8, 8.9, 1.08, 0.55, 1.35, K.bark, K.logEnd, { rings: true });
  s.box(2.6, 8.4, 0.5, 1.8, 1.0, 0.22, K.plank); s.box(2.6, 8.4, 0.72, 1.8, 1.0, 0.22, K.woodL);
  s.box(5.0, 8.2, 0.5, 2.6, 1.2, 0.6, K.woodD, { boards: 2 });
  s.disc('xz', 6.3, 8.8, 1.85, 0.75, K.metal, { teeth: 20, shine: true });
  s.box(7.7, 8.2, 0.5, 0.4, 1.2, 0.5, K.plank);
  s.pile(8.8, 8.0, 3.5, 0.42, [3, 2, 1]);
  s.lumber(0.8, 11.0, 3.2, 1.0, 4, { straps: true });
  s.lumber(4.6, 11.0, 3.0, 1.0, 3, { straps: true });
  s.banner(0.1, 6.5, 4.4, K.flag);
  return s;
}

function level5() {
  const s = new Scene();
  s.box(0.3, 0.3, 0, 8.6, 6.4, 1.2, K.brick, { stone: 2 });
  s.box(0.3, 0.3, 1.2, 8.6, 6.4, 3.0, K.steel, { vseam: 0.45 });
  [0, 1, 2].forEach(i => s.roofX(0.15, 0.2 + i * 2.2, 4.2, 8.9, 2.2, 1.2, K.roofRed, { rows: 2, gable: K.steel, ridge: '#6b2c24' }));
  [1.0, 2.2, 6.4, 7.6].forEach(x => s.quadY(x - 0.45, x + 0.45, 6.72, 2.4, 3.8, K.glass, { frame: K.iron, cross: true }));
  s.quadY(3.2, 5.4, 6.72, 0, 2.8, K.iron, { vlines: 0.3 });
  s.quadY(3.0, 5.6, 6.72, 3.0, 3.5, K.yellow);
  [1.5, 3.1, 4.7].forEach(y => s.quadX(8.92, y - 0.5, y + 0.5, 2.3, 3.8, K.glass, { frame: K.iron, cross: true }));
  s.box(9.2, 0.3, 0, 2.4, 3.4, 2.6, K.brick, { stone: 4 });
  s.roofX(9.05, 0.15, 2.6, 2.7, 3.7, 0.9, K.roofRed, { rows: 2, gable: K.brick, ridge: '#6b2c24' });
  [10.0, 11.2].forEach(x => { s.cyl('z', x, -0.6, 0, 0.36, 9.2, K.steel, K.iron); s.smoke(x, -0.6, 9.6); });
  s.box(3.6, 6.8, 0.9, 1.4, 4.4, 0.18, K.iron, { top: '#3b4046' });
  [7.2, 9.1, 10.8].forEach(y => { s.box(3.7, y, 0, 0.15, 0.15, 0.9, K.iron); s.box(4.75, y, 0, 0.15, 0.15, 0.9, K.iron); });
  s.cyl('y', 4.3, 7.2, 1.43, 0.35, 1.6, K.bark, K.logEnd, { rings: true });
  s.cyl('y', 4.3, 9.1, 1.43, 0.35, 1.6, K.bark, K.logEnd, { rings: true });
  s.box(0.9, 7.4, 0, 1.6, 0.9, 1.0, K.yellow, { boards: 2 });
  s.box(1.0, 7.5, 1.0, 0.3, 0.6, 3.2, K.yellow);
  s.box(1.0, 7.5, 4.2, 1.4, 0.6, 0.25, K.yellow);
  s.disc('xz', 1.8, 8.4, 3.6, 0.55, K.iron, { spokes: 4, rim: true, thick: 0.08 });
  s.disc('xz', 1.8, 8.4, 1.45, 0.55, K.iron, { spokes: 4, rim: true, thick: 0.08 });
  s.box(2.3, 8.35, 1.2, 0.05, 0.04, 2.2, K.metal, { top: '#dfe3e7' });
  for (let y = 4.3; y < 12.3; y += 0.8) s.box(9.3, y, 0, 1.6, 0.3, 0.1, K.woodD);
  [9.55, 10.55].forEach(x => s.box(x, 4.2, 0.1, 0.1, 8.2, 0.12, K.metal, { top: '#e3e7ea' }));
  s.box(9.3, 6.0, 0.55, 1.6, 3.6, 0.3, K.iron, { top: '#6f767d' });
  [6.8, 8.8].forEach(y => s.disc('yz', 9.3, y, 0.45, 0.35, K.iron, { spokes: 4 }));
  [[9.3, 6.0], [10.75, 6.0], [9.3, 9.45], [10.75, 9.45]].forEach(([x, y]) => s.box(x, y, 0.85, 0.15, 0.15, 1.5, K.woodD));
  s.cyl('y', 9.72, 6.15, 1.23, 0.38, 3.3, K.bark, K.logEnd, { rings: true });
  s.cyl('y', 10.48, 6.15, 1.23, 0.38, 3.3, K.bark, K.logEnd, { rings: true });
  s.cyl('y', 10.1, 6.15, 1.88, 0.38, 3.3, K.bark, K.logEnd, { rings: true });
  s.pile(5.6, 7.0, 3.2, 0.4, [4, 3, 2, 1]);
  s.lumber(0.6, 11.4, 3.4, 1.1, 5, { straps: true });
  s.lumber(5.4, 10.8, 3.0, 1.1, 4, { straps: true });
  s.banner(0.0, 6.95, 4.6, K.flag);
  return s;
}

function level6() {
  const s = new Scene();
  s.box(0.3, 0.3, 0, 8.8, 6.2, 0.5, K.concrete);
  s.box(0.3, 0.3, 0.5, 8.8, 6.2, 3.8, K.clad, { vseam: 0.35 });
  s.roofX(0.1, 0.1, 4.3, 9.2, 6.6, 1.0, '#c9ced3', { rows: 4, gable: K.clad, ridge: '#8b949c' });
  s.quadY(0.8, 8.6, 6.52, 3.4, 3.95, K.yellow);
  s.quadY(1.6, 3.8, 6.52, 0.5, 3.0, '#c9ced3', { vlines: 0.25 });
  s.quadY(5.4, 7.6, 6.52, 0.5, 3.0, '#c9ced3', { vlines: 0.25 });
  s.quadX(9.12, 0.8, 5.9, 2.6, 3.8, K.glass, { frame: '#dfe3e7', cross: true });
  [1.2, 3.5].forEach(y => {
    s.cyl('z', 10.4, y, 0, 1.0, 6.5, K.metal, '#dfe3e7');
    s.cyl('z', 10.4, y, 6.5, 0.7, 0.35, K.metal, '#dfe3e7');
    s.cyl('z', 10.4, y, 6.85, 0.35, 0.35, K.metal, '#dfe3e7');
  });
  s.seg([9.2, 2.35, 5.0], [10.0, 2.35, 6.2], K.yellow, 0.14);
  s.cyl('z', 12.0, 0.2, 0, 0.3, 9.5, K.steel, K.iron); s.smoke(12.0, 0.2, 9.9);
  s.box(9.6, 5.0, 0, 2.6, 5.2, 2.6, K.concrete, { vseam: 1.3 });
  [5.65, 6.95, 8.25, 9.55].forEach(y => {
    s.quadX(12.22, y - 0.5, y + 0.5, 0.2, 2.2, K.steel, { vlines: 0.25 });
    s.cyl('z', 10.9, y, 2.6, 0.32, 0.22, K.iron, '#3b4046');
  });
  s.pile(0.8, 7.6, 3.2, 0.38, [5, 4, 3]);
  s.pile(5.0, 7.6, 3.2, 0.38, [4, 3]);
  [[0.2, 7.0], [8.8, 7.0], [0.2, 11.2], [8.8, 11.2]].forEach(([x, y]) => s.box(x, y, 0, 0.3, 0.3, 4.6, K.yellow));
  s.box(0.2, 7.0, 4.6, 8.9, 0.3, 0.4, K.yellow); s.box(0.2, 11.2, 4.6, 8.9, 0.3, 0.4, K.yellow);
  s.box(4.1, 7.3, 4.6, 0.5, 3.9, 0.35, K.yellow);
  s.box(4.0, 8.8, 4.2, 0.7, 0.8, 0.4, K.iron, { top: K.metal });
  s.seg([4.35, 9.2, 4.2], [4.35, 9.2, 3.05], K.iron, 0.05);
  s.box(3.9, 8.9, 2.95, 0.9, 0.6, 0.1, K.iron);
  s.cyl('x', 3.3, 9.2, 2.55, 0.36, 2.2, K.bark, K.logEnd, { rings: true });
  s.box(0.6, 11.8, 0, 2.4, 1.1, 1.1, K.wrap, { vseam: 0.8 });
  s.box(0.6, 11.8, 1.1, 2.4, 1.1, 1.1, K.wrap, { vseam: 0.8 });
  s.box(3.3, 11.8, 0, 2.4, 1.1, 1.1, K.wrap, { vseam: 0.8 });
  s.lumber(6.0, 11.8, 2.6, 1.1, 4, { straps: true });
  s.banner(-0.3, 6.6, 4.2, K.flag);
  return s;
}

window.IsoKit45 = { Scene, K, shade, P, f };
window.LumberMill45 = {
  build(level, opt = {}) { return [level1, level2, level3, level4, level5, level6][level - 1]().render(Object.assign({ id: level }, opt)); }
};
})();
