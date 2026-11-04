import streamlit as st
import pandas as pd
import networkx as nx
from pyvis.network import Network
import streamlit.components.v1 as components

st.set_page_config(page_title="Seis Grados de Kevin Bacon", layout="wide")
st.title("🎬 Kevin Bacon Project")
st.write("Todos los caminos llevan a Kevin Bacon: explorando la regla de los seis grados de separación en el cine.")

st.sidebar.title("ℹ️ Sobre el proyecto")
st.sidebar.markdown(
    """
    Este proyecto ha sido desarrollado por [Rafael Carrasco](https://scholar.google.es/citations?user=VxjO4dMAAAAJ&hl=es), profesor de Periodismo de la Universidad Complutense de Madrid.

    Explora cómo están conectados los actores a través de las películas en las que han coincidido.

    La idea es visualizar redes de colaboración cinematográfica y responder preguntas del tipo:
    - ¿Qué tan cerca están dos actores?
    - ¿Qué películas unen a dos personas?
    - ¿Cómo se relaciona un actor con el resto del universo de cine?
    """
)

with st.sidebar.expander("🧰 Tecnologías, herramientas y recursos", expanded=False):
    st.markdown(
        """
        - [Python](https://www.python.org/): lenguaje principal del proyecto.
        - [Streamlit](https://streamlit.io/): framework para crear la interfaz web interactiva.
        - [Pandas](https://pandas.pydata.org/): manipulación y análisis de datos tabulares.
        - [NetworkX](https://networkx.org/): librería para modelar y recorrer grafos.
        - [PyVis](https://pyvis.readthedocs.io/): visualización interactiva de redes y grafos.
        - [Movies CSV](https://drive.google.com/file/d/1ACd7kKcMPBSIDwdDcT5pTY7k2HmbALjG/view?usp=sharing): archivo con información de películas.
        - [People CSV](https://drive.google.com/file/d/1FVlEcggtRw1IOKB_mLiLIIf-h2bSBwsH/view?usp=sharing): archivo con información de personas y actores.
        - [Stars CSV](https://drive.google.com/file/d/10mp7ybqTJyIt6XPrGUG_L1ABamcwQJ_z/view?usp=sharing): archivo con relaciones entre actores y películas.
        - [requirements.txt](requirements.txt): dependencias del proyecto.
        """
    )

with st.expander("¿Qué hace esta aplicación?", expanded=True):
    st.markdown(
        """
        Esta web construye un grafo de actores y películas. Cada actor está conectado a las películas en las que aparece,
        y cada película conecta a todos los actores que participan en ella.

        A partir de ese grafo, la aplicación puede:
        - calcular el camino más corto entre dos actores,
        - contar cuántos pasos los separan,
        - mostrar la red directa de un actor en una sola película de distancia.
        """
    )

with st.expander("¿Cómo se usa?", expanded=False):
    st.markdown(
        """
        1. Elige el modo de consulta: conectar dos actores o explorar la red de un actor.
        2. Escribe parte del nombre del actor para ver sugerencias automáticas.
        3. Selecciona un resultado y pulsa el botón de búsqueda.
        4. Explora el grafo y haz zoom para ver más detalle.
        """
    )

with st.expander("¿Qué tipos de consultas ofrece?", expanded=False):
    st.markdown(
        """
        - Conectar dos actores: muestra si están relacionados y cuántos pasos los separan.
        - Red de un actor: muestra los actores que están a un solo grado de separación a través de una película.
        """
    )

# Función para cargar datos de manera eficiente usando URLs públicas de Google Drive
@st.cache_resource
def cargar_grafo():
    # IDs de tus archivos en Google Drive (reemplaza estos IDs por los de tus archivos reales)
    id_movies = "1ACd7kKcMPBSIDwdDcT5pTY7k2HmbALjG"
    id_people = "1FVlEcggtRw1IOKB_mLiLIIf-h2bSBwsH"
    id_stars = "10mp7ybqTJyIt6XPrGUG_L1ABamcwQJ_z"

    # Construcción de las URLs de descarga directa (evitando el aviso de archivos grandes)
    url_movies = f"https://docs.google.com/uc?export=download&confirm=t&id={id_movies}"
    url_people = f"https://docs.google.com/uc?export=download&confirm=t&id={id_people}"
    url_stars = f"https://docs.google.com/uc?export=download&confirm=t&id={id_stars}"

    with st.spinner("Descargando archivos de datos desde Google Drive público..."):
        df_movies = pd.read_csv(url_movies)
        df_people = pd.read_csv(url_people)
        df_stars = pd.read_csv(url_stars)

    with st.spinner("Construyendo la estructura del grafo principal..."):
        G = nx.Graph()
        dict_people = dict(zip(df_people['id'], df_people['name']))
        dict_movies = dict(zip(df_movies['id'], zip(df_movies['title'], df_movies['year'])))

        for pid, name in dict_people.items():
            G.add_node(f"p_{pid}", type='person', name=name)
        for mid, (title, year) in dict_movies.items():
            G.add_node(f"m_{mid}", type='movie', title=title, year=year)

    with st.spinner("Estableciendo conexiones entre actores y películas..."):
        edges = [(f"p_{row['Source']}", f"m_{row['Target']}") for _, row in df_stars.iterrows()]
        G.add_edges_from(edges)

    return G, set(dict_people.values())

try:
    G, set_actores = cargar_grafo()
except Exception as e:
    st.error(f"Error al cargar los datos de Google Drive: {e}")
    st.stop()

# Búsqueda rápida y pulida con autocompletado en tiempo real.
NOMBRES_ACTORES = sorted(set_actores)
NOMBRES_ACTORES_LOWER = [nombre.lower() for nombre in NOMBRES_ACTORES]


def sugerencias_actor(texto, nombres, nombres_lower, max_sugerencias=6):
    texto = (texto or "").strip()
    if not texto:
        return []
    consulta = texto.lower()

    if len(consulta) == 1:
        return [nombre for nombre, nombre_lower in zip(nombres, nombres_lower) if nombre_lower.startswith(consulta)][:max_sugerencias]

    return [nombre for nombre, nombre_lower in zip(nombres, nombres_lower) if consulta in nombre_lower][:max_sugerencias]


def normalizar_actor(texto, nombres, nombres_lower):
    if not texto:
        return None
    nombre = texto.strip()
    coincidencias = sugerencias_actor(nombre, nombres, nombres_lower)
    if not coincidencias:
        return None
    exact_match = next((item for item in coincidencias if item.lower() == nombre.lower()), None)
    return exact_match or coincidencias[0]


def resaltar_coincidencia(nombre, consulta):
    if not consulta:
        return nombre
    consulta_lower = consulta.lower()
    idx = nombre.lower().find(consulta_lower)
    if idx == -1:
        return nombre
    return f"{nombre[:idx]}**{nombre[idx:idx + len(consulta)]}**{nombre[idx + len(consulta):]}"


if "actor_origen" not in st.session_state:
    st.session_state.actor_origen = "Tom Cruise"
if "actor_destino" not in st.session_state:
    st.session_state.actor_destino = "Kevin Bacon"



def render_autocompletado(label, key_name, valor_inicial):
    valor = st.text_input(label, value=valor_inicial, placeholder="Escribe el nombre del actor")
    st.session_state[key_name] = valor

    if not valor.strip():
        st.caption("Escribe al menos una letra para ver coincidencias.")
        return None

    coincidencias = sugerencias_actor(valor, NOMBRES_ACTORES, NOMBRES_ACTORES_LOWER)

    if coincidencias:
        st.caption("Coincidencias sugeridas")
        for idx, actor in enumerate(coincidencias):
            if st.button(
                resaltar_coincidencia(actor, valor),
                key=f"{key_name}_{idx}",
                use_container_width=True,
            ):
                st.session_state[key_name] = actor
                st.rerun()
    else:
        st.caption("No hay coincidencias para la búsqueda actual.")

    return normalizar_actor(valor, NOMBRES_ACTORES, NOMBRES_ACTORES_LOWER)


modo_busqueda = st.radio(
    "Elige el tipo de consulta",
    ["🔗 Conectar dos actores", "🌐 Ver red de un actor"],
    horizontal=True,
    index=0,
)

if modo_busqueda == "🔗 Conectar dos actores":
    col1, col2 = st.columns(2)
    with col1:
        actor_origen = render_autocompletado("1. Actor de origen", "actor_origen", st.session_state.actor_origen)
    with col2:
        actor_destino = render_autocompletado("2. Actor de destino", "actor_destino", st.session_state.actor_destino)

    if actor_origen and actor_destino:
        if st.button("🔍 Conectar Actores", type="primary"):
            origen_nodes = [n for n, attr in G.nodes(data=True) if attr.get('type') == 'person' and attr.get('name') == actor_origen]
            destino_nodes = [n for n, attr in G.nodes(data=True) if attr.get('type') == 'person' and attr.get('name') == actor_destino]

            if not origen_nodes or not destino_nodes:
                st.warning("No se pudo localizar uno de los actores seleccionados.")
            else:
                id_origen = origen_nodes[0]
                id_destino = destino_nodes[0]

                try:
                    camino = nx.shortest_path(G, source=id_origen, target=id_destino)
                    grados = (len(camino) - 1) // 2

                    st.info(f"### 📊 Ficha Informativa: {grados} grados de separación entre {actor_origen} y {actor_destino}")

                    puentes = [G.nodes[n]['name'] for n in camino if G.nodes[n]['type'] == 'person'][1:-1]
                    if puentes:
                        st.write(f"**Nodos que hacen de puente/conexión:** {', '.join(puentes)}")
                    else:
                        st.write("**Conexión directa:** Actuaron en la misma película.")

                    sub_G = G.subgraph(camino)

                    net = Network(height="350px", width="100%", bgcolor="#f8f9fa", font_color="black", notebook=False)
                    net.force_atlas_2based(overlap=1)
                    net.set_options("""
                    {
                      "physics": {
                        "enabled": true,
                        "solver": "forceAtlas2Based",
                        "forceAtlas2Based": {
                          "gravitationalConstant": -50,
                          "centralGravity": 0.01,
                          "springConstant": 0.08,
                          "springLength": 120,
                          "damping": 0.4,
                          "avoidOverlap": 1
                        },
                        "minVelocity": 0.75,
                        "maxVelocity": 50
                      },
                      "interaction": {
                        "hover": true,
                        "zoomView": true,
                        "dragView": true,
                        "multiselect": true,
                        "navigationButtons": true
                      }
                    }
                    """)

                    for node in sub_G.nodes():
                        attrs = G.nodes[node]
                        if attrs['type'] == 'person':
                            net.add_node(node, label=attrs['name'], title=attrs['name'], size=20, color="#007bff", shape="dot")
                        else:
                            net.add_node(node, label=f"{attrs['title']} ({int(attrs['year'])})", title=attrs['title'], size=15, color="#ffc107", shape="triangle")

                    for u, v in sub_G.edges():
                        net.add_edge(u, v, color="#cccccc")

                    net.save_graph("path_graph.html")
                    with open("path_graph.html", 'r', encoding='utf-8') as HtmlFile:
                        source_code = HtmlFile.read()
                    components.html(source_code, height=380)

                except nx.NetworkXNoPath:
                    st.error(f"No existe conexión alguna entre {actor_origen} y {actor_destino} dentro del grafo actual.")
    else:
        st.info("Completa ambos campos con nombres válidos para visualizar la conexión entre actores.")
else:
    actor_origen = render_autocompletado("Actor a explorar", "actor_origen", st.session_state.actor_origen)

    if actor_origen:
        origen_nodes = [n for n, attr in G.nodes(data=True) if attr.get('type') == 'person' and attr.get('name') == actor_origen]
        if not origen_nodes:
            st.warning("No se pudo localizar el actor seleccionado.")
        else:
            id_origen = origen_nodes[0]
            peliculas_conexas = [n for n in G.neighbors(id_origen) if G.nodes[n].get('type') == 'movie']
            actores_vecinos = []

            for movie_node in peliculas_conexas:
                for neighbor in G.neighbors(movie_node):
                    if G.nodes[neighbor].get('type') == 'person' and neighbor != id_origen:
                        actores_vecinos.append(neighbor)

            actores_vecinos = sorted(set(actores_vecinos), key=lambda node: G.nodes[node]['name'])
            nodos_red = {id_origen} | set(peliculas_conexas) | set(actores_vecinos)
            sub_G = G.subgraph(nodos_red)

            actores_red = sorted({G.nodes[n]['name'] for n in sub_G.nodes() if G.nodes[n].get('type') == 'person'})
            total_actores = len(actores_red)
            total_peliculas = len({G.nodes[n]['title'] for n in sub_G.nodes() if G.nodes[n].get('type') == 'movie'})

            if total_actores == 0:
                st.info(f"### 🌐 {actor_origen} no tiene actores conectados a un grado de separación.")
            else:
                st.info(f"### 🌐 {actor_origen} está conectado directamente con {total_actores} actores a través de {total_peliculas} película(s)")
                st.write(f"Actores en primer grado: {', '.join(actores_red)}")

                net = Network(height="450px", width="100%", bgcolor="#f8f9fa", font_color="black", notebook=False)
                net.force_atlas_2based(overlap=1)
                net.set_options("""
                {
                  "physics": {
                    "enabled": true,
                    "solver": "forceAtlas2Based",
                    "forceAtlas2Based": {
                      "gravitationalConstant": -50,
                      "centralGravity": 0.01,
                      "springConstant": 0.08,
                      "springLength": 120,
                      "damping": 0.4,
                      "avoidOverlap": 1
                    },
                    "minVelocity": 0.75,
                    "maxVelocity": 50
                  },
                  "interaction": {
                    "hover": true,
                    "zoomView": true,
                    "dragView": true,
                    "multiselect": true,
                    "navigationButtons": true
                  }
                }
                """)

                for node in sub_G.nodes():
                    attrs = G.nodes[node]
                    if attrs['type'] == 'person':
                        color = "#28a745" if node == id_origen else "#007bff"
                        net.add_node(node, label=attrs['name'], title=attrs['name'], size=20, color=color, shape="dot")
                    else:
                        net.add_node(node, label=f"{attrs['title']} ({int(attrs['year'])})", title=attrs['title'], size=15, color="#ffc107", shape="triangle")

                for u, v in sub_G.edges():
                    net.add_edge(u, v, color="#cccccc")

                net.save_graph("actor_network.html")
                with open("actor_network.html", 'r', encoding='utf-8') as HtmlFile:
                    source_code = HtmlFile.read()
                components.html(source_code, height=450)
    else:
        st.info("Escribe un nombre de actor para ver sus conexiones directas por películas.")
