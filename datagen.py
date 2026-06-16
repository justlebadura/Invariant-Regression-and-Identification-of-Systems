import os
import pandas as pd
import numpy as np

def generate_benchmark_dataset(system_type='coupled_inverse'):
    """Pseudo-librería analítica para la emulación de sistemas dinámicos multivariables.
    
    Sistemas disponibles:
        'kinematics': Sistema lineal polinomial continuo.
        'oscillator': Sistema dinámico con acoplamiento por fricción.
        'coupled_inverse': Sistema de alta complejidad con singularidades acopladas.
    """
    os.makedirs('data', exist_ok=True)
    np.random.seed(42)
    raw_data = []
    
    print(f"[BENCHMARK] Generando entorno sintético para: '{system_type}'")
    
    for _ in range(1000):
        if system_type == 'kinematics':
            v0 = float(np.random.randint(1, 15))
            t = float(np.random.randint(1, 10))
            a = float(np.random.randint(1, 6))
            target = (1.0 * v0 * t) + (0.5 * a * (t**2))
            raw_data.append([v0, t, a, target])
            columns = ['v0', 't', 'a', 'target']
            
        elif system_type == 'oscillator':
            x = np.random.uniform(-5.0, 5.0)
            v = np.random.uniform(-2.0, 2.0)
            target = -3.0 * x - 0.5 * v
            raw_data.append([x, v, target])
            columns = ['position', 'velocity', 'acceleration']
            
        elif system_type == 'coupled_inverse':
            # Configuración de tres nodos acoplados (Representación abstracta de 3 Cuerpos)
            dx01, dy01 = float(np.random.randint(1, 10)), float(np.random.randint(1, 10))
            r01 = float(np.random.randint(2, 6))
            dx02, dy02 = float(np.random.randint(1, 10)), float(np.random.randint(1, 10))
            r02 = float(np.random.randint(2, 6))
            
            # Ecuación de campo central acoplado vertical
            ay0 = -1.0 * (dy01 / (r01**3)) - 1.0 * (dy02 / (r02**3))
            raw_data.append([dx01, dy01, r01, dx02, dy02, r02, ay0])
            columns = ['dx01', 'dy01', 'r01', 'dx02', 'dy02', 'r02', 'ay0']

    df = pd.DataFrame(raw_data, columns=columns)
    output_path = 'data/datos_dinamicos.csv'
    df.to_csv(output_path, index=False)
    print(f"[BENCHMARK] Dataset exportado exitosamente ({df.shape[0]} filas) en: '{output_path}'")

if __name__ == "__main__":
    # Cambiar el string para alternar el benchmark global del motor
    generate_benchmark_dataset(system_type='coupled_inverse')