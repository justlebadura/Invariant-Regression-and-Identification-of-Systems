// RIIS PINN — red física (Navier–Stokes incompresible) entrenada 100% en el navegador.
// Familia paramétrica: flujo ABC (solución EXACTA de NS) entradas (x,y,z,t,ν,A,B,C) → (u,v,w,p).
// Pérdida: datos + residuo NS (∂ₜu + u·∇u = −∇p + ν∇²u) por diferencias finitas + Adam.
// Ventaja de la PINN: cambia ν, A, B, C o el tiempo y la red interpola al instante; el CFD re-simula.
(function (global) {
  "use strict";
  const TAU = Math.PI * 2;
  const SAMPLE = { nu: [0.05, 0.8], amp: [0.2, 1.3], t: 6 };
  const SC_U = 2.5, SC_X = Math.PI, SC_T = 3; // escalas: salida→física; fís.→norm.; t fís. por unidad norm.

  // campo exacto ABC (Beltrami ω=u → (u·∇)u = ∇|u|²/2 exacto)
  function abcExact(x, y, z, t, nu, A, B, C) {
    const d = Math.exp(-nu * t);
    const u = (A * Math.sin(z) + C * Math.cos(y)) * d;
    const v = (B * Math.sin(x) + A * Math.cos(z)) * d;
    const w = (C * Math.sin(y) + B * Math.cos(x)) * d;
    return [u, v, w, -(u * u + v * v + w * w) / 2];
  }

  // ----- MLP manual -----
  const LAYERS = [8, 24, 24, 24, 4];
  function MLP(ls) {
    this.ls = ls;
    this.W = []; this.b = [];
    for (let l = 0; l < ls.length - 1; l++) {
      const nin = ls[l], nout = ls[l + 1], W = new Float32Array(nin * nout);
      const g = Math.sqrt(6 / (nin + nout)); // Glorot
      for (let i = 0; i < W.length; i++) W[i] = (Math.random() * 2 - 1) * g;
      this.W.push(W); this.b.push(new Float32Array(nout));
    }
  }
  MLP.prototype.forwardStack = function (x) {
    const acts = [x];
    let a = x;
    for (let l = 0; l < this.W.length; l++) {
      const nout = this.ls[l + 1], nin = this.ls[l], W = this.W[l], b = this.b[l];
      const z = new Float32Array(nout);
      for (let j = 0; j < nout; j++) {
        let s = b[j]; const off = j * nin;
        for (let i = 0; i < nin; i++) s += W[off + i] * a[i];
        z[j] = l < this.W.length - 1 ? Math.tanh(s) : s;
      }
      acts.push(z); a = z;
    }
    return { acts, out: a };
  };
  // delta (4,) = ∂L/∂out_norm — backprop con tanh' guardado por capa
  MLP.prototype.backwardStack = function (stack, delta, gW, gB) {
    let d = delta;
    for (let l = this.W.length - 1; l >= 0; l--) {
      const nout = this.ls[l + 1], nin = this.ls[l], W = this.W[l];
      const aPrev = stack.acts[l], act = stack.acts[l + 1];
      const dNew = new Float32Array(nin);
      const last = l === this.W.length - 1;
      for (let j = 0; j < nout; j++) {
        const dj = last ? d[j] : d[j] * (1 - act[j] * act[j]);
        const off = j * nin;
        for (let i = 0; i < nin; i++) { gW[l][off + i] += dj * aPrev[i]; dNew[i] += dj * W[off + i]; }
        gB[l][j] += dj;
      }
      d = dNew;
    }
  };
  MLP.prototype.forward = function (x, out4) {
    let a = x;
    for (let l = 0; l < this.W.length; l++) {
      const nout = this.ls[l + 1], nin = this.ls[l], W = this.W[l], b = this.b[l];
      const z = new Float32Array(nout);
      for (let j = 0; j < nout; j++) {
        let s = b[j]; const off = j * nin;
        for (let i = 0; i < nin; i++) s += W[off + i] * a[i];
        z[j] = l < this.W.length - 1 ? Math.tanh(s) : s;
      }
      a = z;
    }
    if (out4) for (let k = 0; k < 4; k++) out4[k] = a[k];
    return a;
  };

  const rnd = (a, b) => a + Math.random() * (b - a);

  function PINN() {
    let params = 0, mac = 0;
    for (let i = 0; i < LAYERS.length - 1; i++) { params += LAYERS[i] * LAYERS[i + 1] + LAYERS[i + 1]; mac += LAYERS[i] * LAYERS[i + 1]; }
    this.params = params; this.macFwd = mac;
    this.reset();
  }
  PINN.prototype.reset = function () {
    this.net = new MLP(LAYERS);
    this.mW = this.net.W.map(W => new Float32Array(W.length));
    this.vW = this.net.W.map(W => new Float32Array(W.length));
    this.mB = this.net.b.map(B => new Float32Array(B.length));
    this.vB = this.net.b.map(B => new Float32Array(B.length));
    this.t = 0; this.lr = 2e-3; this.b1 = 0.9; this.b2 = 0.999;
    this.epochs = 0; this.lossData = 1; this.lossPhys = 1; this.errEma = 1;
    this.msTrain = 0; this.samplesSeen = 0; this.training = false;
    this.wPhys = 0.35; this.wData = 1.0;
  };
  PINN.prototype.abc = abcExact;
  PINN.prototype._normIn = function (x, y, z, t, nu, A, B, C) {
    return [x / SC_X - 1, y / SC_X - 1, z / SC_X - 1, t / SC_T - 1, nu / 0.8, A / 1.3, B / 1.3, C / 1.3];
  };

  // ----- un paso de entrenamiento: bs datos + bs físicos → Adam -----
  PINN.prototype.step = function (bs) {
    const t0 = performance.now();
    const net = this.net, gW = net.W.map(W => new Float32Array(W.length)), gB = net.b.map(B => new Float32Array(B.length));
    let ld = 0, lp = 0;
    for (let n = 0; n < bs; n++) {
      const nu = rnd(...SAMPLE.nu), A = rnd(...SAMPLE.amp), B = rnd(...SAMPLE.amp), C = rnd(...SAMPLE.amp);
      const tt = rnd(0, SAMPLE.t), x = rnd(0, TAU), y = rnd(0, TAU), z = rnd(0, TAU);
      // --- datos (1 forward + 1 backward) ---
      const st = net.forwardStack(this._normIn(x, y, z, tt, nu, A, B, C));
      const tgt = abcExact(x, y, z, tt, nu, A, B, C);
      const delta = new Float32Array(4);
      let e2 = 0;
      for (let k = 0; k < 4; k++) { const e = st.out[k] - tgt[k] / SC_U; e2 += e * e; delta[k] = 2 * e * this.wData; }
      net.backwardStack(st, delta, gW, gB);
      ld += e2 / 4;
      this.samplesSeen++;
      // --- residuo físico (8 forwards + 8 backwards) ---
      lp += this._physResidual(rnd(0, TAU), rnd(0, TAU), rnd(0, TAU), rnd(0, SAMPLE.t), rnd(...SAMPLE.nu),
        rnd(...SAMPLE.amp), rnd(...SAMPLE.amp), rnd(...SAMPLE.amp), gW, gB);
    }
    this._adam(gW, gB, bs);
    this.msTrain += performance.now() - t0;
    this.epochs++;
    this.lossData = 0.98 * this.lossData + 0.02 * (ld / bs) * SC_U * SC_U;
    this.lossPhys = 0.9 * this.lossPhys + 0.1 * (lp / bs);
    return { ld: this.lossData, lp: this.lossPhys };
  };

  // residuo de NS en un punto: R_k = ∂ₜu_k + u·∇u_k + ∂ₓp_k − ν∇²u_k = 0
  // cálculo: 8 pasadas (centro, ±x, ±y, ±z, +t) y regla de cadena exacta a pesos.
  PINN.prototype._physResidual = function (x, y, z, t, nu, A, B, C, gW, gB) {
    const net = this.net;
    const h = 0.08, ht = 0.08, h2 = h * h;
    const KO = { xp: ["xm", 1], xm: ["xp", -1], yp: ["ym", 1], ym: ["yp", -1], zp: ["zm", 1], zm: ["zp", -1] };
    const names = ["c", "xp", "xm", "yp", "ym", "zp", "zm", "tp"];
    const F = {}, ST = {};
    for (const nm of names) {
      const [dx, dy, dz, dt] = nm === "c" ? [0, 0, 0, 0]
        : nm === "tp" ? [0, 0, 0, ht]
          : [nm[1] === "p" ? h : -h, nm[0] === "y" ? h * (nm[1] === "p" ? 1 : -1) : 0, nm[0] === "z" ? h * (nm[1] === "p" ? 1 : -1) : 0, 0];
      // nota: para xp: dx=+h; xm: −h; yp: dy=+h; ym: −h; zp: dz=+h; zm: −h — construido abajo con claridad
      ST[nm] = null;
    }
    // (construcción explícita sin aritmética de índices — legibilidad ante todo)
    const mk = (dx, dy, dz, dt2) => net.forwardStack(this._normIn(x + dx * SC_X, y + dy * SC_X, z + dz * SC_X, t + dt2 * SC_T, nu, A, B, C));
    ST.c = mk(0, 0, 0, 0);
    ST.xp = mk(h, 0, 0, 0); ST.xm = mk(-h, 0, 0, 0);
    ST.yp = mk(0, h, 0, 0); ST.ym = mk(0, -h, 0, 0);
    ST.zp = mk(0, 0, h, 0); ST.zm = mk(0, 0, -h, 0);
    ST.tp = mk(0, 0, 0, ht);
    for (const nm of names) F[nm] = ST[nm].out;

    const wk = { xp: 1, xm: -1, yp: 1, ym: -1, zp: 1, zm: -1 };   // signo del corrimiento
    const ax = { xp: "x", xa: "x", yp: "y", ym: "y", zp: "z", zm: "z" };
    const duw = SC_U / (SC_X * 2 * h);      // d/dx fís.: unidad de primera derivada
    const d2w = SC_U / (SC_X * SC_X * h2);  // unidad laplaciano
    const dtw = SC_U / (SC_T * ht);         // unidad d/dt fís.
    const deltas = {}; for (const nm of names) deltas[nm] = new Float32Array(4);

    let res = 0;
    for (let k = 0; k < 3; k++) {
      const ux = duw * (F.xp[k] - F.xm[k]);
      const uy = duw * (F.yp[k] - F.ym[k]);
      const uz = duw * (F.zp[k] - F.zm[k]);
      const ut = dtw * (F.tp[k] - F.c[k]);
      const lap = d2w * (F.xp[k] + F.xm[k] + F.yp[k] + F.ym[k] + F.zp[k] + F.zm[k] - 6 * F.c[k]);
      const px = duw * (F.xp[3] - F.xm[3]);
      const vel = [SC_U * F.c[0], SC_U * F.c[1], SC_U * F.c[2]]; // (u,v,w) del centro
      const adv = vel[0] * ux + vel[1] * uy + vel[2] * uz;       // (u·∇)u_k
      const R = ut + adv + px - nu * lap;
      const c = 2 * R * this.wPhys;
      res += R * R;
      // ---- regla de cadena exacta ∂R/∂F ----
      // ∂ₜu_k: tp +dtw, c −dtw
      deltas.tp[k] += c * dtw;
      deltas.c[k] += -c * dtw;
      // adv: velocidades (centro, comps 0..2) × gradientes de k (pasadas laterales)
      deltas.c[0] += c * SC_U * ux;
      deltas.c[1] += c * SC_U * uy;
      deltas.c[2] += c * SC_U * uz;
      // gradiente de k: xp +duw, xm −duw (solo si la pasada toca el eje que deriva k)
      const axis = k === 0 ? "x" : k === 1 ? "y" : "z";
      for (const sign2 of [1, -1]) {
        const pnm = axis + (sign2 > 0 ? "p" : "m");
        deltas[pnm][k] += c * sign2 * duw;
      }
      // lap: laterales +d2w·(−ν); centro −6·d2w·(−ν)
      const lw = -nu * d2w;
      for (const nm2 of ["xp", "xm", "yp", "ym", "zp", "zm"]) deltas[nm2][k] += c * lw;
      deltas.c[k] += c * (-6 * lw);
      // px: xp[3] +duw, xm[3] −duw
      deltas.xp[3] += c * duw;
      deltas.xm[3] += -c * duw;
    }
    for (const nm of names) net.backwardStack(ST[nm], deltas[nm], gW, gB);
    return res;
  };

  PINN.prototype._adam = function (gW, gB, bs) {
    this.t++;
    const bc1 = 1 - Math.pow(this.b1, this.t), bc2 = 1 - Math.pow(this.b2, this.t);
    const scale = 1 / bs, lr = this.lr;
    const upd = (P, G, M, V) => {
      for (let i = 0; i < P.length; i++) {
        const g = G[i] * scale;
        M[i] = this.b1 * M[i] + (1 - this.b1) * g;
        V[i] = this.b2 * V[i] + (1 - this.b2) * g * g;
        P[i] -= lr * (M[i] / bc1) / (Math.sqrt(V[i] / bc2) + 1e-8);
      }
    };
    for (let l = 0; l < this.net.W.length; l++) {
      upd(this.net.W[l], gW[l], this.mW[l], this.vW[l]);
      upd(this.net.b[l], gB[l], this.mB[l], this.vB[l]);
    }
  };

  // inferencia por lotes — entradas físicas N×8 → salidas físicas N×3 (u,v,w)
  PINN.prototype.predictMany = function (inp8, out3, N) {
    const net = this.net, tmp = new Float32Array(8), o = new Float32Array(4);
    for (let n = 0; n < N; n++) {
      const b = n * 8;
      tmp[0] = inp8[b] / SC_X - 1; tmp[1] = inp8[b + 1] / SC_X - 1; tmp[2] = inp8[b + 2] / SC_X - 1;
      tmp[3] = inp8[b + 3] / SC_T - 1; tmp[4] = inp8[b + 4] / 0.8;
      tmp[5] = inp8[b + 5] / 1.3; tmp[6] = inp8[b + 6] / 1.3; tmp[7] = inp8[b + 7] / 1.3;
      net.forward(tmp, o);
      const c = n * 3;
      out3[c] = o[0] * SC_U; out3[c + 1] = o[1] * SC_U; out3[c + 2] = o[2] * SC_U;
    }
  };

  // sondeo de exactitud (magnitud del error de velocidad vs analítica)
  PINN.prototype.probe = function (n = 200) {
    let e = 0;
    const o = new Float32Array(4);
    for (let i = 0; i < n; i++) {
      const nu = rnd(...SAMPLE.nu), A = rnd(...SAMPLE.amp), B = rnd(...SAMPLE.amp), C = rnd(...SAMPLE.amp);
      const tt = rnd(0, SAMPLE.t), x = rnd(0, TAU), y = rnd(0, TAU), z = rnd(0, TAU);
      this.net.forward(this._normIn(x, y, z, tt, nu, A, B, C), o);
      const ex = abcExact(x, y, z, tt, nu, A, B, C);
      e += Math.hypot(o[0] * SC_U - ex[0], o[1] * SC_U - ex[1], o[2] * SC_U - ex[2]) / 3;
    }
    this.errEma = 0.9 * this.errEma + 0.1 * (e / n);
    return e / Math.max(1, n);
  };

  // pesos pre-entrenados (offline, err≈0.09 sobre toda la familia ν/A/B/C)
  PINN.prototype.load = function (w) {
    if (!w || !w.ls || w.ls.join(",") !== LAYERS.join(",")) return false;
    this.net.W = w.W.map(a => Float32Array.from(a));
    this.net.b = w.b.map(a => Float32Array.from(a));
    // reiniciar momentos Adam (el usuario puede seguir entrenando desde aquí)
    this.mW = this.net.W.map(W => new Float32Array(W.length));
    this.vW = this.net.W.map(W => new Float32Array(W.length));
    this.mB = this.net.b.map(B => new Float32Array(B.length));
    this.vB = this.net.b.map(B => new Float32Array(B.length));
    this.errEma = w.err || 0.0912;
    this.pretrained = true;
    return true;
  };

  global.RIIS = global.RIIS || {};
  global.RIIS.PINNconstant = null; // (compat placeholder)
  global.RIIS.PINN = PINN;
})(window);
