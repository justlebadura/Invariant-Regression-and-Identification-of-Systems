import torch
import numpy as np
from fractions import Fraction

class IRIS:
    """Invariant Regression and Identification of Systems (I.R.I.S.)

    A framework for automated symbolic regression that discovers underlying 
    governing differential equations from raw tensor data using Sequentially 
    Thresholded Least Squares (SINDy) and rational fraction mapping.
    """

    def __init__(self, threshold: float = 0.05, max_denominator: int = 20):
        """Initializes the IRIS discovery engine.

        Args:
            threshold (float): Hard threshold value for feature pruning.
            max_denominator (int): Maximum allowed denominator for rational fraction conversion.
        """
        self.threshold = threshold
        self.max_denominator = max_denominator
        self.weights = None
        self.feature_names = []

    def _build_design_matrix(self, X: torch.Tensor) -> np.ndarray:
        """Constructs a comprehensive non-linear library mapping function.

        Generates polynomial (up to degree 3), rational inverse (up to degree -3),
        and trigonometric candidate terms from the input feature space.

        Args:
            X (torch.Tensor): Input tensor of shape [batch_size, num_features].

        Returns:
            np.ndarray: Expanded evaluation matrix of shape [batch_size, num_candidates].
        """
        num_vars = X.shape[1]
        terms = []
        self.feature_names = []
        epsilon = 1e-15  # Numerical stabilizer for singularity avoidance

        # --- Base Polynomial Library (Degrees 1 to 3) ---
        for i in range(num_vars):
            terms.append(X[:, i:i+1])
            self.feature_names.append(f"col_{i}")
        
        for i in range(num_vars):
            for j in range(i, num_vars):
                terms.append(X[:, i:i+1] * X[:, j:j+1])
                self.feature_names.append(f"col_{i}*col_{j}")
                
        for i in range(num_vars):
            for j in range(i, num_vars):
                for k in range(j, num_vars):
                    terms.append(X[:, i:i+1] * X[:, j:j+1] * X[:, k:k+1])
                    self.feature_names.append(f"col_{i}*col_{j}*col_{k}")

        # --- Rational Inverse Library (Degrees -1 to -3) ---
        for i in range(num_vars):
            terms.append(1.0 / (X[:, i:i+1] + epsilon))
            self.feature_names.append(f"1/col_{i}")
            
            terms.append(1.0 / (X[:, i:i+1]**2 + epsilon))
            self.feature_names.append(f"1/col_{i}^2")
            
            terms.append(1.0 / (X[:, i:i+1]**3 + epsilon))
            self.feature_names.append(f"1/col_{i}^3")

        # --- Vectorial Cross-Inverse Interactions (e.g., dx / r^n) ---
        if num_vars >= 2:
            for i in range(num_vars):
                for j in range(num_vars):
                    if i != j:
                        terms.append(X[:, i:i+1] / (X[:, j:j+1]**2 + epsilon))
                        self.feature_names.append(f"col_{i}/col_{j}^2")
                        
                        terms.append(X[:, i:i+1] / (X[:, j:j+1]**3 + epsilon))
                        self.feature_names.append(f"col_{i}/col_{j}^3")

        # --- Trigonometric Library ---
        for i in range(num_vars):
            terms.append(torch.sin(X[:, i:i+1]))
            self.feature_names.append(f"sin(col_{i})")
            
            terms.append(torch.cos(X[:, i:i+1]))
            self.feature_names.append(f"cos(col_{i})")

        phi = torch.cat(terms, dim=1)
        return phi.numpy()

    def fit(self, X_tensor: torch.Tensor, Y_tensor: torch.Tensor) -> float:
        """Fits the governing law using Sequentially Thresholded Least Squares.

        Args:
            X_tensor (torch.Tensor): Predictor state vectors.
            Y_tensor (torch.Tensor): Target continuous derivatives/accelerations.

        Returns:
            float: Maximum absolute error (L_infinity norm) of the fitted model.
        """
        Phi_np = self._build_design_matrix(X_tensor)
        Y_np = Y_tensor.float().view(-1, 1).numpy()
        
        num_terms = Phi_np.shape[1]
        active_indices = np.arange(num_terms)
        
        # Iterative sparse pruning optimization loop
        for _ in range(20):
            Phi_active = Phi_np[:, active_indices]
            W_active, _, _, _ = np.linalg.lstsq(Phi_active, Y_np, rcond=None)
            
            W_full = np.zeros(num_terms)
            W_full[active_indices] = W_active.flatten()
            
            new_active_indices = np.where(np.abs(W_full) >= self.threshold)[0]
            if np.array_equal(active_indices, new_active_indices):
                break
            active_indices = new_active_indices
            
        self.weights = W_full
        
        predictions = Phi_np @ self.weights.reshape(-1, 1)
        max_error = np.max(np.abs(predictions - Y_np))
        return float(max_error)

    def get_discovered_law(self, target_name: str = "target", custom_names: list = None) -> str:
        """Reconstructs the algebraic law converting coefficients to rational fractions.

        Args:
            target_name (str): Identifier label for the dependent variable.
            custom_names (list): Explicit labels to replace abstract index columns.

        Returns:
            str: Formal mathematical string representation of the discovered law.
        """
        equation_components = []
        
        for name, weight in zip(self.feature_names, self.weights):
            if abs(weight) > 1e-5:
                # Precision Decimal: Conversion continuous float -> Fraction mapping
                frac = Fraction(float(weight)).limit_denominator(self.max_denominator)
                str_coefficient = f"{frac.numerator}/{frac.denominator}"
                
                # Handling sign visualization formatting cleanly
                if frac.numerator > 0:
                    str_coefficient = f"+ {str_coefficient}"
                else:
                    str_coefficient = f"- {abs(frac.numerator)}/{frac.denominator}"
                
                equation_components.append(f"{str_coefficient} * {name}")
        
        if not equation_components:
            return f"{target_name} = 0"
            
        raw_law = " ".join(equation_components)
        if raw_law.startswith("+ "):
            raw_law = raw_law[2:]
            
        law_str = f"{target_name} = {raw_law}"
        
        if custom_names:
            for idx, real_name in enumerate(custom_names):
                law_str = law_str.replace(f"col_{idx}", real_name)
                
        return law_str