import pandas as pd
import torch

def load_generic_data(file_path):
    df = pd.read_csv(file_path)
    # Entrada: columnas v0, t, a
    inputs = torch.tensor(df.iloc[:, :-1].values, dtype=torch.float32)
    # Target: total_distance (última columna)
    r_target = torch.tensor(df.iloc[:, -1].values, dtype=torch.float32).unsqueeze(1)
    return inputs, r_target