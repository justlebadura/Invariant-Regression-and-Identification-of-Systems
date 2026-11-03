// RIIS Sandbox — N cuerpos interactiva: lanza, mueve, borra cuerpos y destila —g/r²—
(function (global) {
  "use strict";
  const { Physics, Engine } = global.RIIS;
  let cv, ctx, W = 0, H = 0;
  let bodies = [];
  let G = 1, sunMass = 3000, clock = 1;
  let paused = false;
  let target = "ax"; // columna objetivo a destilar: ax | ay
  const buf = { feat: [], target: [] };

  // tipo de cuerpo a lanzar
  const launchType = { m: 20, color: "#7cf39a", radius: 7 };
  let tool = "place"; // place | launch | move
  const LAUNCH_K = 0.15; // px de arrastre → unidades de velocidad (40 px ≈ v_circ a r=150)
  const PALETTE = ["#7cf39a", "#6ec6ff", "#c792ea", "#f0b866", "#ff8a80", "#aef1e1", "#ffd54f", "#b39ddb"];
  let bodyCount = 0;

  // cámara
  const cam = { x: 0, y: 0, zoom: 1 };
  const toWorld = (sx, sy) => ({ x: (sx - W / 2) / cam.zoom + cam.x, y: (sy - H / 2) / cam.zoom + cam.y });

  // interacción
  let drag = null; // {mode:'move'|'launch'|'pan', ...}
  let inspected = null;
  function pickBody(wx, wy) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if ((b.x - wx) ** 2 + (b.y - wy) ** 2 < (b.radius + 14 / cam.zoom) ** 2) return b;
    }
    return null;
  }

  function init() {
    cv = document.getElementById("sandbox-canvas");
    resize();
    setPreset("sistema");

    // presets
    document.querySelectorAll(".preset").forEach(btn => btn.onclick = () => setPreset(btn.dataset.p));

    // sliders
    const sg = document.getElementById("sb-g"), sm = document.getElementById("sb-m"), st = document.getElementById("sb-t");
    const gl = document.getElementById("sb-g-val"), ml = document.getElementById("sb-m-val"), tl = document.getElementById("sb-t-val");
    sg.oninput = () => { G = +sg.value; gl.textContent = G.toFixed(1); };
    sm.oninput = () => {
      sunMass = +sm.value; ml.textContent = sunMass;
      if (bodies[0]) bodies[0].m = sunMass; // cuerpo 0 = sol
      recomputeOrbit(1); recomputeOrbit(2);
    };
    st.oninput = () => { clock = +st.value; tl.textContent = clock.toFixed(1) + "×"; };
    document.getElementById("sb-pause").onclick = (e) => { paused = !paused; e.currentTarget.textContent = paused ? "Seguir" : "Pausa"; };
    document.getElementById("sb-clear").onclick = () => { bodies = []; buf.feat.length = 0; buf.target.length = 0; };
    document.getElementById("sb-target").onclick = (e) => { target = target === "ax" ? "ay" : "ax"; e.currentTarget.textContent = "Objetivo: a" + (target === "ax" ? "ₓ" : "ᵧ"); };
    document.getElementById("sb-distill").onclick = distill;
    document.getElementById("sb-csv").onclick = exportCSV;
    document.getElementById("sb-latex").onclick = () => navigator.clipboard?.writeText(lastTex || "");
    document.getElementById("sb-orbit").onclick = (e) => {
      snapOrbit = !snapOrbit;
      e.currentTarget.classList.toggle("active", snapOrbit);
      e.currentTarget.textContent = snapOrbit ? "⟳ órbita circular: ON" : "⟳ órbita circular";
    };

    // elección de masa/cuerpo de lanzamiento
    document.querySelectorAll(".ltype").forEach(btn => btn.onclick = () => {
      document.querySelectorAll(".ltype").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      launchType.m = +btn.dataset.m; launchType.color = btn.dataset.color; launchType.radius = +btn.dataset.r;
    });
    // herramientas de interacción
    document.querySelectorAll(".stool").forEach(btn => btn.onclick = () => {
      document.querySelectorAll(".stool").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      tool = btn.dataset.t;
    });

    // mouse
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0012);
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const w0 = toWorld(mx, my);
      cam.zoom = Math.min(4, Math.max(0.25, cam.zoom * f));
      const w1 = toWorld(mx, my);
      cam.x += w0.x - w1.x; cam.y += w0.y - w1.y;
    }, { passive: false });
  }

  function recomputeOrbit(i) {
    const b = bodies[i], s0 = bodies[0];
    if (!b || !s0) return;
    const r = Math.hypot(b.x - s0.x, b.y - s0.y);
    if (r < 8) return;
    const v = Physics.circularV(s0.m, r, G);
    // tangente
    const ux = -(b.y - s0.y) / r, uy = (b.x - s0.x) / r;
    b.vx = v * ux; b.vy = v * uy;
  }

  function setPreset(name) {
    bodies = Physics.preset(name);
    if (bodies[0]) bodies[0].m = sunMass;
    cam.x = 0; cam.y = 0; cam.zoom = 1;
    buf.feat.length = 0; buf.target.length = 0;
  }

  function onDown(e) {
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = toWorld(sx, sy);
    const hit = pickBody(w.x, w.y);
    if (e.button === 2) { // clic derecho: eliminar
      if (hit) bodies = bodies.filter(b => b !== hit);
      return;
    }
    if (hit) {
      drag = { mode: "move", body: hit, sx, sy, bx: hit.x, by: hit.y };
      inspected = hit;
      showInspector(hit);
    } else if (e.button === 0 && tool === "place") {
      // clic simple: el cuerpo aparece DETENIDO con la masa del lanzador
      const color = launchType.color === "#7cf39a" ? PALETTE[bodyCount % PALETTE.length] : launchType.color;
      const b = { m: launchType.m, x: w.x, y: w.y, vx: 0, vy: 0, color, radius: launchType.radius, trail: [], ax: 0, ay: 0, user: true };
      // con ⟳ órbita circular activo, el clic coloca al cuerpo YA EN ÓRBITA
      if (snapOrbit) {
        const s0 = dominantRef();
        if (s0) {
          const dx = w.x - s0.x, dy = w.y - s0.y, r = Math.hypot(dx, dy);
          if (r > 5) {
            const vc = Physics.circularV(s0.m, r, G);
            b.vx = -dy / r * vc; b.vy = dx / r * vc; // tangente (antihorario)
            b.trail.length = 0;
          }
        }
      }
      bodyCount++;
      bodies.push(b);
      showInspector(b); inspected = b;
    } else if (e.button === 0 && tool === "launch") {
      drag = { mode: "launch", x0: w.x, y0: w.y, x1: w.x, y1: w.y };
      const el = document.getElementById("sb-vread");
      if (el) { el.innerHTML = "|v| = <b>0</b>"; el.style.display = "block"; }
    } else if (e.button === 0 && tool === "move") {
      hideVRead();
      drag = { mode: "pan", sx, sy, cx: cam.x, cy: cam.y };
    }
  }
  function onMove(e) {
    if (!drag) return;
    const rect = cv.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (drag.mode === "move") {
      const w = toWorld(sx, sy);
      drag.body.x = w.x; drag.body.y = w.y;
      drag.body.vx = 0; drag.body.vy = 0;
      drag.body.trail.length = 0;
    } else if (drag.mode === "launch") {
      const w = toWorld(sx, sy);
      drag.x1 = w.x; drag.y1 = w.y;
      updateVRead(w);
    } else if (drag.mode === "pan") {
      cam.x = drag.cx - (sx - drag.sx) / cam.zoom;
      cam.y = drag.cy - (sy - drag.sy) / cam.zoom;
    }
  }
  function onUp(e) {
    if (!drag) return;
    if (drag.mode === "launch") {
      // lanza: desplazamiento × LAUNCH_K (escala calibrada: 40 px ≈ v_circ a r=150)
      let vx = (drag.x1 - drag.x0) * LAUNCH_K, vy = (drag.y1 - drag.y0) * LAUNCH_K;
      const s0 = bodies[0];
      if (snapOrbit && s0) {
        // snap a órbita circular: proyecta la dirección arrastrada sobre la tangente con |v| = v_circ
        const dx = drag.x0 - s0.x, dy = drag.y0 - s0.y, r = Math.hypot(dx, dy);
        if (r > 5) {
          const vc = Physics.circularV(s0.m, r, G);
          const tx = -dy / r, ty = dx / r;
          const dir = (vx * tx + vy * ty) >= 0 ? 1 : -1;
          vx = vc * tx * dir; vy = vc * ty * dir;
        }
      }
      const color = launchType.color === "#7cf39a" ? PALETTE[bodyCount % PALETTE.length] : launchType.color;
      const b = { m: launchType.m, x: drag.x0, y: drag.y0, vx, vy, color, radius: launchType.radius, trail: [], ax: 0, ay: 0, user: true };
      bodyCount++;
      bodies.push(b);
      showInspector(b); inspected = b;
      hideVRead();
    }
    drag = null;
  }

  // --- lectura de velocidad en vivo durante el lanzamiento ---
  let snapOrbit = false;
  function dominantRef() {
    // el cuerpo más masivo visible es la referencia gravitacional
    let best = null;
    for (const b of bodies) if (!best || b.m > best.m) best = b;
    return best;
  }
  function updateVRead(w) {
    const el = document.getElementById("sb-vread");
    if (!el) return;
    let vx = (drag.x1 - drag.x0) * LAUNCH_K, vy = (drag.y1 - drag.y0) * LAUNCH_K;
    const v = Math.hypot(vx, vy);
    const s0 = dominantRef(); // referencia: el más masivo
    let extra = "";
    drag.vcInfo = null;
    if (s0) {
      const r = Math.hypot(drag.x0 - s0.x, drag.y0 - s0.y);
      if (r > 5) {
        const vc = Physics.circularV(s0.m, r, G);
        drag.vcInfo = { vc, s0 };
        extra = ` · v<sub>circ</sub> = ${vc.toFixed(1)}`;
        if (snapOrbit) extra += " <span class='snapped'>⟳ snap</span>";
      }
    }
    el.innerHTML = `|v| = <b>${v.toFixed(0)}</b>${extra}`;
    el.style.display = "block";
  }
  function hideVRead() { const el = document.getElementById("sb-vread"); if (el) el.style.display = "none"; }

  function showInspector(b) {
    const el = document.getElementById("sb-inspector");
    el.innerHTML = "";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;align-items:center;";
    const num = document.createElement("input");
    num.type = "number"; num.min = 1; num.max = 9000; num.value = Math.round(b.m);
    num.style.cssText = "width:90px;background:#0a0e1a44;border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:8px;font-family:var(--mono);";
    const applyMass = () => {
      const m = Math.max(1, Math.min(9000, +num.value || 1));
      num.value = m;
      b.m = m;
      // radio coherente con la masa (misma densidad que la estrella: m=3000 → r=18)
      b.radius = Math.max(3, Math.min(30, 18 * Math.cbrt(m / 3000)));
    };
    num.oninput = applyMass;
    const mark = document.createElement("span");
    mark.style.cssText = "font-family:var(--mono);color:" + b.color + ";";
    mark.textContent = "● masa";
    row.appendChild(mark); row.appendChild(num);
    const rbtn = document.createElement("button");
    rbtn.textContent = "r↺"; rbtn.title = "recalcular radio desde la masa";
    rbtn.className = "btn small";
    rbtn.onclick = () => { applyMass(); showInspector(b); };
    row.appendChild(rbtn);
    el.appendChild(row);
  }

  function step(dt) {
    if (paused) { render(); collectSamples(); return; }
    const sub = 3;
    for (let i = 0; i < sub; i++) {
      Physics.nBodyStep(bodies, dt * clock / sub, G, 0.05);
      resolveCollisions();
      if (!bodies[0]) break;
    }
    for (const b of bodies) {
      b.trail.push([b.x, b.y]);
      if (b.trail.length > 320) b.trail.shift();
    }
    collectSamples();
    render();
  }

  // colisiones: fusión inelástica conservando momento y volumen (acreción)
  function resolveCollisions() {
    const DEAD = new Set();
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (DEAD.has(a) || DEAD.has(b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.radius + b.radius;
        if (dx * dx + dy * dy < rr * rr) {
          const big = a.m >= b.m ? a : b, small = a.m >= b.m ? b : a;
          const M = a.m + b.m;
          big.vx = (a.m * a.vx + b.m * b.vx) / M;
          big.vy = (a.m * a.vy + b.m * b.vy) / M;
          // volumen: r³ = r₁³ + r₂³
          big.radius = Math.min(30, Math.cbrt(big.radius ** 3 + small.radius ** 3) * 0.92);
          big.m = M;
          DEAD.add(small);
          flash({ x: big.x, y: big.y, r: big.radius, color: small.color });
          if (inspected === small) { inspected = big; showInspector(big); }
        }
      }
    }
    if (DEAD.size) bodies = bodies.filter(b => !DEAD.has(b));
  }
  // destellos de impacto (2 s de vida en pantalla)
  const flashes = [];
  function flash(f) { f.t = 0; flashes.push(f); if (flashes.length > 12) flashes.shift(); }

  function collectSamples() {
    const s0 = bodies[0];
    if (!s0) return;
    for (const b of bodies) {
      if (b === s0) continue;
      const r = Math.hypot(b.x - s0.x, b.y - s0.y);
      const row = {};
      fillRow(row, b, s0, r);
      buf.feat.push(row);
      buf.target.push(target === "ax" ? b.ax : b.ay);
      if (buf.feat.length > 4000) { buf.feat.shift(); buf.target.shift(); }
    }
  }
  function fillRow(row, b, s0, r) {
    if (activeFeats().includes("x")) row.x = b.x - s0.x;
    if (activeFeats().includes("y")) row.y = b.y - s0.y;
    if (activeFeats().includes("r")) row.r = r;
    if (activeFeats().includes("vx")) row.vx = b.vx;
    if (activeFeats().includes("vy")) row.vy = b.vy;
  }
  function activeFeats() {
    return Array.from(document.querySelectorAll(".feat:checked")).map(c => c.value);
  }

  // --- destilación central ---
  let lastTex = "", lastLaw = null;
  function distill() {
    const feats = ["x", "y", "r", "vx", "vy"];
    const keep = activeFeats();
    if (!keep.length || buf.feat.length < 400) { document.getElementById("sb-equation").textContent = "acumulando muestras…"; return; }
    // mapa x→label de feature para la UI
    const labels = [];
    const used = [];
    feats.forEach(f => { if (keep.includes(f)) { labels.push(symbols[f]); used.push(f); } });
    const Xs = buf.feat.map(row => used.map(f => row[f]));
    const Ys = buf.target;
    const res = Engine.fit(Xs, Ys);
    const d = Engine.distill(res, labels);
    lastTex = "\\alpha_" + (target === "ax" ? "x" : "y") + " = " + d.tex;
    document.getElementById("sb-metrics").textContent =
      "MSE = " + res.mse.toExponential(2) + " · L∞ = " + res.linf.toExponential(2) + " · n = " + buf.target.length;
    global.RIIS.renderTex(document.getElementById("sb-equation"), lastTex);
  }
  const symbols = { x: "x", y: "y", r: "r", vx: "v_x", vy: "v_y" };

  function exportCSV() {
    const keep = activeFeats();
    if (!keep.length) return;
    const header = [...keep, target, "x", "y"].join(",");
    const rows = buf.feat.map((row, i) => [...keep.map(f => row[f].toFixed(4)), buf.target[i].toFixed(4), ""]);
    const blob = new Blob([header + "\n" + rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "riis_orbitales.csv";
    a.click();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
    // orbitas/escurrimiento
    for (const b of bodies) {
      if (b.trail.length > 1) {
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        b.trail.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      const gr = ctx.createRadialGradient(b.x - b.radius * 0.3, b.y - b.radius * 0.3, 1, b.x, b.y, b.radius);
      gr.addColorStop(0, "#ffffff88");
      gr.addColorStop(1, b.color);
      ctx.fillStyle = gr;
      ctx.shadowColor = b.color; ctx.shadowBlur = b.radius * 2.2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // destellos de colisión
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.t += 0.05;
      if (f.t > 1) { flashes.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - f.t) * 0.8;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r + f.t * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // lanzamiento pendiente
    if (drag?.mode === "launch") {
      ctx.strokeStyle = "rgba(124, 243, 154, 0.75)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(drag.x0, drag.y0); ctx.lineTo(drag.x1, drag.y1); ctx.stroke();
      // referencia tangencial de órbita circular (flecha sólida con |v| = v_circ)
      if (drag.vcInfo) {
        const { vc, s0 } = drag.vcInfo;
        const dx = drag.x0 - s0.x, dy = drag.y0 - s0.y, rr = Math.hypot(dx, dy);
        const tux = -dy / rr, tuy = dx / rr, L = vc / LAUNCH_K;
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255, 214, 79, 0.9)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(drag.x0 - tux * L, drag.y0 - tuy * L);
        ctx.lineTo(drag.x0 + tux * L, drag.y0 + tuy * L);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(124, 243, 154, 0.4)";
      ctx.beginPath(); ctx.arc(drag.x0, drag.y0, 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function resize() {
    if (!cv) return;
    const rect = cv.parentElement.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = rect.width * d; cv.height = rect.height * d;
    cv.style.width = rect.width + "px"; cv.style.height = rect.height + "px";
    ctx = cv.getContext("2d");
    ctx.setTransform(d, 0, 0, d, 0, 0);
    W = rect.width; H = rect.height;
  }

  global.RIIS.Sandbox = { init, step, resize, distill, resolveCollisions, setBodies: (b) => { bodies = b; }, getBodies: () => bodies };
})(window);
