import torch
import numpy as np

# Generamos puntos de prueba para ver cómo reacciona la red
# Esto nos permite deducir la fórmula por comportamiento
def extract_law(model):
    model.eval()
    with torch.no_grad():
        # Probamos con valores controlados para ver qué hace la red
        test_inputs = torch.tensor([[1.0, 1.0, 1.0], [2.0, 2.0, 2.0]], dtype=torch.float32)
        outputs = model(test_inputs)
        print("Entradas probadas:\n", test_inputs.numpy())
        print("Salidas de la red (La Ley):\n", outputs.numpy())

extract_law(model)