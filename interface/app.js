// RIIS app — orquestación: tabs, render loop, resize
(function (global) {
  "use strict";
  const { Engine, Physics } = global.RIIS;
  global.RIIS.state = { active: "pendulum" };

  // --- Tabs ---
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + t.dataset.view).classList.add("active");
    global.RIIS.state.active = t.dataset.view === "fluid" ? "fluid" : t.dataset.view;
    requestAnimationFrame(() => global.RIIS.state.modules.forEach(m => m.resize?.()));
  }));

  // escena dentro de Fluidos: Tuberías (default) / Laboratorio PINN
  document.querySelectorAll("[data-flscene]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-flscene]").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    global.RIIS.state.fluidScene = b.dataset.flscene;
    const s = global.RIIS.state.fluidScene;
    document.getElementById("fl-pipes")?.classList.toggle("hidden", s !== "pipes");
    document.getElementById("fl-abc")?.classList.toggle("hidden", s !== "abc");
    document.getElementById("fl-controls-abc")?.classList.toggle("hidden", s !== "abc");
    document.getElementById("fl-controls-pw")?.classList.toggle("hidden", s !== "pipes");
    requestAnimationFrame(() => global.RIIS.state.modules.forEach(m => m.resize?.()));
  }));

  // --- KaTeX helper con fallback ---
  function renderTex(el, tex, { pulse = true } = {}) {
    el.textContent = "";
    const span = document.createElement("span");
    el.appendChild(span);
    if (global.katex) {
      try { global.katex.render(tex, span, { displayMode: false, throwOnError: false }); } catch (e) { span.textContent = tex; }
    } else {
      span.textContent = tex.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)").replace(/\\cdot/g, "·").replace(/\\left|\\right|\\!/g, "").replace(/\\sin\\!/g, "sin").replace(/\\/g, "");
    }
    if (pulse) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
  }
  global.RIIS.renderTex = renderTex;

  // --- resize hidratado en devicePixelRatio ---
  function hydrateCanvas(canvas) {
    const parent = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = parent.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: rect.width, h: rect.height, ctx };
  }
  global.RIIS.hydrateCanvas = hydrateCanvas;

  // --- módulos ---
  const modules = [
    global.RIIS.Pendulum,
    global.RIIS.Sandbox,
    global.RIIS.Fluid,
    global.RIIS.Pipes,
  ];
  modules.forEach(m => m.init?.());
  global.RIIS.state.modules = modules;
  global.RIIS.state.fluidScene = "pipes";
  const FLUID_VIEW = "fluid";
  let logged = new Set();

  // --- bucle maestro ---
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const active = global.RIIS.state.active;
    modules.forEach(m => {
      const isFluid = (m === global.RIIS.Fluid) || (m === global.RIIS.Pipes);
      if (isFluid && (active !== FLUID_VIEW)) return;
      // dentro de la vista Fluidos sólo corre la escena activa (tuberías | PINN)
      if (m === global.RIIS.Fluid && global.RIIS.state.fluidScene !== "abc") return;
      if (m === global.RIIS.Pipes && global.RIIS.state.fluidScene !== "pipes") return;
      try { m.step?.(dt); } catch (err) {
        const k = err?.message || String(err);
        if (!logged.has(k)) { logged.add(k); console.error("RIIS: módulo congelado detectado —", k); }
      }
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.addEventListener("resize", () => modules.forEach(m => m.resize?.()));
})(window);
