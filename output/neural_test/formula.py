import numpy as np

def model(inputs):
    # Ley dinámica sintetizada de forma autónoma
    # Variables mapeadas secuencialmente desde el dataset
    X = np.array(inputs, dtype=np.float64)
    return 1/4*X[0]*X[0] + 2/9*X[1]*X[1] + 1/2*cos(X[0]) + 1/2*cos(X[1])
