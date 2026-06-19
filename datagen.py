import pandas as pd
import numpy as np
import os

def generate_nesy_data():
    os.makedirs("data", exist_ok=True)
    
    # Dataset de Sesgo de Implicación: 
    # Queremos aprender: Si tiene 'alas' (p) -> 'vuela' (q)
    # Pero en los datos, 'vuela' es ruidoso. Una red normal negaría que tiene alas.
    n = 1000
    alas = np.random.uniform(0.7, 1.0, n) # Casi todos tienen alas
    vuela = 0.8 * alas + np.random.normal(0, 0.05, n) # Pero no todos vuelan perfecto
    
    pd.DataFrame({'alas': alas, 'vuela': vuela}).to_csv('data/implication_bias_test.csv', index=False)
    
    # Dataset para Redes (Multivariante)
    x1 = np.random.rand(n)
    x2 = np.random.rand(n)
    y = np.sin(x1) + (x2**2)
    pd.DataFrame({'feature1': x1, 'feature2': x2, 'target': y}).to_csv('data/neural_test.csv', index=False)

    print("[OK] Datasets de prueba generados en /data")

if __name__ == "__main__":
    generate_nesy_data()