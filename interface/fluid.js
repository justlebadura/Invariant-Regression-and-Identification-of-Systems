// RIIS Fluid — demo 3D de dinámica de fluidos: solución exacta vs PINN (en vivo) vs CFD (12³).
// Ventaja PINN: cambia ν/A/B/C y la red responde al instante; el CFD debe re-integrar desde t=0.
// El panel cuenta los milisegundos reales de entrenamiento/inferencia/re-simulación.
(function (global) {
  "use strict";
  const TAU = Math.PI * 2;
  const PINN = global.RIIS.PINN;
  const N = 2400;

  // ================= CFD: NS incompresible en malla 12³ =================
  // advección semi-Lagrangiana + viscosidad explícita + proyección de presión (Jacobi 30)
  function CFD(nu) {
    this.n = 12;
    this.reset(nu);
  }
  CFD.prototype.reset = function (nu) {
    this.nu = nu; this.t = 0; this.steps = 0;
    this.msTotal = 0; this.msPerStep = 0;
    const n = this.n, V = n * n * n;
    this.u = new Float32Array(V); this.v = new Float32Array(V); this.w = new Float32Array(V);
    this.p = new Float32Array(V); this.divT = new Float32Array(V);
    const f = TAU / n;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * f, y = j * f, z = k * f, s = k * n * n + j * n + i;
      const u0 = Math.sin(z) + Math.cos(y), v0 = Math.sin(x) + Math.cos(z), w0 = Math.sin(y) + Math.cos(x);
      this.u[s] = u0; this.v[s] = v0; this.w[s] = w0;
      this.p[s] = -(u0 * u0 + v0 * v0 + w0 * w0) / 2; // presión ABC exacta
    }
  };
  CFD.prototype._trilin = function (fld, x, y, z) {
    const n = this.n;
    let gx = x * n / TAU, gy = y * n / TAU, gz = z * n / TAU;
    const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
    const fx = gx - i0, fy = gy - j0, fz = gz - k0;
    const wr = (a) => ((a % n) + n) % n;
    const at = (i, j, k) => fld[wr(k) * n * n + wr(j) * n + wr(i)];
    const lerp = (a, b, s) => a + (b - a) * s;
    const c00 = lerp(at(i0, j0, k0), at(i0 + 1, j0, k0), fx);
    const c10 = lerp(at(i0, j0 + 1, k0), at(i0 + 1, j0 + 1, k0), fx);
    const c01 = lerp(at(i0, j0, k0 + 1), at(i0 + 1, j0, k0 + 1), fx);
    const c11 = lerp(at(i0, j0 + 1, k0 + 1), at(i0 + 1, j0 + 1, k0 + 1), fx);
    return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz);
  };
  CFD.prototype.sample = function (x, y, z, out) {
    out[0] = this._trilin(this.u, x, y, z);
    out[1] = this._trilin(this.v, x, y, z);
    out[2] = this._trilin(this.w, x, y, z);
    return out;
  };
  CFD.prototype.step = function (dt) {
    const t0 = performance.now();
    const n = this.n, f = TAU / n, nu = this.nu, aI = dt * nu / (f * f);
    const V = n * n * n;
    const bu = this.u, bv = this.v, bw = this.w;
    const nu2 = new Float32Array(V), nv2 = new Float32Array(V), nw2 = new Float32Array(V);
    // 1) advección: retro-traza u* = u(x − u·dt)
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * f, y = j * f, z = k * f, s = k * n * n + j * n + i;
      const bx = x - bu[s] * dt, by = y - bv[s] * dt, bz = z - bw[s] * dt;
      nu2[s] = this._trilin(bu, bx, by, bz);
      nv2[s] = this._trilin(bv, bx, by, bz);
      nw2[s] = this._trilin(bw, bx, by, bz);
    }
    // 2) viscosidad explícita u += ν·dt·∇²u
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const s = k * n * n + j * n + i;
      const xp = k * n * n + j * n + ((i + 1) % n), xm = k * n * n + j * n + ((i - 1 + n) % n);
      const yp = k * n * n + ((j + 1) % n) * n + i, ym = k * n * n + ((j - 1 + n) % n) * n + i;
      const zp = ((k + 1) % n) * n * n + j * n + i, zm = ((k - 1 + n) % n) * n * n + j * n + i;
      nu2[s] += aI * (nu2[xp] + nu2[xm] + nu2[yp] + nu2[ym] + nu2[zp] + nu2[zm] - 6 * nu2[s]);
      nv2[s] += aI * (nv2[xp] + nv2[xm] + nv2[yp] + nv2[ym] + nv2[zp] + nv2[zm] - 6 * nv2[s]);
      nw2[s] += aI * (nw2[xp] + nw2[xm] + nw2[yp] + nw2[ym] + nw2[zp] + nw2[zm] - 6 * nw2[s]);
    }
    // 3) proyección: ∇²p = (∇·u)/dt, u ← u − ∇p  (Jacobi 30 iteraciones)
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const s = k * n * n + j * n + i;
      this.divT[s] = (nu2[k * n * n + j * n + ((i + 1) % n)] - nu2[k * n * n + j * n + ((i - 1 + n) % n)]
        + nv2[k * n * n + ((j + 1) % n) * n + i] - nv2[k * n * n + ((j - 1 + n) % n) * n + i]
        + nw2[((k + 1) % n) * n * n + j * n + i] - nw2[((k - 1 + n) % n) * n * n + j * n + i]) / (2 * f * dt);
    }
    this.p.fill(0);
    for (let it = 0; it < 30; it++) {
      const pp = this.p.slice();
      for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const s = k * n * n + j * n + i;
        this.p[s] = (pp[k * n * n + j * n + ((i + 1) % n)] + pp[k * n * n + j * n + ((i - 1 + n) % n)]
          + pp[k * n * n + ((j + 1) % n) * n + i] + pp[k * n * n + ((j - 1 + n) % n) * n + i]
          + pp[((k + 1) % n) * n * n + j * n + i] + pp[((k - 1 + n) % n) * n * n + j * n + i]
          - this.divT[s] * f * f) / 6;
      }
    }
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const s = k * n * n + j * n + i;
      // u = u* − dt·∇φ  con  ∇²φ = (∇·u*)/dt
      this.u[s] = nu2[s] - dt * (this.p[k * n * n + j * n + ((i + 1) % n)] - this.p[k * n * n + j * n + ((i - 1 + n) % n)]) / (2 * f);
      this.v[s] = nv2[s] - dt * (this.p[k * n * n + ((j + 1) % n) * n + i] - this.p[k * n * n + ((j - 1 + n) % n) * n + i]) / (2 * f);
      this.w[s] = nw2[s] - dt * (this.p[((k + 1) % n) * n * n + j * n + i] - this.p[((k - 1 + n) % n) * n * n + j * n + i]) / (2 * f);
    }
    this.t += dt; this.steps++;
    const ms = performance.now() - t0;
    this.msTotal += ms; this.msPerStep = ms;
    return ms;
  };

  // ================= estado =================
  let pinn = null, cfd = null;
  let phase = "exact";       // "exact" | "pinn" | "cfd"
  let paused = false, trainOn = true, yawAuto = true;
  const P = { nu: 0.3, A: 1, B: 1, C: 1, clock: 1, t: 0 };
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const spd = new Float32Array(N);
  const inp = new Float32Array(N * 8), out = new Float32Array(N * 3);
  const cam = { yaw: 0.9, pitch: 0.55, dist: 7.2 };
  let inferMs = 0, inferEma = 0;

  function reseed() {
    for (let i = 0; i < N; i++) {
      pos[i * 3] = Math.random() * TAU;
      pos[i * 3 + 1] = Math.random() * TAU;
      pos[i * 3 + 2] = Math.random() * TAU;
    }
    vel.fill(0); spd.fill(0);
  }
  function resetCFD() { cfd.reset(P.nu); P.t = 0; }
  function setSource(name) {
    phase = name;
    if (name === "cfd") resetCFD();
  }

  // ================= WebGL =================
  let cv, gl, prog, lineProg, posBuf, spdBuf, boxBuf, okGL = false;
  let W = 640, H = 480;

  const VS = `attribute vec3 aPos; attribute float aSpd;
uniform mat4 uMVP; uniform float uSize;
varying float vSpd; varying float vW;
void main(){ gl_Position = uMVP*vec4(aPos,1.0);
  gl_PointSize = clamp(uSize/gl_Position.w, 1.2, 9.0);
  vSpd = aSpd; vW = gl_Position.w; }`;
  const FS = `precision mediump float; varying float vSpd; varying float vW;
void main(){ vec2 d = gl_PointCoord-0.5; if(dot(d,d)>0.25) discard;
  float s = clamp(vSpd/3.0, 0.0, 1.0);
  vec3 c = mix(vec3(0.2,0.6,1.0), vec3(1.0,0.9,0.4), s);
  c = mix(c, vec3(1.0,0.4,0.3), s*s*0.7);
  gl_FragColor = vec4(c, 0.55/(1.0+0.05*max(vW,0.0))); }`;
  const VSL = `attribute vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position = uMVP*vec4(aPos,1.0); }`;
  const FSL = `precision mediump float; void main(){ gl_FragColor = vec4(0.40,0.55,0.95,0.35); }`;

  function mkShader(type, src) {
    const h = gl.createShader(type);
    gl.shaderSource(h, src); gl.compileShader(h);
    if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h));
    return h;
  }
  function mkProgram(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, mkShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mkShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function initGL() {
    try {
      gl = cv.getContext("webgl", { alpha: true, antialias: true });
      if (!gl) throw new Error("sin WebGL");
      prog = mkProgram(VS, FS);
      lineProg = mkProgram(VSL, FSL);
      posBuf = gl.createBuffer(); spdBuf = gl.createBuffer(); boxBuf = gl.createBuffer();
      const E = []; const a = 0, b = TAU;
      const corners = [a, b];
      // 12 aristas del cubo [0,τ]³
      for (const dx of corners) for (const dy of corners) {
        E.push(dx, dy, a, dx, dy, b);
      }
      for (const dy of corners) for (const dz of corners) {
        E.push(a, dy, dz, b, dy, dz);
      }
      for (const dx of corners) for (const dz of corners) {
        E.push(dx, a, dz, dx, b, dz);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(E), gl.STATIC_DRAW);
      gl.enable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      return true;
    } catch (err) { console.warn("WebGL fallo:", err.message); return false; }
  }

  // matrices
  function perspective(fovy, asp, near, far) {
    const m = new Float32Array(16), fn = 1 / Math.tan(fovy / 2);
    m[0] = fn / asp; m[5] = fn;
    m[10] = (far + near) / (near - far); m[11] = -1;
    m[14] = 2 * far * near / (near - far);
    return m;
  }
  function lookAt(eye, center) {
    const m = new Float32Array(16);
    // z = normalize(eye − center)
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    // x = normalize(cross(up, z)), up = (0,1,0)
    let xx = zz, xy = 0, xz = -zx;
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    // y = cross(z, x)
    let yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const yl = Math.hypot(yx, yy, yz) || 1; yx /= yl; yy /= yl; yz /= yl;
    m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
    m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
    m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }

  function draw() {
    if (!okGL) return;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const eye = [
      TAU / 2 + cam.dist * Math.cos(cam.pitch) * Math.sin(cam.yaw),
      TAU / 2 + cam.dist * Math.sin(cam.pitch),
      TAU / 2 + cam.dist * Math.cos(cam.pitch) * Math.cos(cam.yaw)];
    const mvp = mul(perspective(0.9, W / H, 0.1, 100), lookAt(eye, [TAU / 2, TAU / 2, TAU / 2]));
    // caja wireframe
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(lineProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    const aL = gl.getAttribLocation(lineProg, "aPos");
    gl.enableVertexAttribArray(aL);
    gl.vertexAttribPointer(aL, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, "uMVP"), false, mvp);
    gl.drawArrays(gl.LINES, 0, 24);
    // partículas (aditivas)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    const aP = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, spdBuf);
    gl.bufferData(gl.ARRAY_BUFFER, spd, gl.DYNAMIC_DRAW);
    const aS = gl.getAttribLocation(prog, "aSpd");
    gl.enableVertexAttribArray(aS);
    gl.vertexAttribPointer(aS, 1, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uMVP"), false, mvp);
    gl.uniform1f(gl.getUniformLocation(prog, "uSize"), 55);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  // ================= integración por frame =================
  function step(dt) {
    if (yawAuto) cam.yaw += dt * 0.12;
    if (paused) { draw(); updateHUD(); return; }
    const dtF = dt * P.clock;
    P.t += dtF;
    if (trainOn && phase === "pinn") { for (let i = 0; i < 2; i++) pinn.step(16); }
    if (phase === "cfd") cfd.step(Math.min(0.05, dtF));
    advance(dtF);
    draw();
    updateHUD();
  }
  function advance(dt) {
    const t0 = performance.now();
    if (phase === "exact") {
      const d = Math.exp(-P.nu * P.t);
      const s0 = P.A * d, c0 = P.C * d, s1 = P.B * d;
      for (let i = 0; i < N; i++) {
        const c = i * 3, x = pos[c], y = pos[c + 1], z = pos[c + 2];
        const u = s0 * Math.sin(z) + c0 * Math.cos(y);
        const v = s1 * Math.sin(x) + s0 * Math.cos(z);
        const w = c0 * Math.sin(y) + s1 * Math.cos(x);
        vel[c] = u; vel[c + 1] = v; vel[c + 2] = w;
        pos[c] = wrap(x + u * dt);
        pos[c + 1] = wrap(y + v * dt);
        pos[c + 2] = wrap(z + w * dt);
        spd[i] = Math.sqrt(u * u + v * v + w * w);
      }
    } else if (phase === "pinn") {
      for (let i = 0; i < N; i++) {
        const b = i * 8, c = i * 3;
        inp[b] = pos[c]; inp[b + 1] = pos[c + 1]; inp[b + 2] = pos[c + 2];
        inp[b + 3] = P.t; inp[b + 4] = P.nu; inp[b + 5] = P.A; inp[b + 6] = P.B; inp[b + 7] = P.C;
      }
      pinn.predictMany(inp, out, N);
      for (let i = 0; i < N; i++) {
        const c = i * 3;
        const u = out[c], v = out[c + 1], w = out[c + 2];
        vel[c] = u; vel[c + 1] = v; vel[c + 2] = w;
        pos[c] = (pos[c] + u * dt % TAU + TAU) % TAU;
        pos[c + 1] = (pos[c + 1] + v * dt % TAU + TAU) % TAU;
        pos[c + 2] = (pos[c + 2] + w * dt % TAU + TAU) % TAU;
        spd[i] = Math.sqrt(u * u + v * v + w * w);
      }
    } else {
      const tmp = new Float32Array(3);
      for (let i = 0; i < N; i++) {
        const c = i * 3;
        cfd.sample(pos[c], pos[c + 1], pos[c + 2], tmp);
        vel[c] = tmp[0]; vel[c + 1] = tmp[1]; vel[c + 2] = tmp[2];
        pos[c] = (pos[c] + tmp[0] * dt % TAU + TAU) % TAU;
        pos[c + 1] = (pos[c + 1] + tmp[1] * dt % TAU + TAU) % TAU;
        pos[c + 2] = (pos[c + 2] + tmp[2] * dt % TAU + TAU) % TAU;
        spd[i] = Math.sqrt(tmp[0] * tmp[0] + tmp[1] * tmp[1] + tmp[2] * tmp[2]);
      }
    }
    if (phase !== "pinn") { /* ms de inferencia medidos abajo para exact/cfd */ }
    inferMs = performance.now() - t0 - (phase === "cfd" ? cfd.msPerStep : 0);
    inferEma = 0.9 * inferEma + 0.1 * inferMs;
  }
  function wrap(v) { return ((v % TAU) + TAU) % TAU; }

  // ================= HUD =================
  let hudAcc = 0;
  function updateHUD() {
    hudAcc++;
    if (hudAcc % 20) return;
    const $ = (id) => document.getElementById(id);
    if ($("fl-p-ms")) {
      $("fl-p-ms").textContent = pinn.msTrain >= 1000
        ? (pinn.msTrain / 1000).toFixed(2) + " s" : pinn.msTrain.toFixed(0) + " ms";
      $("fl-p-ep").textContent = pinn.epochs;
      $("fl-p-smp").textContent = (pinn.samplesSeen / 1000).toFixed(1) + "k";
      $("fl-p-err").textContent = (pinn.errEma).toFixed(4);
      $("fl-p-infer").textContent = inferEma.toFixed(2) + " ms";
      $("fl-p-note").textContent = phase === "pinn"
        ? (PINN.pretrained ? "pre-entrenada · sigue refinando" : "entrenando desde cero")
        : (PINN.pretrained ? "precargada (err≈0.09) · cambia ν ⇒ respuesta al instante"
                            : "sin precargar · entrena con el botón");
    }
    if ($("fl-c-ms") && $) {
      $("fl-c-steps").textContent = cfd.steps;
      $("fl-c-ms").textContent = (cfd.msTotal / 1000).toFixed(2) + " s";
      $("fl-c-msstep").textContent = cfd.msPerStep.toFixed(1) + " ms";
      // costo de cambiar ν en CFD: re-integrar hasta t_ref = 6
      const tref = 6, resMs = cfd.msTotal / Math.max(1, cfd.steps) * (tref / 0.016);
      $("fl-c-res").textContent = "~" + (resMs / 1000).toFixed(1) + " s";
    }
    // barras comparativas (escala log): PINN entren. acumulado vs CFD con los mismos t=6 s
    const bp = $("fl-bar-p"), bc = $("fl-bar-c");
    if (bp && bc) {
      const pinK = Math.max(1, pinn.msTrain), cfdK = Math.max(1, cfd.msTotal / Math.max(1, cfd.steps) * (6 / 0.016));
      const mx = Math.log10(Math.max(pinK, cfdK));
      bp.style.width = (8 + 85 * Math.log10(pinK) / Math.max(0.001, mx)) + "%";
      bc.style.width = (8 + 85 * Math.log10(cfdK) / Math.max(0.001, mx)) + "%";
      $("fl-bar-p-v").textContent = (pinK / 1000).toFixed(2) + " s";
      $("fl-bar-c-v").textContent = (cfdK / 1000).toFixed(1) + " s";
    }
  }

  // ================= init / UI =================
  function init() {
    cv = document.getElementById("fl-canvas");
    pinn = new PINN();
    PINN.pretrained = false;
    // red pre-entrenada (pesos offline); si no hay archivo, arranca aleatoria y entrena en vivo
    fetch("pinn_weights.json").then(r => r.ok ? r.json() : null)
      .then(w => { if (w && pinn.load(w)) { PINN.pretrained = true; PINN._wCache = w; } })
      .catch(() => { });
    cfd = new CFD(P.nu);
    reseed();
    okGL = initGL();
    resize();
    bind();
    setSource("exact");
  }
  function bind() {
    const $ = (id) => document.getElementById(id);
    const bindRange = (id, key, fmt) => {
      const el = $(id), lb = $(id + "-val");
      if (!el) return;
      el.value = P[key];
      if (lb) lb.textContent = fmt(P[key]);
      el.addEventListener("input", () => {
        P[key] = +el.value;
        if (lb) lb.textContent = fmt(+el.value);
      });
    };
    bindRange("fl-nu", "nu", v => v.toFixed(2));
    bindRange("fl-a", "A", v => v.toFixed(2));
    bindRange("fl-b", "B", v => v.toFixed(2));
    bindRange("fl-c", "C", v => v.toFixed(2));
    bindRange("fl-clock", "clock", v => v.toFixed(1) + "×");

    document.querySelectorAll('input[name="fl-src"]').forEach(r =>
      r.addEventListener("change", () => { if (r.checked) setSource(r.value); }));
    const bp = $("fl-pause");
    if (bp) bp.onclick = () => {
      paused = !paused;
      bp.textContent = paused ? "▶ Seguir" : "⏸ Pausa";
    };
    const br = $("fl-reseed");
    if (br) br.onclick = reseed;
    const bt = $("fl-train");
    if (bt) bt.onclick = () => {
      trainOn = !trainOn;
      bt.classList.toggle("active", trainOn);
    };
    const bc = $("fl-cfdreset");
    if (bc) bc.onclick = resetCFD;
    const bp2 = $("fl-retrain");
    if (bp2) bp2.onclick = () => { pinn.reset(); if (PINN._wCache && pinn.load(PINN._wCache)) { /* precargada de nuevo */ } };

    // cámara orbital
    let drag = null;
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; yawAuto = false; try { cv.setPointerCapture(e.pointerId); } catch (err) { } });
    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      cam.yaw += (e.clientX - drag.x) * 0.008;
      cam.pitch = Math.max(0.05, Math.min(1.5, cam.pitch + (e.clientY - drag.y) * 0.008));
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("pointerup", () => { drag = null; });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      cam.dist = Math.max(3, Math.min(15, cam.dist * Math.exp(e.deltaY * 0.001)));
    }, { passive: false });
  }
  function resize() {
    if (!cv) return;
    const rect = cv.parentElement.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(2, rect.width * d); cv.height = Math.max(2, rect.height * d);
    cv.style.width = rect.width + "px"; cv.style.height = rect.height + "px";
    W = rect.width; H = rect.height;
  }

  global.RIIS = global.RIIS || {};
  global.RIIS.Fluid = { init, step, resize, get state() { return { phase, epochs: pinn ? pinn.epochs : 0 }; } };
  global.RIIS._fluidDebug = { CFD, P, reseed, resetCFD, setSource };
})(window);
