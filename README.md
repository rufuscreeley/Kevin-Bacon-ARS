# 🎬 Kevin-Bacon-ARS: Seis Grados de Separación

[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://kevin-bacon-ars.streamlit.app/)

Una aplicación web interactiva desarrollada en **Python** con **Streamlit** orientada a la exploración empírica del famoso fenómeno de los "Seis grados de Kevin Bacon". Este proyecto aplica metodologías formales de **Análisis de Redes Sociales (ARS)** y estadística para medir, analizar y visualizar las conexiones entre intérpretes a lo largo de la historia del cine.

La aplicación está desplegada y accesible en: [kevin-bacon-ars.streamlit.app](https://kevin-bacon-ars.streamlit.app/)

## 🎯 Enfoque del Proyecto

El desarrollo de esta herramienta tiene un carácter investigador, docente y divulgativo:
- **Cálculo de Distancias:** Identifica la ruta más corta (*shortest path*) entre cualquier actor/actriz y Kevin Bacon (o entre dos nodos cualesquiera de la red).
- **Métricas Reticulares:** Extrae indicadores estadísticos fundamentales del grafo, como la centralidad de grado, intermediación (*betweenness*) y cercanía (*closeness*).
- **Visualización Estructural:** Representa gráficamente los clústeres, nodos (intérpretes) y aristas (películas compartidas) que componen esta inmensa red social cinematográfica.

## ⚙️ Tecnologías y Librerías

- **Python 3.x:** Lenguaje base del proyecto.
- **Streamlit:** Framework para el diseño de la interfaz y el despliegue del frontend de datos.
- **NetworkX:** Librería fundamental para la creación, manipulación y cálculo estadístico sobre la estructura del grafo.
- **Pandas:** Utilizado para la limpieza, procesamiento y filtrado de las bases de datos de origen.

## 🚀 Instalación y Uso Local

Para ejecutar este proyecto y analizar los grafos en tu propia máquina, sigue estos pasos:

1. **Clonar el repositorio:**
   ```bash
   git clone [https://github.com/rufuscreeley/Kevin-Bacon-ARS.git](https://github.com/rufuscreeley/Kevin-Bacon-ARS.git)
   cd Kevin-Bacon-ARS
