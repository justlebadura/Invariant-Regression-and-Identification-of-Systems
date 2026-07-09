import pandas as pd
import numpy as np

def evaluate_symbolic_network(rain_active, target_hour, num_accidents):
    r = rain_active
    h = target_hour
    n = num_accidents
    
    # Pre-calculate powers
    h2, h3 = h**2, h**3
    r2, r3 = r**2, r**3
    n2, n3 = n**2, n**3
    
    eps = 1e-15
    n_sq_eps = n2 + eps
    n_cub_eps = n3 + eps
    
    # Evaluate distilled network risk formula terms
    term_rain = 9 * r + 9 * r2 + 9 * r3 - 26 * r2 * h + 1.375 * r2 * n - 26 * r * h + 1.375 * r * n
    term_hour = - 52.1 * h - 39.714 * h2 + 22.1 * h3 - 1.9 * h * n + 0.222 * h * n2
    term_accidents = 2.75 * n + 0.5 * n2 + 0.111 * n3
    term_rationals = - 10.555 * h / n_sq_eps + 7.625 * h / n_cub_eps + 9.4 / (n + eps) + 5.3 / n_sq_eps + 3.285 / n_cub_eps
    term_trig = 10.667 * np.sin(r) + 14.6 * np.cos(r) + 109.778 * np.sin(h) - 74.7 * np.cos(h) + 12 * np.sin(n) - 3.143 * np.cos(n)
    
    val = term_rain + term_hour + term_accidents + term_rationals + term_trig
    return val

def main():
    print("Loading network predictions...")
    df = pd.read_csv("data/network_predictions.csv")
    df = df[df['num_accidents'] > 0] # Filter out nodes with 0 accidents where rationals blow up
    
    net_preds = df['risk_score'].values
    sym_preds = []
    
    for idx, row in df.iterrows():
        val = evaluate_symbolic_network(
            rain_active=row['rain_active'],
            target_hour=row['target_hour'],
            num_accidents=row['num_accidents']
        )
        sym_preds.append(val)
        
    sym_preds = np.array(sym_preds)
    
    # Calculate statistics
    diff = net_preds - sym_preds
    mse = np.mean(diff ** 2)
    mae = np.mean(np.abs(diff))
    max_diff = np.max(np.abs(diff))
    correlation = np.corrcoef(net_preds, sym_preds)[0, 1]
    
    print("\n--- Verification of Network Distillation ---")
    print(f"Mean Squared Error (MSE): {mse:.6f}")
    print(f"Mean Absolute Error (MAE): {mae:.6f}")
    print(f"Maximum Difference (L_inf): {max_diff:.6f}")
    print(f"Pearson Correlation: {correlation:.4f}")
    print(f"Network Preds range: Min={net_preds.min():.4f}, Max={net_preds.max():.4f}")
    print(f"Symbolic Preds range: Min={sym_preds.min():.4f}, Max={sym_preds.max():.4f}")

if __name__ == "__main__":
    main()
