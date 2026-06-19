
```markdown
# Invariant Regression and Identification of Systems

[cite_start]Este framework presenta un marco metodológico formal para la identificación, aislamiento y destilación autónoma de ecuaciones diferenciales ordinarias acopladas y leyes algebraicas no lineales que gobiernan sistemas dinámicos complejos[cite: 5]. 

[cite_start]El motor elude la opacidad y la falta de interpretabilidad de las arquitecturas de caja negra tradicionales mediante un pipeline neuro-simbólico: primero optimiza el espacio continuo del fenómeno y luego proyecta trayectorias sobre un espacio de características latentes de amplio espectro para extraer leyes físicas puras, exactas y legibles[cite: 6, 17].

---

##Fundamento Matemático y Arquitectura del Motor

El flujo de procesamiento del sistema ejecuta una transformación rigurosa dividida en cuatro etapas secuenciales:


```

Trayectorias Crudas (Precisión Doble float64)
│
▼
[ Optimización de la PINN ]

│
▼
[ Generador Espectral de Hipótesis Φ(X) ]
│
▼
[ Filtrado Secuencial con Umbral Estricto ] ──► Poda quirúrgica (λ = 0.08)
│
▼
[ Operador de Perfección Diofantino ]      ──► Purificación (d_max = 10)
│
▼
Ecuación Física Simbólica Exacta

```

### 1. Generador Espectral de Hipótesis Φ(X)
[cite_start]Dado un tensor de variables de estado de entrada **X** en formato de matriz de dos dimensiones (donde las filas representan el tamaño del lote de procesamiento y las columnas la dimensionalidad del espacio observable), el operador realiza un mapeo no lineal multidimensional[cite: 19, 21]. [cite_start]Su objetivo es expandir de forma ciega el universo de hipótesis candidatas a una dimensión hiperdeterminada mucho mayor que la inicial[cite: 21].

[cite_start]La matriz de diseño global se construye mediante la partición y concatenación horizontal de tres sub-bibliotecas algebraicas ortogonales[cite: 22]:

* [cite_start]**Sub-biblioteca Polinomial Espacial (Φ_poly):** Modela los términos de acoplamiento lineal y las aproximaciones locales de Taylor hasta tercer grado[cite: 23, 24]:
  * Términos lineales: `x_i`
  * Términos cuadráticos cruzados: `x_i * x_j`
  * Términos cúbicos complejos: `x_i * x_j * x_k`

* [cite_start]**Sub-biblioteca de Inversos Racionales y Singularidades (Φ_inv):** Diseñada específicamente para capturar decaimientos asintóticos y singularidades dinámicas severas en sistemas de fuerzas centrales donde el operador experimenta divergencias críticas cuando la distancia relativa tiende a cero[cite: 25, 26]. [cite_start]Incorpora un estabilizador numérico `ε = 10^-15` para blindar el algoritmo contra indeterminaciones de división por cero[cite: 27]:
  * Inversos simples y potencias: `1 / x_i`, `1 / x_i^2`, `1 / x_i^3`
  * Cocientes acoplados complejos: `x_i / x_j^2`, `x_i / x_j^3`

* [cite_start]**Sub-biblioteca Trigonométrica Espectral (Φ_trig):** Provee las funciones de base necesarias para el aislamiento de componentes angulares y oscilaciones armónicas periódicas[cite: 29, 30]:
  * Funciones base: `sin(x_i)`, `cos(x_i)`

El espacio espectral unificado se consolida bajo la estructura matricial:
`Φ(X) = [ Φ_poly || Φ_inv || [cite_start]Φ_trig ]` [cite: 33]

### 2. Filtrado Secuencial con Umbral Estricto (SINDy)
[cite_start]La estimación de los coeficientes globales mediante la resolución directa de la ecuación normal de mínimos cuadrados es numéricamente inestable[cite: 36]. [cite_start]La inclusión simultánea de potencias superiores, inversos y funciones trigonométricas genera una matriz de diseño con una multicolinealidad extrema, provocando que el determinante de la matriz tienda a cero y destruyendo la precisión de la inversión[cite: 37].

[cite_start]Para neutralizar esta patología, el motor ejecuta una poda quirúrgica iterativa regulada por un hiperparámetro de corte estricto `λ = 0.08`[cite: 38]. En cada iteración:
1. [cite_start]El optimizador evalúa los pesos actuales y restringe el dominio del problema exclusivamente al conjunto de índices de características activas, es decir, aquellas cuyo valor absoluto supera o iguala a `λ`[cite: 38, 39].
2. [cite_start]Se recalculan los mínimos cuadrados únicamente sobre las columnas supervivientes[cite: 39].

[cite_start]Al extinguir de forma iterativa las columnas que no aportan varianza explicativa real a la derivada temporal, la matriz se acondiciona instantáneamente, recuperando su rango completo y estabilizando los estimadores algebraicos[cite: 40].

### 3. Operador de Perfección Decimal Racional
[cite_start]Con el objetivo de erradicar los residuos numéricos espurios inducidos por la aritmética de punto flotante del hardware, los pesos continuos optimizados se someten a un mapeo diofantino formal a través de fracciones continuas limitadas[cite: 43].

[cite_start]Fijando el denominador máximo admisible de forma estricta a `d_max = 10`[cite: 45]. [cite_start]Este procedimiento purifica el coeficiente numérico (por ejemplo, transformando un peso ruidoso de `-0.99999997` a la fracción exacta `-1/1`), lo que remueve las aproximaciones decimales flotantes y garantiza la interpretabilidad teórica de la ley física descubierta[cite: 45, 61].

---

## Bitácora de Diseño Numérico Anti-Fallos

[cite_start]Durante el ciclo de desarrollo empírico del framework, se identificaron y neutralizaron dos fallos sistémicos en el procesamiento de datos, los cuales quedaron establecidos como principios mandatorios de diseño[cite: 47]:

1. [cite_start]**Preservación de Magnitudes Crudas (Abandono de MinMax):** La implementación inicial de escalados lineales tipo MinMax sobre la matriz de entrada alteraba las tasas de cambio locales de las variables de estado, rompiendo la homogeneidad dimensional de las leyes y fijando el error de la norma infinita en un intolerable `L_inf = 0.2104`[cite: 48]. [cite_start]Se determinó como principio fundamental que las variables deben conservar estrictamente sus magnitudes físicas crudas[cite: 49].
2. [cite_start]**Mitigación de Cancelación Catastrófica (Uso Mandatorio de float64):** El uso de tipados estándar `float32` limitaba la mantisa del procesador a 24 bits de almacenamiento físico (lo que se traduce en apenas 7 dígitos significativos)[cite: 50]. [cite_start]Al evaluar cocientes acoplados con denominadores cúbicos disminuidos, el truncamiento del bit marginal amplificaba el residuo asintóticamente[cite: 51]. [cite_start]La migración estructural hacia tensores homogéneos de doble precisión de **64 bits (float64)** extendió la capacidad de la mantisa a 53 bits, confinando el error al límite del redondeo de hardware e incrementando drásticamente la precisión general[cite: 52].

---

##Estructura del Proyecto

* `main.py`: Orquestador principal de la interfaz de terminal interactiva, carga de datos en alta precisión y ejecución del pipeline.
* `src/logger.py`: Módulo de registro analítico integrado con formatos visuales avanzados.
* `src/logic_loss.py`: Función de pérdida lógica e informada (RILLLoss) para guiar el aprendizaje de la red neuronal en espacios continuos.
* `src/pinn_factory.py`: Arquitectura de la Red Neuronal Informada por la Física construida nativamente en `float64`.
* `src/symbolic_engine.py`: Núcleo del motor simbólico (Construcción espectral Φ(X), filtrado SINDy con `λ = 0.08` y purificación por fracciones continuas).
* `src/distiller.py`: Extractor encargado de interrogar a la red neuronal mediante una evaluación masiva en el espacio latente y exportar las leyes purificadas a scripts de código independientes.

---

## Instrucciones de Uso y CLI en Terminal

### 1. Instalación de Dependencias
Asegúrate de instalar los requerimientos oficiales del sistema:
```bash
pip install -r requirements.txt

```

### 2. Carga de Datos

El framework busca datasets estructurados dentro de la carpeta `data/`. Cada archivo debe ser un `.csv` donde las primeras columnas correspondan a las variables dinámicas de estado independientes y la última columna sea la variable objetivo (o derivada temporal) que se desea modelar.

### 3. Ejecución Interactiva

Lanza el motor ejecutando en tu terminal:

```bash
python main.py

```

Al iniciar, se desplegará una interfaz avanzada en la interfaz de comandos con las siguientes características:

* **Selección Interactiva:** El sistema escaneará la carpeta `data/` y te presentará una tabla formateada con los datasets dinámicos disponibles para elegir mediante su índice.
* **Inyección Lógica:** Te preguntará interactivamente si deseas activar el operador de pérdida RILL.
* **Monitoreo en Tiempo Real:** Una barra de progreso animada te mostrará el avance detallado de la optimización de los gradientes continuos de la red neuronal y el estado de la pérdida (*Loss*).
* **Bloque de Resultados:** Tras finalizar la destilación simbólica, se imprimirá un panel detallado que muestra la ecuación matemática exacta descubierta, el error supremo (`L_inf`) alcanzado y las rutas donde se guardaron automáticamente el reporte formal en LaTeX (`.tex`) y el script ejecutable en Python (`formula.py`).

```