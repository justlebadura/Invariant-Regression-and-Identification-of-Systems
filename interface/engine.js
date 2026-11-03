// RIIS Engine — port del motor simbólico (SINDy + fracciones continuas) a JavaScript.
(function (global) {
  "use strict";

  const THRESHOLD = 0.08;
  const DMAX = 10;

  // LS estable mediante Householder QR (evita el desprecio de cancelación en normal equations)
  function solveQR(A, b, m, k) {    const Rp = A.map(r => Array.from(r));
    const bt = Array.from(b);
    for (let i = 0; i < Math.min(k, m - 1 || k); i++) {
      let nrm = 0;
      for (let r = i; r < m; r++) nrm += Rp[r][i] * Rp[r][i];
      nrm = Math.sqrt(nrm);
      if (nrm < 1e-13) continue;
      const sgn = Rp[i][i] >= 0 ? -1 : 1;
      const alpha = 0; // (el signo de Householder ya está embebido en el vector v)
      const v = new Float64Array(m);
      for (let r = i; r < m; r++) v[r] = Rp[r][i];
      v[i] += Rp[i][i] >= 0 ? nrm : -nrm;
      const vnorm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
      if (vnorm < 1e-13) continue;
      for (let r = i; r < m; r++) v[r] /= vnorm;
      const applyH = (vec) => {
        let d = 0;
        for (let r = 0; r < m; r++) d += v[r] * vec[r];
        for (let r = 0; r < m; r++) vec[r] -= 2 * d * v[r];
      };
      for (let j = i; j < k; j++) {
        const col = new Float64Array(m);
        for (let r = 0; r < m; r++) col[r] = Rp[r][j];
        applyH(col);
        for (let r = 0; r < m; r++) Rp[r][j] = col[r];
      }
      applyH(bt);
    }
    // retro-sustitución
    const x = new Float64Array(k);
    for (let i = k - 1; i >= 0; i--) {
      let s = bt[i];
      for (let j = i + 1; j < k; j++) s -= Rp[i][j] * x[j];
      x[i] = Math.abs(Rp[i][i]) < 1e-12 ? 0 : s / Rp[i][i];
    }
    return x;
  }

  // Construye Φ(X). Sub-bibliotecas: constante, polinomios ≤3, inversos, trigonométricas.
  function buildLibrary(X) {
    const m = X.length, nv = X[0].length;
    const col = (i) => { const c = new Float64Array(m); for (let k = 0; k < m; k++) c[k] = X[k][i]; return c; };
    const cols = [], names = [];
    cols.push(new Float64Array(m).fill(1)); names.push("1");
    for (let i = 0; i < nv; i++) { cols.push(col(i)); names.push(`x${i}`); }
    for (let i = 0; i < nv; i++) {
      for (let j = i; j < nv; j++) {
        const ci = col(i), cj = col(j);
        const ij = new Float64Array(m); for (let k = 0; k < m; k++) ij[k] = ci[k] * cj[k];
        cols.push(ij); names.push(`x${i}*x${j}`);
        for (let k = j; k < nv; k++) {
          const ck = col(k);
          const ijk = new Float64Array(m); for (let r = 0; r < m; r++) ijk[r] = ij[r] * ck[r];
          cols.push(ijk); names.push(`x${i}*x${j}*x${k}`);
        }
      }
    }
    for (let i = 0; i < nv; i++) {
      const c = col(i);
      for (const p of [1, 2, 3]) {
        const inv = new Float64Array(m);
        for (let k = 0; k < m; k++) inv[k] = 1 / (c[k] + Math.sign(c[k] || 1) * 1e-15);
        for (let p2 = 1; p2 < p; p2++) for (let k = 0; k < m; k++) inv[k] /= (c[k] + Math.sign(c[k] || 1) * 1e-15);
        cols.push(inv); names.push(p === 1 ? `1/(x${i})` : `1/(x${i}^${p})`);
      }
      for (let j = 0; j < nv; j++) {
        if (i === j) continue;
        const cj = col(j);
        for (const p of [2, 3]) {
          const t = new Float64Array(m);
          for (let k = 0; k < m; k++) {
            const dd = Math.pow(cj[k] + (cj[k] ? 0 : 1e-15), p);
            t[k] = c[k] / (dd || 1e-15);
          }
          cols.push(t); names.push(`x${i}/(x${j}^${p})`);
        }
      }
    }
    for (let i = 0; i < nv; i++) {
      const c = col(i);
      cols.push(Array.from(c, Math.sin)); names.push(`sin(x${i})`);
      cols.push(Array.from(c, Math.cos)); names.push(`cos(x${i})`);
    }
    return { cols, names };
  }

  function toFraction(x, dmax = DMAX) {
    if (!isFinite(x)) return null;
    let a0 = Math.floor(x), f0 = x - a0;
    let p = [1, a0], q = [0, 1];
    for (let i = 0; i < 40 && i < dmax * 2; i++) {
      if (Math.abs(f0) < 1e-12) break;
      f0 = 1 / f0;
      const a = Math.floor(f0);
      f0 -= a;
      const pn = a * p[1] + p[0], qn = a * q[1] + q[0];
      if (qn > dmax) break;
      p = [p[1], pn]; q = [q[1], qn];
      if (Math.abs(x - pn / qn) < 1e-9) break;
    }
      // purificación diofántica con tolerancia relativa: prefiere la fracción SIMPLEST
    // cuyo error quede dentro de rtol·|x| (los coeficientes físicos son O(1) entre corrientes)
    const rtol = 1e-3;
    const tol = Math.max(rtol * Math.abs(x), 1e-9);
    for (let d = 1; d <= dmax; d++) {
      const num = Math.round(x * d);
      if (Math.abs(x - num / d) <= tol) {
        const g = gcd(Math.abs(num), d) || 1;
        return [num / g, d / g];
      }
    }
    // fuera de tolerancia: mejor fracción con denominador ≤ dmax por error absoluto
    let best = null, bestErr = Infinity;
    for (let d = 1; d <= dmax; d++) {
      const num = Math.round(x * d);
      const err = Math.abs(x - num / d);
      if (err < bestErr) { bestErr = err; best = [num, d]; }
    }
    const g = gcd(Math.abs(best[0]), best[1]) || 1;
    return [best[0] / g, best[1] / g];
  }
  function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a || 1; }

  function complexity(name) {
    if (name === "1") return 0;
    const f = (name.match(/x\d+/g) || []).length;
    const fac = name.split("*").length;
    if (f === 2) return 3;           // cuadrático
    if (f === 3) return 5;           // cúbico
    if (name.startsWith("1/")) return 4; // inverso
    if (/^(sin|cos)\(/.test(name)) return 1;
    return 1;                        // lineal simple
  }

  function fit(X, Y, opts = {}) {
    const threshold = opts.threshold ?? THRESHOLD;
    const m = X.length;
    // normalizar el objetivo: la poda λ y las fracciones pasan a ser relativas
    let ysc = 1;
    for (let k = 0; k < m; k++) ysc = Math.max(ysc, Math.abs(Y[k]));
    const Yn = new Float64Array(m);
    for (let k = 0; k < m; k++) Yn[k] = Y[k] / ysc;
    const Ys_ = Yn; // objetivo normalizado
    const { cols, names } = buildLibrary(X);
    const n = cols.length;
    const scale = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let mx = 0;
      for (let k = 0; k < m; k++) mx = Math.max(mx, Math.abs(cols[i][k]));
      scale[i] = mx < 1e-12 ? 1 : mx;
      for (let k = 0; k < m; k++) cols[i][k] /= scale[i];
    }
    // OMP: selección ortogonal codiciosa — elige cada columna por correlación con el residual
    let active = [];
    let r = Float64Array.from(Ys_);
    let ssr0 = 0; for (let k = 0; k < m; k++) ssr0 += r[k] * r[k];
    const maxTerms = Math.min(12, n);
    for (let step = 0; step < maxTerms && active.length < n; step++) {
      const nr = Math.sqrt(ssr0);
      if (nr < 1e-12) break;
      // primer barrido: hallar la mejor correlación
      let bestC = 0;
      const cands = [];
      for (let i = 0; i < n; i++) {
        if (active.includes(i)) continue;
        let dot = 0, nrm = 0;
        for (let k = 0; k < m; k++) { const v = cols[i][k]; dot += v * r[k]; nrm += v * v; }
        const c = Math.abs(dot) / (Math.sqrt(nrm) * nr + 1e-30);
        cands.push([c, i]);
        if (c > bestC) bestC = c;
      }
      // desempate por simplicidad + correlación
      let bestJ = -1, bestRank = Infinity;
      for (const [c, i] of cands) {
        if (c < Math.max(bestC * 0.97, 0.2)) continue;
        const rank = complexity(names[i]);
        if (rank < bestRank || (rank === bestRank && c > bestC)) { bestRank = rank; bestJ = i; bestC = c; }
      }
      if (bestJ < 0) { if (opts.trace) console.log("stop corr", bestC); break; } // correlación irrelevante frente al ruido
      active.push(bestJ);
      // resolver LS sobre activas (QR estable — sin cancelación catastrófica)
      const Ka = active.length;
      const Aa = [];
      for (let k = 0; k < m; k++) { const row = new Float64Array(Ka); for (let a = 0; a < Ka; a++) row[a] = cols[active[a]][k]; Aa.push(row); }
      const sol = solveQR(Aa, Ys_, m, Ka);
      if (opts.trace) console.log("step", step, "pick", names[bestJ], "corr", bestC.toFixed(4), "ssr0", ssr0.toExponential(3));
      if (!sol) { if (opts.trace) console.log("null sol"); active.pop(); break; }
      // medir mejora: r_k - Σc·Φ
      let ssr = 0;
      for (let k = 0; k < m; k++) {
        let pred = 0;
        for (let a = 0; a < Ka; a++) pred += sol[a] * cols[active[a]][k];
        const e = Ys_[k] - pred;
        ssr += e * e;
      }
      if (opts.trace) console.log("  ssr", ssr.toExponential(3), "ratio", (ssr / (ssr0 + 1e-30)).toFixed(6));
      if (step > 0 && ssr / (ssr0 * 1 + 1e-30) > 0.9995) { // mejora despreciable (piso de ruido)
        if (opts.trace) console.log("  pop: mejora despreciable");
        active.pop(); break;
      }
      ssr0 = ssr;
      // actualizar residual ortogonalizado
      for (let k = 0; k < m; k++) {
        let pred = 0;
        for (let a = 0; a < Ka; a++) pred += sol[a] * cols[active[a]][k];
        r[k] = Ys_[k] - pred;
      }
    }
    // RESCATE de la constante: si '1' quedó fuera y el residual aún la correlaciona fuerte,
    // agregarla y re-optimizar (el sesgo biculture es común y la OMP con residuales parciales la pasa por alto)
    const iConst = names.indexOf("1");
    if (!active.includes(iConst)) {
      let dot = 0, nrm = 0, nr2 = 0;
      for (let k = 0; k < m; k++) { dot += r[k]; nr2 += r[k] * r[k]; }
      nrm = m;
      const cRes = Math.abs(dot) / (Math.sqrt(nrm) * Math.sqrt(nr2) + 1e-30);
      if (cRes > 0.5) {
        const Ka = active.length + 1;
        const Aa = [];
        for (let k = 0; k < m; k++) { const row = new Float64Array(Ka); row[0] = 1; for (let a = 1; a < Ka; a++) row[a] = cols[active[a-1]][k]; Aa.push(row); }
        const sol = solveQR(Aa, Ys_, m, Ka);
        let ssrC = 0;
        for (let k = 0; k < m; k++) { let pred = 0; for (let a = 0; a < Ka; a++) pred += sol[a]*Aa[k][a]; const e = Ys_[k] - pred; ssrC += e*e; }
        if (ssrC < ssr0 * 0.9) active = [iConst, ...active];
      }
    }
    // poda final estricta λ y refit dos pases
    let w = new Float64Array(n);
    if (!active.length) active = [0];
    let keep = active;
    for (let pass = 0; pass < 3; pass++) {
      w = new Float64Array(n);
      const Ka = keep.length, Aa = [];
      for (let k = 0; k < m; k++) { const row = new Float64Array(Ka); for (let a = 0; a < Ka; a++) row[a] = cols[keep[a]][k]; Aa.push(row); }
      const sol = solveQR(Aa, Ys_, m, Ka);
      keep.forEach((idx, j) => w[idx] = sol[j]);
      const idxConst = names.indexOf("1");
      const maxW = Math.max(...keep.map(j => Math.abs(w[j])));
      const nk = keep.filter(i => i === idxConst || Math.abs(w[i]) >= threshold || Math.abs(w[i]) >= 0.1 * maxW);
      if (nk.length === keep.length || nk.length === 0) break;
      keep = nk;
    }
    for (let i = 0; i < n; i++) { w[i] /= scale[i]; w[i] *= ysc; }
    let mse = 0, linf = 0;
    for (let k = 0; k < m; k++) {
      let pred = 0;
      for (let i = 0; i < n; i++) if (w[i] !== 0) pred += w[i] * cols[i][k] * scale[i];
      const e = pred - Y[k];
      mse += e * e / m;
      linf = Math.max(linf, Math.abs(e));
    }
    return { weights: w, names, mse, linf };
  }

  function evaluateLaw(result, x) {
    let acc = 0;
    result.names.forEach((name, i) => {
      if (!result.weights[i]) return;
      acc += result.weights[i] * evalFeature(name, x);
    });
    return acc;
  }
  function evalFeature(name, x) {
    const s = name.replace(/x(\d+)/g, (_, i) => `(${x[+i]})`).replace(/\^(\d+)/g, "**$1");
    return Function(`"use strict"; return (${s})`)();
  }

  function prettyName(name, labels) { return name.replace(/x(\d+)/g, (_, i) => (labels && labels[+i]) || `x${i}`); }

  function labelParticipant(xv, labels) {
    const i = +xv.slice(1);
    return (labels && labels[i]) || xv;
  }

  function texTerm(q, name, labels) {
    const coeff = (q[0] === 1 && q[1] === 1) ? "" : (q[1] === 1 ? String(Math.abs(q[0])) : `\\frac{${Math.abs(q[0])}}{${q[1]}}`);
    const feat = name === "1"
      ? "1"
      : name
      .replace(/^1\/\(x(\d+)\^(\d+)\)$/, (_, v, p) => { const l = labelParticipant(`x${v}`, labels); return `\\frac{1}{${l}^{${p}}}`; })
      .replace(/^1\/\(x(\d+)\)$/, (_, v) => { const l = labelParticipant(`x${v}`, labels); return `\\frac{1}{${l}}`; })
      .replace(/^x(\d+)\/\(x(\d+)\^(\d+)\)$/, (_, a, b, p) => `${labelParticipant(`x${a}`, labels)}\\cdot\\frac{1}{${labelParticipant(`x${b}`, labels)}^{${p}}}`)
      .replace(/sin\(([^()]*)\)/g, "\\sin\\!\\left($1\\right)")
      .replace(/cos\(([^()]*)\)/g, "\\cos\\!\\left($1\\right)")
      .replace(/\*/g, " \\cdot ").replace(/x(\d+)/g, (_, v) => labelParticipant(`x${v}`, labels));
    return (coeff ? coeff + " " : "") + feat;
  }

  function distill(result, labels) {
    const terms = [], texList = [];
    result.names.forEach((name, i) => {
      const w = result.weights[i];
      if (Math.abs(w) < 1e-9) return;
      const fr = toFraction(w);
      if (!fr || fr[0] === 0) return;
      const rawName = name === "1" ? "1" : name;
      terms.push({ coeff: fr[0] / fr[1], feature: rawName === "1" ? "1" : prettyName(name, labels), isConst: name === "1", numerator: fr[0], denominator: fr[1] });
      texList.push((terms.length === 1 ? (fr[0] < 0 ? "-" : "") : (fr[0] < 0 ? " - " : " + ")) + texTerm(fr, rawName, labels));
    });
    const tex = texList.join("");
    const expr = terms.map(t => (t.coeff >= 0 ? "+ " : "- ") + Math.abs(t.coeff) + (t.isConst ? " * 1" : " *" + t.feature.replace(/\s/g, ""))).join(" ");
    return { terms, expr, tex, mse: result.mse, linf: result.linf };
  }

  global.RIIS = global.RIIS || {};
  global.RIIS.Engine = { fit, distill, toFraction, evaluateLaw, evalFeature };
})(typeof window !== "undefined" ? window : globalThis);
