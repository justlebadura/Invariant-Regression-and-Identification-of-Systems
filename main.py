import torch
import pandas as pd
from src.symbolic_engine import IRIS

def main():
    """Execution pipeline for automated non-linear system identification."""
    
    # Path settings
    dataset_path = 'data/datos_3_cuerpos.csv'
    target_variable = 'ay0'
    exclusion_variables = ['ax0', 'ay0']

    # Data loading and preprocessing pipeline
    try:
        df = pd.read_csv(dataset_path)
    except FileNotFoundError:
        print(f"[ERROR] Target dataset file not found at: {dataset_path}")
        return

    # Dynamic separation of feature spaces
    input_features = [col for col in df.columns if col not in exclusion_variables]
    
    X_tensor = torch.tensor(df[input_features].values, dtype=torch.float64)
    Y_tensor = torch.tensor(df[target_variable].values, dtype=torch.float64)

    # Core identification execution
    print(f"[INFO] Initializing system identification for target variable: '{target_variable}'")
    print(f"[INFO] Input feature tensor shape: {list(X_tensor.shape)}")
    
    engine = IRIS(threshold=0.08, max_denominator=10)
    l_infinity_norm = engine.fit(X_tensor, Y_tensor)
    
    discovered_equation = engine.get_discovered_law(
        target_name=target_variable, 
        custom_names=input_features
    )

    # Standardized Analytical Reporting Output
    print("\n" + "="*60)
    print("IDENTIFIED GOVERNING LAW (SYSTEM DYNAMICS EVALUATION)")
    print("="*60)
    print(f"Expression: {discovered_equation}")
    print(f"Residual Error (L_inf norm): {l_infinity_norm:.16e}")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()