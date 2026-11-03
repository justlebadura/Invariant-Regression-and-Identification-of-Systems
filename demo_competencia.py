import os
import numpy as np
import pandas as pd
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from src.symbolic_engine import RIIS

console = Console()
np.random.seed(42)

DATA = "data/competencia"


def build_library():
    """Problemas de nivel creciente, cada uno con su 'ground truth' cerrado."""
    problems = []

    # Nivel 1 — Dinámica no lineal: péndulo de amplitud grande
    theta = np.random.uniform(-1.5, 1.5, 2000)
    alpha = -4.9 * np.sin(theta) + np.random.normal(0, 0.01, theta.size)
    problems.append(dict(
        nombre="Péndulo no lineal",
        nivel=1,
        df=pd.DataFrame({"angulo": theta, "aceleracion_angular": alpha}),
        verdad="α = -(g/L)·sin(θ)",
        columnas=["θ", "α"],
    ))

    # Nivel 2 — Singularidad de órbita: ley de inversión del cuadrado (Kepler/Coulomb)
    r = np.random.uniform(0.5, 5.0, 2000)
    F = 39.478 / (r ** 2) + np.random.normal(0, 0.01, r.size)
    problems.append(dict(
        nombre="Órbita de Kepler (fuerza central 1/r²)",
        nivel=2,
        df=pd.DataFrame({"distancia": r, "fuerza": F}),
        verdad="F = μ·/r²",
        columnas=["r", "F"],
    ))

    # Nivel 3 — Potencial de doble pozo: oscilador de Duffing
    x = np.random.uniform(-2.0, 2.0, 2000)
    a = -1.0 * x - 0.5 * x ** 3 + np.random.normal(0, 0.02, x.size)
    problems.append(dict(
        nombre="Oscilador de Duffing (doble pozo)",
        nivel=3,
        df=pd.DataFrame({"posicion": x, "aceleracion": a}),
        verdad="ẍ = -x - x³/2",
        columnas=["x", "ẍ"],
    ))

    # Nivel 4 — Resistencia cuadrática durante caída libre
    v = np.random.uniform(0.1, 25.0, 2000)
    a = -9.8 + 0.25 * v ** 2 + np.random.normal(0, 0.02, v.size)
    problems.append(dict(
        nombre="Caída libre con fricción cuadrática",
        nivel=4,
        df=pd.DataFrame({"velocidad": v, "aceleracion": a}),
        verdad="ȧ = -g + k·v²",
        columnas=["v", "a"],
    ))

    # Nivel 5 — Resonancia forzada: acoplamiento lineal + conducción periódica
    t = np.random.uniform(0, 4 * np.pi, 4000)
    x = np.random.uniform(-3, 3, 4000)
    a = -4.0 * x + 2.0 * np.sin(t) + np.random.normal(0, 0.03, t.size)
    problems.append(dict(
        nombre="Resonancia forzada (oscilador dirigido)",
        nivel=5,
        df=pd.DataFrame({"posicion": x, "tiempo": t, "aceleracion": a}),
        verdad="ẍ = -ω₀²·x + F·sin(t)",
        columnas=["x", "t", "ẍ"],
    ))

    return problems


def main():
    os.makedirs(DATA, exist_ok=True)
    problems = build_library()

    titulo = Table(title="Competencia: Problemas Complejos Resueltos por RIIS", border_style="cyan")
    titulo.add_column("Nivel", justify="center")
    titulo.add_column("Problema")
    titulo.add_column("Ley real (objetivo)")
    console.print(Panel(titulo))

    results = Table(border_style="green")
    results.add_column("✓", justify="center")
    results.add_column("Ley descubierta por el motor RIIS", overflow="fold")

    for p in problems:
        df = p["df"]
        df.to_csv(os.path.join(DATA, f"nivel{p['nivel']}.csv"), index=False)

        X = df.iloc[:, :-1].values
        y = df.iloc[:, -1].values
        engine = RIIS()
        err = engine.fit(X, y)
        law = engine.get_discovered_law("y", p["columnas"])
        results.add_row(f"[green]L{p['nivel']}[/green] {p['nombre']}", f"{law}\n[dim]{p['verdad']} | MSE: {engine.last_mse:.2e}")

    console.print(Panel(Panel(results, title="Resultados de la Destilación Axiomática", border_style="green")))
    for p in problems:
        console.print(f"[dim]Dataset guardado: data/competencia/nivel{p['nivel']}.csv → ejecutable con `python main.py`[/dim]")


if __name__ == "__main__":
    main()
