// RIIS Pendulum — simulación viva + red destilando la ley en tiempo real
(function (global) {
  "use strict";
  const { Physics, Engine } = global.RIIS;
  let cv, ctx, W = 0, H = 0;
  let L = 1, g = 9.8, amp = 120;
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  // péndulos reales: soporta N péndulos (cada uno con su propio estado y color)
  const POD_COLORS = ["#7cf3ff", "#ff9de2", "#ffd66b", "#9dffad", "#c9a0ff", "#ff8a6b"];
  let pods = []; // {s, ghost, color}
  let nPend = 1;

  function setPods(n) {
    nPend = Math.max(1, Math.min(6, n));
    while (pods.length < nPend) {
      const idx = pods.length;
      let th = (amp + (idx ? ((idx * 23) % 40) - 20 : 0)) * Math.PI / 180;
      if (idx === 0) th = amp * Math.PI / 180;
      pods.push({ s: [th, 0], ghost: [th, 0], color: POD_COLORS[idx % POD_COLORS.length] });
    }
    pods.length = nPend;
    samples.length = 0;
    const lbl = document.getElementById("pend-count-val");
    if (lbl) lbl.textContent = nPend;
  }

  // péndulo "fantasma": gobernado por la LEY descubierta en vez del sin exacto
  let ghostActive = false;
  let ghostLaw = null; // {terms:[{coeff, feature}]} evaluada con feature "θ"

  const samples = []; // {θ, α} capturados cada frame

  // péndulo fantasma: α = Σ coeff·feature evalúa la LEY descubierta
  function evalLawAlpha(terms, x) {
    let a = 0;
    for (const t of terms) {
      const code = t.feature
        .replace(/sin\(([^()]*)\)/g, "Math.sin($1)")
        .replace(/cos\(([^()]*)\)/g, "Math.cos($1)")
        .replace(/·/g, "*")
        .replace(/θ/g, "x[0]")
        .replace(/\^(\d+)/g, "**$1");
      try { a += t.coeff * Function("x", `"use strict"; return (${code})`)(x); } catch (e) { /* término vacío */ }
    }
    return a;
  }

  function init() {
    cv = document.getElementById("pendulum-canvas");
    resize();
    // sliders
    const bl = document.getElementById("pend-l"), bg = document.getElementById("pend-g"), ba = document.getElementById("pend-a");
    const labels = { l: document.getElementById("pend-l-val"), g: document.getElementById("pend-g-val"), a: document.getElementById("pend-a-val") };
    bl.oninput = () => { L = +bl.value; labels.l.textContent = L.toFixed(2) + " m"; };
    bg.oninput = () => { g = +bg.value; labels.g.textContent = g.toFixed(2) + " m/s²"; };
    ba.oninput = () => { amp = +ba.value; labels.a.textContent = amp + "°"; signalRelease(amp * Math.PI / 180); };
    document.getElementById("pend-release").onclick = () => signalRelease(amp * Math.PI / 180);
    document.getElementById("pend-ghost").onclick = (e) => {
      ghostActive = !ghostActive;
      e.currentTarget.innerHTML = "Ley fantasma: <b>" + (ghostActive ? "ON" : "OFF") + "</b>";
      if (ghostActive) { ghost = [s[0], s[1]]; }
    };
    document.getElementById("pend-distill").onclick = distill;
    document.getElementById("pend-latex").onclick = copyLatex;
    // N péndulos
    const add = document.getElementById("pend-add"), rem = document.getElementById("pend-remove");
    if (add) add.onclick = () => setPods(nPend + 1);
    if (rem) rem.onclick = () => setPods(nPend - 1);
    setPods(1);
    // si hay una ley ya descubierta, prender el ghost después de 1.5 segundos
    distill();
    setInterval(() => { if (!ghostActive) return; }, 1000);
  }

  function signalRelease(theta0) {
    pods[0].s = [theta0, 0];
    pods[0].ghost = [theta0, 0];
    samples.length = 0;
  }

  function step(dt) {
    const sub = 4, h = dt / sub;
    const deriv = Physics.pendDeriv(g, L);
    for (const pod of pods) {
      for (let i = 0; i < sub; i++) {
        pod.s = Physics.rk4(deriv, pod.s, h);
        // capturar muestra: θ, α = -(g/L)·sin θ (de cualquier péndulo: la ley es la misma)
        samples.push({ t: pod.s[0], a: -(g / L) * Math.sin(pod.s[0]) });
        if (ghostActive && ghostLaw) {
          const gderiv = (st) => [st[1], evalLawAlpha(ghostLaw, st)];
          pod.ghost = Physics.rk4(gderiv, pod.ghost, h);
        } else if (ghostActive) {
          pod.ghost = [...pod.s];
        }
        pod.s[0] = wrapAngles(pod.s[0]);
        pod.ghost[0] = wrapAngles(pod.ghost[0]);
      }
    }
    render();
  }
  function wrapAngles(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  function drawStar(x, y, r, c, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function resize() {
    if (!cv) return;
    const rect = cv.parentElement.getBoundingClientRect();
    const d = dpr();
    cv.width = rect.width * d; cv.height = rect.height * d;
    cv.style.width = rect.width + "px"; cv.style.height = rect.height + "px";
    ctx = cv.getContext("2d");
    ctx.setTransform(d, 0, 0, d, 0, 0);
    W = rect.width; H = rect.height;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    // estrellitas fondo
    for (let i = 0; i < 70; i++) {
      const sx = (i * 97.13) % W, sy = (i * 221.7) % H;
      drawStar(sx, sy, (i % 3) * 0.8 + 0.6, "#8899cc", 0.13);
    }
    // pivote: cada péndulo cuelga de un punto propio (fila centrada)
    const py = H * 0.22, len = Math.min(H * 0.42, 255 * L);
    const spacing = Math.min(64, W / (nPend + 1));
    const drawPod = (pod, idx) => {
      const px = W / 2 + (idx - (nPend - 1) / 2) * spacing;
      const bx = px + len * Math.sin(pod.s[0]), by = py + len * Math.cos(pod.s[0]);
      // brazo
      ctx.strokeStyle = "rgba(219, 228, 255, 0.6)";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
      // brazo fantasma (mismo péndulo, regido por la ley descubierta)
      if (ghostActive) {
        const gx = px + len * Math.sin(pod.ghost[0]), gy = py + len * Math.cos(pod.ghost[0]);
        ctx.strokeStyle = "rgba(255, 179, 71, 0.8)";
        ctx.setLineDash([6, 7]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(gx, gy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255, 179, 71, 0.8)";
        ctx.beginPath(); ctx.arc(gx, gy, 12, 0, Math.PI * 2); ctx.fill();
      }
      // bob
      const grad = ctx.createRadialGradient(bx - 4, by - 4, 2, bx, by, 17);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, pod.color);
      ctx.fillStyle = grad;
      ctx.shadowColor = pod.color; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // pivote de este péndulo
      ctx.fillStyle = "#c084fc";
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    };
    pods.forEach(drawPod);
    // arco de amplitud sobre el péndulo central
    ctx.strokeStyle = "rgba(110,231,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(W / 2, py, len + 26, Math.PI / 2 - amp * Math.PI / 180, Math.PI / 2 + amp * Math.PI / 180); ctx.stroke();
  }

  // --- destilación ---
  let lastTex = "", lastMSE = "";

  function distill() {
    if (samples.length < 300) { scheduleDistill(1200); return; }
    const Q = Math.round(Math.min(samples.length, 3000));
    const idxStep = Math.max(1, Math.floor(samples.length / Q));
    const Xs = [], Ys = [];
    for (let i = 0; i < samples.length; i += idxStep) { Xs.push([samples[i].t]); Ys.push(samples[i].a); }
    const res = Engine.fit(Xs, Ys);
    const d = Engine.distill(res, ["θ"]);
    ghostLaw = d.terms;
    lastTex = "\\alpha(\\theta) = " + d.tex;
    lastMSE = "MSE = " + res.mse.toExponential(2) + "  ·  L∞ = " + res.linf.toExponential(2) + "  ·  muestras " + samples.length;
    global.RIIS.renderTex(document.getElementById("pend-equation"), lastTex);
    document.getElementById("pend-metrics").textContent = lastMSE;
    document.getElementById("pend-samples").textContent = samples.length;
    scheduleDistill(3000); // refinar periódicamente (más muestras = mejor)
  }
  function scheduleDistill(ms) { clearTimeout(global.RIIS._pd); global.RIIS._pd = setTimeout(distill, ms); }

  function copyLatex() { navigator.clipboard?.writeText(lastTex || ""); }

  global.RIIS.Pendulum = { init, step, resize, get samples() { return samples.length; } };
})(window);

// render hook: app core invoca step; render dentro de step si módulo listo
