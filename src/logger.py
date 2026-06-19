import logging
import sys
from rich.logging import RichHandler

def setup_logger():
    # Configuración del logger integrada con Rich para una terminal limpia y estilizada
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(rich_tracebacks=True, markup=True)]
    )
    return logging.getLogger("IRIS")

log = setup_logger()