import torch
import torch.nn as nn

class PINN(nn.Module):
    def __init__(self, input_dim, use_logic=True):
        super().__init__()
        self.use_logic = use_logic
        
        # Red neuronal operando nativamente en float64 (Double Precision) [cite: 52]
        # para mitigar truncamientos de mantisa en derivadas acopladas [cite: 51, 52]
        self.net = nn.Sequential(
            nn.Linear(input_dim, 64, dtype=torch.float64), nn.Tanh(),
            nn.Linear(64, 64, dtype=torch.float64), nn.Tanh(),
            nn.Linear(64, 1, dtype=torch.float64)
        )
        self.sig = nn.Sigmoid()

    def forward(self, x):
        out = self.net(x)
        return self.sig(out) if self.use_logic else out