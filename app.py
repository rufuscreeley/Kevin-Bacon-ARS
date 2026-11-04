import streamlit as st
import pandas as pd
import networkx as nx
from pyvis.network import Network
import streamlit.components.v1 as components

st.set_page_config(page_title="Seis Grados de Kevin Bacon", layout="wide")
st.title("🎬 Red de Actores: Los Seis Grados de Separación")
st.write("Escribe parte del nombre de los actores para buscar sus conexiones de forma ultrarrápida.")

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

# Buscador inteligente y liviano para evitar saturar el navegador
col1, col2 = st.columns(2)

with col1:
    buscar_origen = st.text_input("1. Buscar Actor Origen (ej: Tom Cruise)", value="Tom Cruise")
    coincidencias_origen = [actor for actor in set_actores if buscar_origen.lower() in actor.lower()][:15]
    if coincidencias_origen:
        actor_origen = st.selectbox("Selecciona coincidencia exacta (Origen):", coincidencias_origen)
    else:
        st.warning("No se encontraron coincidencias para el origen.")
        actor_origen = None

with col2:
    buscar_destino = st.text_input("2. Buscar Actor Destino (ej: Kevin Bacon)", value="Kevin Bacon")
    coincidencias_destino = [actor for actor in set_actores if buscar_destino.lower() in actor.lower()][:15]
    if coincidencias_destino:
        actor_destino = st.selectbox("Selecciona coincidencia exacta (Destino):", coincidencias_destino)
    else:
        st.warning("No se encontraron coincidencias para el destino.")
        actor_destino = None

if actor_origen and actor_destino:
    if st.button("🔍 Conectar Actores"):
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

                # Configuración ultra liviana de Pyvis sin físicas para asegurar rendimiento
                net = Network(height="350px", width="100%", bgcolor="#f8f9fa", font_color="black", notebook=False)
                net.toggle_physics(False)

                for node in sub_G.nodes():
                    attrs = G.nodes[node]
                    if attrs['type'] == 'person':
                        net.add_node(node, label=attrs['name'], title=attrs['name'], size=20, color="#007bff", shape="dot")
                    else:
                        net.add_node(node, label=f"{attrs['title']} ({int(attrs['year'])}", title=attrs['title'], size=15, color="#ffc107", shape="triangle")

                for u, v in sub_G.edges():
                    net.add_edge(u, v, color="#cccccc")

                net.save_graph("path_graph.html")
                HtmlFile = open("path_graph.html", 'r', encoding='utf-8')
                source_code = HtmlFile.read()
                components.html(source_code, height=380)

            except nx.NetworkXNoPath:
                st.error(f"No existe conexión alguna entre {actor_origen} y {actor_destino} dentro del grafo actual.")
else:
    st.info("Por favor, selecciona coincidencias válidas de los desplegables filtrados para habilitar la búsqueda.")
