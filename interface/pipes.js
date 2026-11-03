// RIIS Pipes — agua corriendo por tuberías con válvulas interactivas y trampas (sifones).
// El flujo se resuelve por BFS desde la fuente: cada celda apunta hacia la siguiente
// (continuidad), las válvulas cerradas cortan la red; clic en una válvula la abre/cierra.
(function (global) {
  "use strict";
  const COLS = 48, ROWS = 26, CELL = 20;
  const W = COLS * CELL, H = ROWS * CELL;

  // ---------- escenarios ----------
  const PRESETS = {
    circuito: {
      name: "Circuito doble",
      source: [3, 3], drain: [44, 3],
      pipes: [
        [[3, 3], [10, 3], [10, 10], [16, 10], [16, 3], [44, 3]],
        [[3, 3], [3, 20], [8, 20], [8, 11], [15, 11], [15, 22], [27, 22], [27, 3], [44, 3]],
      ],
      valves: [{ x: 13, y: 3 }, { x: 21, y: 22 }],
    },
    lavabo: {
      name: "Lavabo con trampa P",
      source: [2, 22], drain: [38, 22],
      pipes: [
        [[2, 22], [2, 10], [10, 10], [10, 16], [16, 16], [16, 6], [24, 6], [24, 14], [30, 14], [30, 8], [38, 8], [38, 22]],
      ],
      valves: [{ x: 20, y: 6 }],
    },
    sifones: {
      name: "Doble sifón",
      source: [2, 22], drain: [46, 3],
      pipes: [
        [[2, 22], [2, 12], [9, 12], [9, 20], [15, 20], [15, 4], [23, 4], [23, 18], [29, 18], [29, 10], [35, 10], [35, 20], [41, 20], [41, 3], [46, 3]],
      ],
      valves: [{ x: 6, y: 12 }, { x: 19, y: 4 }, { x: 37, y: 20 }],
    },
  };

  let scene = null, sceneName = "circuito", valves = [];
  let cells = new Map();
  let paused = false, caudal = 1, turb = 0.5;
  let cv, ctx, ok2d = false, cssW = W, cssH = H;
  const P = [];               // partículas {x,y,cx,cy,tx,ty,stale}
  let spawnAcc = 0, t = 0, valvePulse = 0;

  const key = (x, y) => x + "," + y;

  function fillPoly(cellsMap, poly) {
    for (let s = 0; s < poly.length - 1; s++) {
      let [x0, y0] = poly[s], [x1, y1] = poly[s + 1];
      const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
      let x = x0, y = y0;
      cellsMap.set(key(x, y), { x, y });
      while (x !== x1 || y !== y1) {
        if (x !== x1) x += dx; else y += dy;
        cellsMap.set(key(x, y), { x, y });
      }
    }
  }

  function buildScene(name) {
    const def = PRESETS[name];
    sceneName = name;
    valves = def.valves.map(v => ({ x: v.x, y: v.y, open: v.open !== false, anim: 1 }));
    rebuild();
    P.length = 0;
  }

  function rebuild() {
    cells = new Map();
    for (const poly of PRESETS[sceneName].pipes) fillPoly(cells, poly);
    // celdas de válvula cerrada se cortan de la red (siguen pintándose)
    for (const v of valves) {
      if (!v.open) cells.delete(key(v.x, v.y));
    }
    // BFS desde la fuente: dist al origen + árbol de flujo
    const S = PRESETS[sceneName].source;
    for (const c of cells.values()) { c.dist = -1; c.children = []; }
    const q = [S];
    const sCell = cells.get(key(S[0], S[1]));
    if (!sCell) return;
    sCell.dist = 0;
    while (q.length) {
      const c = q.shift();
      for (const [nx, ny] of [[c.x + 1, c.y], [c.x - 1, c.y], [c.x, c.y + 1], [c.x, c.y - 1]]) {
        const n = cells.get(key(nx, ny));
        if (!n || n.dist >= 0) continue;
        n.dist = c.dist + 1;
        c.children.push(n);
        q.push(n);
      }
    }
  }

  function spawn() {
    const S = PRESETS[sceneName].source;
    P.push({ x: S[0] * CELL + CELL / 2, y: S[1] * CELL + CELL / 2, cx: S[0], cy: S[1], tx: 0, ty: 0, stale: 0, ph: Math.random() * 7 });
    pickTarget(P[P.length - 1]);
  }

  function pickTarget(p) {
    const c = cells.get(key(p.cx, p.cy));
    if (!c || !c.children.length) { p.tx = p.x; p.ty = p.y; return; }
    const n = c.children[(Math.random() * c.children.length) | 0];
    p.tx = n.x * CELL + CELL / 2;
    p.ty = n.y * CELL + CELL / 2;
  }

  function step(dt) {
    t += dt;
    if (paused) { draw(); return; }
    valvePulse = Math.max(0, valvePulse - dt * 3);
    for (const v of valves) v.anim += ((v.open ? 0 : 1) - v.anim) * Math.min(1, dt * 8);
    // caudal: población objetivo proporcional al caudal
    const target = Math.floor(140 + caudal * 420);
    const src = cells.get(key(PRESETS[sceneName].source[0], PRESETS[sceneName].source[1]));
    if (P.length < target && src) { spawnAcc += dt * (target - P.length) * 1.4; while (spawnAcc > 1) { spawn(); spawnAcc--; } }
    if (P.length > target + 60) P.splice(target, P.length - target);
    const spd = CELL * (4.5 + 7 * caudal) * dt;
    for (const p of P) {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d < 1.5) {
        p.cx = Math.round((p.tx - CELL / 2) / CELL); p.cy = Math.round((p.ty - CELL / 2) / CELL);
        p.px = p.cx; p.py = p.cy;
        const c = cells.get(key(p.cx, p.cy));
        if (!c || (c.x === PRESETS[sceneName].drain[0] && c.y === PRESETS[sceneName].drain[1])) {
          respawn(p); continue;
        }
        if (!c.children.length) {            // fondo de trampa / rama muerta: agua quieta
          p.stale += 1;
          if (p.stale > 260) respawn(p);
          pickTarget(p); continue;
        }
        p.stale = Math.max(0, p.stale - 3);
        pickTarget(p);
      } else {
        p.x += dx / d * spd;
        p.y += dy / d * spd;
        // turbulencia: ondulación perpendicular
        const w = Math.sin(t * 5 + p.ph) * turb * CELL * 0.12;
        p.x += -dy / d * w * dt * 6;
        p.y += dx / d * w * dt * 6;
      }
    }
    draw();
  }
  function respawn(p) {
    const S = PRESETS[sceneName].source;
    p.cx = S[0]; p.cy = S[1];
    p.x = S[0] * CELL + CELL / 2; p.y = S[1] * CELL + CELL / 2;
    p.stale = 0; p.ph = Math.random() * 7;
    pickTarget(p);
  }

  // ---------- render ----------
  function draw() {
    if (!ok2d) return;
    ctx.setTransform(cssW / W, 0, 0, cssH / H, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1020"); bg.addColorStop(1, "#101830");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // --- tubos ---
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const pass = (width, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      for (const c of cells.values()) {
        for (const [nx, ny] of [[1, 0], [0, 1]]) {
          const n = cells.get(key(c.x + nx, c.y + ny));
          if (!n) continue;
          ctx.moveTo(c.x * CELL + CELL / 2, c.y * CELL + CELL / 2);
          ctx.lineTo(n.x * CELL + CELL / 2, n.y * CELL + CELL / 2);
        }
      }
      ctx.stroke();
    };
    pass(CELL * 0.66, "#3a4761");
    pass(CELL * 0.48, "#5a6f92");
    pass(CELL * 0.22, "rgba(148,178,220,.4)");
    // válvulas cerradas: el tramo pintado se dibuja igual (celda eliminada del flujo)
    for (const v of valves) {
      if (v.open) continue;
      const cx = v.x * CELL + CELL / 2, cy = v.y * CELL + CELL / 2;
      const horiz = cells.get(key(v.x + 1, v.y)) || cells.get(key(v.x - 1, v.y));
      ctx.strokeStyle = "#5a6f92"; ctx.lineWidth = CELL * 0.5;
      ctx.beginPath();
      if (horiz) { ctx.moveTo(cx - CELL, cy); ctx.lineTo(cx + CELL, cy); }
      else { ctx.moveTo(cx, cy - CELL); ctx.lineTo(cx, cy + CELL); }
      ctx.stroke();
    }
    // --- fuente y desagüe ---
    const S = PRESETS[sceneName].source, D = PRESETS[sceneName].drain;
    const sx = S[0] * CELL + CELL / 2, sy = S[1] * CELL + CELL / 2;
    const pul = 1 + Math.sin(t * 4) * 0.15 + valvePulse * 0.5;
    ctx.fillStyle = "rgba(79,195,247,.25)";
    ctx.beginPath(); ctx.arc(sx, sy, CELL * 0.6 * pul, 0, 7); ctx.fill();
    ctx.fillStyle = "#7cf3ff";
    ctx.beginPath(); ctx.arc(sx, sy, CELL * 0.26, 0, 7); ctx.fill();
    const dx = D[0] * CELL + CELL / 2, dy = D[1] * CELL + CELL / 2;
    ctx.strokeStyle = "#2b3550"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(dx, dy, CELL * 0.34, 0, 7); ctx.stroke();
    ctx.fillStyle = "#0a0e1a";
    ctx.beginPath(); ctx.arc(dx, dy, CELL * 0.3, 0, 7); ctx.fill();
    // --- agua ---
    ctx.save();
    for (const p of P) {
      const a = p.stale > 0 ? Math.max(0.25, 1 - p.stale / 260) : 1;
      ctx.fillStyle = `rgba(90,190,255,${0.14 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(190,235,255,${0.85 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, CELL * 0.13, 0, 7); ctx.fill();
    }
    ctx.restore();
    // --- válvulas ---
    for (const v of valves) {
      const cx = v.x * CELL + CELL / 2, cy = v.y * CELL + CELL / 2;
      const angle = v.anim * Math.PI / 2;
      ctx.fillStyle = v.open ? "#7cf39a" : "#ff6b5e";
      ctx.strokeStyle = "rgba(10,14,26,.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.36, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#0d1224"; ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * CELL * 0.3, cy - Math.sin(angle) * CELL * 0.3);
      ctx.lineTo(cx + Math.cos(angle) * CELL * 0.3, cy + Math.sin(angle) * CELL * 0.3);
      ctx.stroke();
    }
    // etiquetas
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.fillStyle = "rgba(210,225,255,.65)";
    ctx.fillText("fuente", sx - 16, sy - 14);
    ctx.fillText("desagüe", dx - 22, dy + 20);
  }

  // ---------- UI ----------
  let hungValve = null;
  function pointerValve(px, py) {
    const gx = px / cssW * W, gy = py / cssH * H;
    let best = null, bd = CELL;
    for (const v of valves) {
      const d = Math.hypot(v.x * CELL + CELL / 2 - gx, v.y * CELL + CELL / 2 - gy);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  function init() {
    cv = document.getElementById("pw-canvas");
    if (!cv) return;
    ctx = cv.getContext("2d");
    ok2d = !!ctx;
    buildScene(sceneName);
    resize(); bind(); if (!statusEl()) { /* sin panel, no pasa nada */ }
  }
  function statusEl() { return document.getElementById("pw-status"); }
  function bind() {
    cv.addEventListener("pointerdown", (e) => {
      if (!ok2d) return;
      const r = cv.getBoundingClientRect();
      const v = pointerValve(e.clientX - r.left, e.clientY - r.top);
      if (v) { v.open = !v.open; valvePulse = 1; rebuild(); }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!ok2d) return;
      const r = cv.getBoundingClientRect();
      hungValve = pointerValve(e.clientX - r.left, e.clientY - r.top);
      cv.style.cursor = hungValve ? "pointer" : "default";
    });
    const bindRange = (id, key) => {
      const el = document.getElementById(id), lb = document.getElementById(id + "-val");
      if (!el) return;
      el.addEventListener("input", () => {
        const v = +el.value;
        if (key === "caudal") caudal = v; else turb = v;
        if (lb) lb.textContent = key === "caudal" ? v.toFixed(1) + "×" : (v * 100 | 0) + "%";
      });
    };
    bindRange("pw-caudal", "caudal");
    bindRange("pw-turb", "turb");
    const bp = document.getElementById("pw-pause");
    if (bp) bp.onclick = () => { paused = !paused; bp.textContent = paused ? "▶ Seguir" : "⏸ Pausa"; };
    document.querySelectorAll("#pw-presets .preset-pw").forEach(b =>
      b.addEventListener("click", () => {
        document.querySelectorAll("#pw-presets .preset-pw").forEach(x => x.classList.remove("accent"));
        b.classList.add("accent");
        buildScene(b.dataset.p);
      }));
  }
  function resize() {
    if (!cv) return;
    const rect = cv.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(50, rect.width); cssH = cssW * H / W;
    cv.width = cssW * dpr; cv.height = cssH * dpr;
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
  }

  global.RIIS = global.RIIS || {};
  global.RIIS.Pipes = { init, step, resize, get debug() { return valves; } };
})(window);
