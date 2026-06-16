
# Invariant Regression and Identification of Systems

A high-performance neuro-symbolic framework for the automated discovery, structural isolation, and distillation of non-linear governing ordinary differential equations from raw, highly coupled multivariate dynamic systems.

## Overview

Modern scientific computing often relies on black-box estimators like Physics-Informed Neural Networks (PINNs) to approximate chaotic trajectories. While highly effective at continuous optimization, these architectures lack formal explainability and fail to yield the underlying algebraic conservation laws.

This framework bridges the gap between deep learning and analytical mechanics. It maps multi-dimensional state vectors into a high-dimensional, broad-spectrum design library matrix `Phi(X)` and applies an optimized Sequentially Thresholded Least Squares (SINDy) algorithm. The core innovation features a **Diophantine Rational Mapping layer** that eliminates floating-point hardware truncation noise, converting continuous empirical weights into pure rational fractions (the **Q** field).

---

## Key Mathematical Capabilities

* **Broad-Spectrum Feature Expansion:** Tensorized batch-mapping that dynamically generates orthogonal polynomial (degrees 1 to 3), trigonometric (`sin`, `cos`), and rational inverse (degrees -1 to -3) candidate functions to capture asymptotic singularity profiles.
* **Sequential Feature Pruning:** Iterative sparse optimization loop regulated by a hard-thresholding operator with a strict cutoff threshold of `0.08` that forces column de-isolation, systematically neutralizing catastrophic multicollinearity.
* **Exact Fraction Reconstruction:** Bounded continuous fraction expansion that rounds out binary mantissa drift to discover precise physical constants (e.g., transforming an empirical weight of `-0.999999981` to a clean `-1/1` expression).

---

## Repository Architecture

```text
├── data/
│   └── datos_dinamicos.csv      # Generated high-fidelity validation dataset
├── src/
│   ├── __init__.py
│   └── symbolic_engine.py       # Core IRIS class (SINDy matrix + Diophantine mapping)
├── generate_data.py             # Multi-environment high-fidelity data generation engine
├── main.py                      # Global orchestrator and standardized analytical logger
├── requirements.txt             # Documented production dependencies
└── README.md

```

---

## Empirical Benchmarks & Convergence

The regression engine undergoes unified, blind testing across varying physical profiles using the supremo/maximum absolute error norm `L_inf = max | approx_Y - Y |` under a 64-bit precision environment.

| Dynamic Environment | Theoretical Target Law | Discovered Expression | Residual Error (L_inf norm) |
| --- | --- | --- | --- |
| Linear Kinematics | r = v0*t + 1/2*a*t^2 | r = 1/1 * v0*t + 1/2 * a*t^2 | 0.000000e+00 |
| Damped Coupled System | a = -3*x - 0.5*v | a = -3/1 * x - 1/2 * v | 1.013279e-06 |
| Non-Linear Angular Pendulum | a = -g/L * sin(theta) | a = -0.9907 * theta + 0.1470 * theta^3 | 7.640244e-03 |
| **Coupled Inverse Singularities** | ay0 = sum(-1 * dy_j / r_j^3) | ay0 = - 1/1 * dy01/r01^3 - 1/1 * dy02/r02^3 | **1.097250e-07** |

### Structural Error Interpretations

* **Discrete Integration Shift:** The residual error scale (`10^-6`) in the Damped Coupled baseline stems from the time-step discretization of the simulation environment, rather than optimizer misalignment.
* **Taylor Boundary Limits:** The `10^-3` error in the angular pendulum corresponds to the geometric truncation error of the third-degree polynomial library approaching the boundaries of high-amplitude data domains (`theta` approx 1.5 rad).
* **Singularity Conditioning:** The `10^-7` residue in the highly chaotic coupled inverse benchmark represents the conditioning threshold of the 64-bit hardware mantissa (53-bit physical limit) during extreme quasi-collision states (`r` approaching 0).

---

## Getting Started

### Prerequisites

* Python 3.10+
* Supported OS: Linux (Fedora/Ubuntu workstation verified), macOS, Windows

### Environment Setup

1. **Clone the repository and navigate to the root directory:**
```bash
git clone <repository-url>
cd iris-symbolic-engine

```


2. **Create and activate an isolated virtual environment (`venv`):**
```bash
# Linux / macOS
python3 -m venv venv
source venv/bin/activate

# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

```


3. **Install production dependencies via `requirements.txt`:**
```bash
pip install --upgrade pip
pip install -r requirements.txt

```



---

## Production Pipeline Execution

1. **Initialize the High-Fidelity Data Generator:**
Set your target testing criteria (`'kinematics'`, `'oscillator'`, or `'coupled_inverse'`) in `generate_data.py` and execute the benchmark data production:
```bash
python generate_data.py

```


2. **Execute System Identification:**
Trigger the global orchestrator to analyze the broad-spectrum design matrix and recover the algebraic governing equation under professional logging formats:
```bash
python main.py

```
