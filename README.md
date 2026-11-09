# 🎬 Kevin-Bacon-ARS: Seis grados de separación

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-aplicaci%C3%B3n%20interactiva-222?logo=github)](https://rufuscreeley.github.io/Kevin-Bacon-ARS/)
[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://kevin-bacon-ars.streamlit.app/)

Explora las conexiones entre actores a través de las películas en las que han coincidido. La aplicación conserva la experiencia central de la versión Streamlit y se publica como sitio estático: GitHub Pages no ejecuta Python, por lo que las consultas del grafo se calculan en el navegador.

- **Aplicación en GitHub Pages:** [rufuscreeley.github.io/Kevin-Bacon-ARS](https://rufuscreeley.github.io/Kevin-Bacon-ARS/)
- **Aplicación Streamlit original:** [kevin-bacon-ars.streamlit.app](https://kevin-bacon-ars.streamlit.app/)

## Funciones

- Consulta el camino más corto entre dos actores, los grados de separación y los actores que sirven de puente.
- Explora la red de primer grado de un actor: sus películas y los actores con los que trabajó.
- Busca actores con sugerencias automáticas.
- Consulta las métricas generales de actores con créditos, películas, años de estreno y conexiones actor-película.
- Acerca, aleja y desplaza las visualizaciones; pasa el cursor por los nodos para ver sus nombres.

Las métricas de centralidad de grado, intermediación y cercanía descritas en versiones anteriores del README no las calcula la aplicación actual y no se presentan como funciones disponibles.

## Datos y publicación

El dataset original de los CSV es [IMDb Co-star Network en Kaggle](https://www.kaggle.com/datasets/parthparmar06/imdb-co-star-network). El workflow de GitHub Pages descarga los tres archivos públicos (`movies.csv`, `people.csv` y `stars.csv`) desde Google Drive, las mismas copias que usa la aplicación Streamlit, y prepara una versión compacta del grafo. No se necesita ningún secreto ni credencial. Los CSV de películas y créditos versionados en este repositorio se verificaron como copias idénticas a los archivos públicos actuales.

Los archivos de origen actuales pesan en conjunto **59.107.049 bytes (aprox. 56,4 MiB)**: `movies.csv` (11.824.642 bytes), `stars.csv` (19.007.031 bytes) y `people.csv` (28.275.376 bytes). En la preparación verificada, los datos comprimidos ocupan **28.828.032 bytes (aprox. 27,5 MiB)** y el artefacto completo del sitio **28.881.047 bytes**; queda muy por debajo del límite publicado de **1 GB** para un sitio de GitHub Pages ([límites de GitHub Pages](https://docs.github.com/pages/getting-started-with-github-pages/github-pages-limits)). El workflow se ejecuta al actualizar los datos o el código en `main`, y también se puede iniciar manualmente desde **Actions → Publicar web en GitHub Pages → Run workflow**.

Para activar la publicación en el repositorio, selecciona **Settings → Pages → Build and deployment → Source: GitHub Actions**. Tras una publicación correcta, la web estará disponible en `https://rufuscreeley.github.io/Kevin-Bacon-ARS/`.

### Compilar y probar localmente

Requiere Python 3.10 o posterior; el preparador de datos usa solo la biblioteca estándar.

```bash
python -m unittest discover -s tests
python scripts/build_site.py --download-data --output _site
node tests/worker-smoke.cjs _site
python -m http.server 8000 --directory _site
```

Abre `http://localhost:8000`. La compilación descarga los tres CSV públicos de Google Drive. La prueba de integración requiere Node.js 22 o posterior; también verifica con los datos reales que Tom Cruise y Kevin Bacon están separados por un grado y que se puede construir la red de Kevin Bacon. Para compilar con copias locales:

```bash
python scripts/build_site.py --people-csv people.csv --movies-csv movies.csv --stars-csv stars.csv --output _site
```

## Alcance y limitaciones

- Al ser un sitio estático, el camino mínimo y la red de un actor se calculan en el navegador. La primera consulta descarga el grafo comprimido completo y los catálogos; requiere un navegador moderno con `DecompressionStream` y suficiente memoria para procesar los datos.
- Los tres CSV se descargan en cada publicación; una interrupción, cambio de permisos o cambio de formato en Google Drive puede impedir el despliegue.
- En las copias verificadas para esta migración, 899 filas de `stars.csv` referencian identificadores de actor ausentes en `people.csv` y se excluyen del grafo para no generar nodos sin nombre; también se deduplican 70 relaciones repetidas, igual que hace `NetworkX.Graph`.
- El recuento y la lista de actores de la red de primer grado incluyen al actor consultado, igual que en la aplicación Streamlit.
- Las visualizaciones conservan el arrastre, el desplazamiento, el zoom y los nombres emergentes de PyVis, pero no replican su simulación física ForceAtlas2: usan una disposición force-directed simplificada para redes pequeñas y una disposición radial determinista para las grandes. Para redes grandes se ocultan las etiquetas permanentes y los nombres aparecen al pasar el cursor, evitando que el gráfico se vuelva ilegible o lento.
- La web estática no ejecuta las librerías Python de la aplicación original. Solo expone las consultas implementadas (camino mínimo y red de primer grado); no calcula métricas globales de centralidad ni análisis adicionales.

## Tecnologías y procedencia

- **Aplicación estática:** HTML, CSS y JavaScript; GitHub Pages y GitHub Actions.
- **Preparación de datos:** Python 3 y biblioteca estándar.
- **Aplicación original:** Python, Streamlit, Pandas, NetworkX y PyVis.
- **Dataset:** [IMDb Co-star Network. The Kevin Bacon Game: Finding Six Degrees of Separation in Movie Data](https://www.kaggle.com/datasets/parthparmar06/imdb-co-star-network).

Este proyecto está bajo una [Licencia Creative Commons Atribución-CompartirIgual 4.0 Internacional](https://creativecommons.org/licenses/by-sa/4.0/).
