import torch
import os
import numpy as np
from src.symbolic_engine import IRIS

class SymbolicDistiller:
    def __init__(self, model):
        self.model = model
        self.engine = IRIS()

    def distill(self, input_dim, names):
        # Evaluación masiva sobre el espacio espectral latente en float64 [cite: 6, 52]
        x_phys = torch.rand(3000, input_dim, dtype=torch.float64)
        self.model.eval()
        with torch.no_grad(): 
            y_phys = self.model(x_phys)
        
        # Preservación de magnitudes crudas y cálculo del error supremo [cite: 49, 54]
        err = self.engine.fit(x_phys, y_phys)
        return self.engine.get_discovered_law("target", names), err

    def save_python_script(self, law, path, names):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            right_hand_side = law.split('=')[1].strip()
        except IndexError:
            right_hand_side = "0.0"
            
        # Limpieza de sintaxis para que el script generado sea puramente ejecutable en NumPy
        clean_expression = right_hand_side.replace(" * ", "*")
        
        with open(path, "w") as f:
            f.write("import numpy as np\n\n")
            f.write("def model(inputs):\n")
            f.write(f"    # Ley dinámica sintetizada de forma autónoma\n")
            f.write(f"    # Variables mapeadas secuencialmente desde el dataset\n")
            f.write(f"    X = np.array(inputs, dtype=np.float64)\n")
            
            # Mapeo interno de las variables del array inyectado usando la lista inyectada
            for i, name in enumerate(names):
                clean_expression = clean_expression.replace(name, f"X[{i}]")
                
            f.write(f"    return {clean_expression}\n")