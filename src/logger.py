import logging

def setup_logger():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - [CIENTÍFICO-IA] - %(message)s',
        datefmt='%H:%M:%S'
    )
    return logging.getLogger()

logger = setup_logger()