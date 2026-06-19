import torch
import numpy as np
from fractions import Fraction

class IRIS:
    def __init__(self, threshold=0.08):
        # Hiperparámetro de corte estricto lambda = 0.08 según especificaciones del paper [cite: 38]
        self.threshold = threshold
        self.weights = None
        self.feature_names = []
        self.last_mse = 0.0

    def _build_design_matrix(self, X):
        X_np = X.detach().numpy() if torch.is_tensor(X) else np.array(X, dtype=np.float64)
        X_np = X_np.astype(np.float64)
        num_vars = X_np.shape[1]
        
        terms = []
        self.feature_names = []
        eps = 1e-15  # Estabilizador numérico estricto contra indeterminaciones por cero [cite: 27]

        # 1. Sub-biblioteca Polinomial Espacial (Hasta 3er Grado y términos cruzados) [cite: 23, 24]
        for i in range(num_vars):
            terms.append(X_np[:, i:i+1])
            self.feature_names.append(f"x{i}")
            
            for j in range(i, num_vars):
                terms.append(X_np[:, i:i+1] * X_np[:, j:j+1])
                self.feature_names.append(f"x{i}*x{j}")
                
                for k in range(j, num_vars):
                    terms.append(X_np[:, i:i+1] * X_np[:, j:j+1] * X_np[:, k:k+1])
                    self.feature_names.append(f"x{i}*x{j}*x{k}")

        # 2. Sub-biblioteca de Inversos Racionales y Singularidades Acopladas [cite: 25, 28]
        for i in range(num_vars):
            terms.append(1.0 / (X_np[:, i:i+1] + eps))
            self.feature_names.append(f"1/(x{i})")
            
            terms.append(1.0 / (X_np[:, i:i+1]**2 + eps))
            self.feature_names.append(f"1/(x{i}^2)")
            
            terms.append(1.0 / (X_np[:, i:i+1]**3 + eps))
            self.feature_names.append(f"1/(x{i}^3)")
            
            for j in range(num_vars):
                if i != j:
                    terms.append(X_np[:, i:i+1] / (X_np[:, j:j+1]**2 + eps))
                    self.feature_names.append(f"x{i}/(x{j}^2)")
                    
                    terms.append(X_np[:, i:i+1] / (X_np[:, j:j+1]**3 + eps))
                    self.feature_names.append(f"x{i}/(x{j}^3)")

        # 3. Sub-biblioteca Trigonométrica Espectral [cite: 29, 31]
        for i in range(num_vars):
            terms.append(np.sin(X_np[:, i:i+1]))
            self.feature_names.append(f"sin(x{i})")
            terms.append(np.cos(X_np[:, i:i+1]))
            self.feature_names.append(f"cos(x{i})")

        return np.hstack(terms)

    def fit(self, X, Y):
        Phi = self._build_design_matrix(X)
        Y_np = Y.detach().numpy().reshape(-1, 1) if torch.is_tensor(Y) else Y.reshape(-1, 1)
        Y_np = Y_np.astype(np.float64)
        
        active = np.arange(Phi.shape[1])
        
        # Algoritmo de Mínimos Cuadrados Secuenciales con Umbral Estricto (SINDy) [cite: 7, 35]
        for _ in range(20):
            if len(active) == 0:
                break
            W_active, _, _, _ = np.linalg.lstsq(Phi[:, active], Y_np, rcond=None)
            W_full = np.zeros(Phi.shape[1], dtype=np.float64)
            W_full[active] = W_active.flatten()
            
            # Poda quirúrgica iterativa basada en el hiperparámetro estricto lambda [cite: 38]
            active = np.where(np.abs(W_full) >= self.threshold)[0]
            
        self.weights = W_full
        self.last_mse = float(np.mean((Phi @ self.weights.reshape(-1, 1) - Y_np)**2))
        
        # Retorna el error bajo la norma del error supremo (L_infinity) [cite: 8, 54]
        return float(np.max(np.abs(Phi @ self.weights.reshape(-1, 1) - Y_np)))

    def get_discovered_law(self, target="y", names=None):
        comps = []
        for n, w in zip(self.feature_names, self.weights):
            if abs(w) > 1e-9:
                # Operador de Perfección Decimal Racional limitado estrictamente a d_max = 10 [cite: 42, 45]
                f = Fraction(float(w)).limit_denominator(10)
                s = "+" if f.numerator > 0 else "-"
                
                if f.denominator == 1:
                    comps.append(f"{s} {abs(f.numerator)} * {n}")
                else:
                    comps.append(f"{s} {abs(f.numerator)}/{f.denominator} * {n}")
                    
        law = f"{target} = {' '.join(comps)}".replace("= +", "=")
        if names:
            for i, n in enumerate(names):
                law = law.replace(f"x{i}", n)
        return law

    def get_latex_report(self, target, names):
        law = self.get_discovered_law(target, names)
        return f"\\section*{{Reporte Axiomático del Motor Simbólico IRIS}}\n\\textbf{{Ley Física Destilada:}} ${law}$\\\\\n\\textbf{{Error Cuadrático Medio (MSE):}} {self.last_mse:.2e}"