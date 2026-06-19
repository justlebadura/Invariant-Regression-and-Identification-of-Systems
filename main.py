import torch
import os
import pandas as pd
import numpy as np
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, TextColumn, BarColumn, TaskProgressColumn
from rich.prompt import Prompt, Confirm

from src.logic_loss import RILLLoss
from src.pinn_factory import PINN
from src.distiller import SymbolicDistiller
from src.logger import log

console = Console()

def print_banner():
    # Añadida la 'r' inicial (raw string) para evitar SyntaxWarnings por escapes en ASCII art
    console.print("\n")
    console.print(Panel.fit(
        r"      __  ______  ____ ____    __  ___ ____  ______ ____  ____  " "\n"
        r"     / / / __  / / __// __/   /  |/  // __ \/_  __// __ \/ __ \ " "\n"
        r"    / / / /_/ / / /_  _\ \   / /|_/ // / / / / /  / / / / /_/ / " "\n"
        r"   /_/ /_/ /_/ /___//___/  /_/  /_/ \____/ /_/  /\____//_/\_\   " "\n"
        " \n   [bold white]Framework Neuro-Simbólico para Descubrimiento de Leyes Dinámicas[/bold white]",
        border_style="cyan"
    ))

def main():
    print_banner()
    
    data_dir = "data"
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        console.print(Panel(f"[yellow]Carpeta '{data_dir}/' creada automáticamente. Por favor, deposita tus archivos CSV allí.[/yellow]"))
        return

    files = [f for f in os.listdir(data_dir) if f.endswith('.csv')]
    if not files:
        console.print(Panel("[red]Error: No se encontraron archivos estructurados .csv en la ruta 'data/'[/red]"))
        return

    # Visualización elegante de los datasets candidatos
    table = Table(title="Datasets Dinámicos Disponibles", expand=True, border_style="dim")
    table.add_column("Índice", justify="center", style="cyan", no_wrap=True)
    table.add_column("Nombre del Archivo", style="white")
    
    for idx, filename in enumerate(files):
        table.add_row(str(idx), filename)
    console.print(table)

    choice_str = Prompt.ask("Selecciona el índice del dataset objetivo", choices=[str(i) for i in range(len(files))])
    choice = int(choice_str)
    
    path = os.path.join(data_dir, files[choice])
    use_rill = Confirm.ask("¿Deseas integrar el operador de pérdida lógica RILL?")

    # Procesamiento de variables preservando magnitudes crudas en FLOAT64 [cite: 49, 52]
    df = pd.read_csv(path)
    names = df.columns.tolist()[:-1]
    target = df.columns.tolist()[-1]

    # Carga limpia sin escalamientos lineales MinMax que rompan el análisis dimensional [cite: 48]
    x_train = torch.tensor(df[names].values, dtype=torch.float64)
    y_train = torch.tensor(df[[target]].values, dtype=torch.float64)

    model = PINN(len(names), use_logic=use_rill)
    opt = torch.optim.Adam(model.parameters(), lr=0.005)
    crit = RILLLoss() if use_rill else torch.nn.MSELoss()

    console.print(f"\n[bold green]✓[/bold green] Arquitectura del framework configurada exitosamente en [bold white]float64 (Doble Precisión)[/bold white].")
    
    # Simulación del bucle de entrenamiento acoplada con barras de progreso animadas en terminal
    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(bar_width=40, complete_style="green", finished_style="cyan"),
        TaskProgressColumn(),
        console=console
    ) as progress:
        epochs = 1000
        task = progress.add_task("[yellow]Optimizando espacio continuo de la PINN...", total=epochs)
        
        for epoch in range(1, epochs + 1):
            opt.zero_grad()
            loss = crit(model(x_train), y_train)
            loss.backward()
            opt.step()
            
            if epoch % 10 == 0 or epoch == epochs:
                progress.update(task, advance=10, description=f"[yellow]Ajustando gradientes | Loss: {loss.item():.4e}")

    # Inicialización del motor de regresión simbólica masiva [cite: 1]
    console.print("\n[bold yellow]⌛ Iniciando destilación del espacio latente y filtrado SINDy...[/bold yellow]")
    distiller = SymbolicDistiller(model)
    ley, err = distiller.distill(len(names), names)

    out_dir = os.path.join("output", os.path.splitext(files[choice])[0])
    
    # Inyección de 'names' corregida para evitar el NameError
    distiller.save_python_script(ley, os.path.join(out_dir, "formula.py"), names)
    
    with open(os.path.join(out_dir, "reporte.tex"), "w") as f:
        f.write(distiller.engine.get_latex_report(target, names))

    # Panel de resultados finales con métricas bajo la norma del error supremo [cite: 54]
    result_table = Table(box=None, show_header=False, width=80)
    result_table.add_row("[bold green]Ecuación Descubierta:[/bold green]", f"[bold white]{ley}[/bold white]")
    result_table.add_row("[bold green]Error Supremo (L_inf):[/bold green]", f"[cyan]{err:.6e}[/cyan]")
    result_table.add_row("[bold green]Código Sintetizado:[/bold green]", f"[dim]{out_dir}/formula.py[/dim]")
    result_table.add_row("[bold green]Reporte Científico:[/bold green]", f"[dim]{out_dir}/reporte.tex[/dim]")

    console.print("\n")
    console.print(Panel(result_table, title="[bold white]Resultados de la Destilación Axiomática[/bold white]", border_style="green"))
    console.print("\n")

if __name__ == "__main__":
    main()