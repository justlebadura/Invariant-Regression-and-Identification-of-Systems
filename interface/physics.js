// RIIS Physics — integradores numéricos en doble precisión (RK4 / N-cuerpos)
(function (global) {
  "use strict";

  // Dinámica del péndulo: θ'' = -(g/L)·sin(θ)
  function pendDeriv(g, L) {
    return (s) => [s[1], -(g / L) * Math.sin(s[0])];
  }

  // RK4 genérico: s es [θ, ω] (u otro vector) y deriv(s) -> [θ', ω']
  function rk4(deriv, s, dt) {
    const k1 = deriv(s);
    const s2 = s.map((v, i) => v + dt * k1[i] / 2);
    const k2 = deriv(s2);
    const s3 = s.map((v, i) => v + dt * k2[i] / 2);
    const k3 = deriv(s3);
    const s4 = s.map((v, i) => v + dt * k3[i]);
    const k4 = deriv(s4);
    return s.map((v, i) => v + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
  }

  // Aceleración gravitacional N-cuerpos con suavizado (evitar singularidad en colisiones)
  function nBodyAccel(bodies, G, soft = 0.05) {
    const n = bodies.length;
    const ax = new Float64Array(n), ay = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bodies[j].x - bodies[i].x, dy = bodies[j].y - bodies[i].y;
        const r2 = dx * dx + dy * dy + soft * soft;
        const invR = 1 / Math.sqrt(r2);
        const f = G * invR * invR * invR; // G / (r² · r) normalizado por dx
        ax[i] += f * bodies[j].m * dx; ay[i] += f * bodies[j].m * dy;
        ax[j] -= f * bodies[i].m * dx; ay[j] -= f * bodies[i].m * dy;
      }
    }
    return { ax, ay };
  }

  // Paso molecular velocity-Verlet para N cuerpos (conserva energía mucho mejor que Euler)
  function nBodyStep(bodies, dt, G, soft) {
    const a0 = nBodyAccel(bodies, G, soft);
    for (let i = 0; i < bodies.length; i++) {
      bodies[i].vx += a0.ax[i] * dt / 2;
      bodies[i].vy += a0.ay[i] * dt / 2;
      bodies[i].x += bodies[i].vx * dt;
      bodies[i].y += bodies[i].vy * dt;
    }
    const a1 = nBodyAccel(bodies, G, soft);
    for (let i = 0; i < bodies.length; i++) {
      bodies[i].vx += a1.ax[i] * dt / 2;
      bodies[i].vy += a1.ay[i] * dt / 2;
      bodies[i].ax = a1.ax[i]; bodies[i].ay = a1.ay[i];
    }
  }

  // Velocidad circular para órbita de radio r en torno a masa central M
  function circularV(M, r, G) { return Math.sqrt(G * M / r); }

  // Presets de N cuerpos
  function preset(name) {
    const mk = (m, x, y, vx, vy, color, radius) => ({ m, x, y, vx, vy, color, radius, trail: [], ax: 0, ay: 0 });
    switch (name) {
      case "sistema":
        return [
          mk(3000, 0, 0, 0, 0, "#ffb347", 14),
          mk(1, 150, 0, 0, circularV(3000, 150, 1), "#6ee7ff", 6),
          mk(1, -260, 0, 0, -circularV(3000, 260, 1), "#c084fc", 5),
        ];
      case "figura8": { // Chenciner–Montgomery: órbita de figura-8 con masas iguales
        const p = 0.347111, q = 0.532728;
        return [
          mk(1, -1, 0, p, -q, "#6ee7ff", 8),
          mk(1, 1, 0, p, -q, "#c084fc", 8),
          mk(1, 0, 0, -2 * p, 2 * q, "#ffb347", 9),
        ].map(b => ({ ...b, x: b.x * 130, y: b.y * 130, vx: b.vx * Math.sqrt(130), vy: b.vy * Math.sqrt(130) })); // escala geométrica consistente
      }
      case "binario":
        return [
          mk(1500, -120, 0, 0, -circularV(750, 120, 1), "#ffb347", 11),
          mk(1500, 120, 0, 0, circularV(750, 120, 1), "#f472b6", 11),
          mk(2, 260, 0, 0, 0, "#6ee7ff", 5),
        ];
      default:
        return preset("sistema");
    }
  }

  global.RIIS = global.RIIS || {};
  global.RIIS.Physics = { pendDeriv, rk4, nBodyAccel, nBodyStep, circularV, preset };
})(typeof window !== "undefined" ? window : globalThis);
