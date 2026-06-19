import torch
import torch.nn as nn

class RILLLoss(nn.Module):
    def __init__(self):
        super().__init__()

    def forward(self, p, q):
        # Forzado de límites en rango lógico [0, 1]
        p = torch.clamp(p, 0.0, 1.0)
        q = torch.clamp(q, 0.0, 1.0)
        eps = 1e-15  # Estabilizador numérico de alta precisión [cite: 27]
        
        l_pq = -torch.log(1.0 - p + p * q + eps)
        l_p0 = -torch.log(1.0 - p + eps)
        return torch.mean(l_pq - l_p0)