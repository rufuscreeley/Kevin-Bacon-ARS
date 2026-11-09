const DATA_ROOT = new URL("./data/", self.location.href);

let actors = null;
let graph = null;
let movies = null;
let personNames = null;

async function fetchGzipJson(filename) {
  const response = await fetch(new URL(filename, DATA_ROOT));
  if (!response.ok) throw new Error(`No se pudo cargar ${filename} (${response.status}).`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Este navegador no permite descomprimir los datos. Prueba con una versión reciente.");
  }
  const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(decompressed).text());
}

async function loadActors() {
  if (!actors) actors = await fetchGzipJson("actors.json.gz");
  return actors;
}

async function loadGraph() {
  if (graph) return graph;
  self.postMessage({ type: "progress", message: "Descargando el grafo completo…" });
  const response = await fetch(new URL("graph.bin.gz", DATA_ROOT));
  if (!response.ok) throw new Error(`No se pudo cargar el grafo (${response.status}).`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Este navegador no permite descomprimir los datos. Prueba con una versión reciente.");
  }
  const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(decompressed).arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint8(0) !== 75 || view.getUint8(1) !== 66 ||
      view.getUint8(2) !== 80 || view.getUint8(3) !== 71) {
    throw new Error("El archivo del grafo no tiene un formato válido.");
  }
  const version = view.getUint32(4, true);
  const personCount = view.getUint32(8, true);
  const movieCount = view.getUint32(12, true);
  const nodeCount = view.getUint32(16, true);
  const edgeCount = view.getUint32(20, true);
  if (version !== 1 || nodeCount !== personCount + movieCount) {
    throw new Error("La versión del grafo no es compatible con esta página.");
  }
  const offsetsStart = 24;
  const neighborsStart = offsetsStart + (nodeCount + 1) * 4;
  const expectedLength = neighborsStart + edgeCount * 8;
  if (buffer.byteLength !== expectedLength) {
    throw new Error("El archivo del grafo está incompleto o dañado.");
  }
  graph = {
    personCount,
    movieCount,
    nodeCount,
    edgeCount,
    offsets: new Uint32Array(buffer, offsetsStart, nodeCount + 1),
    neighbors: new Uint32Array(buffer, neighborsStart, edgeCount * 2),
  };
  self.postMessage({ type: "progress", message: "Preparando los títulos y nombres…" });
  [movies, personNames] = await Promise.all([
    fetchGzipJson("movies.json.gz"),
    fetchGzipJson("person-names.json.gz"),
  ]);
  if (movies.length !== movieCount || personNames.length !== personCount) {
    graph = null;
    throw new Error("Los datos del grafo y su catálogo no coinciden.");
  }
  return graph;
}

function findSuggestions(value) {
  const query = value.trim().toLocaleLowerCase();
  if (!query) return { suggestions: [], selected: null };
  const matches = [];
  for (const actor of actors) {
    const name = actor[0];
    const lower = name.toLocaleLowerCase();
    const matchesQuery = query.length === 1 ? lower.startsWith(query) : lower.includes(query);
    if (!matchesQuery) continue;
    matches.push({ name, node: actor[1] });
    if (matches.length === 6) break;
  }
  const selected = matches.find((actor) => actor.name.toLocaleLowerCase() === query) || matches[0] || null;
  return { suggestions: matches, selected };
}

function neighborsOf(node) {
  const start = graph.offsets[node];
  const end = graph.offsets[node + 1];
  return graph.neighbors.subarray(start, end);
}

function describeNode(id, rootId) {
  if (id < graph.personCount) {
    const name = personNames[id];
    return { id, type: "person", name, label: name, title: name, root: id === rootId };
  }
  const movieIndex = id - graph.personCount;
  const [title, year] = movies[movieIndex];
  const label = year === null ? title : `${title} (${year})`;
  return { id, type: "movie", name: title, year, label, title };
}

function shortestPath(source, destination) {
  if (source < 0 || source >= graph.personCount || destination < 0 || destination >= graph.personCount) {
    throw new Error("No se pudo localizar uno de los actores seleccionados.");
  }
  if (source === destination) return [source];

  const parent = new Int32Array(graph.nodeCount);
  parent.fill(-1);
  const queue = new Uint32Array(graph.nodeCount);
  let head = 0;
  let tail = 0;
  parent[source] = source;
  queue[tail++] = source;
  while (head < tail && parent[destination] === -1) {
    const node = queue[head++];
    const neighbors = neighborsOf(node);
    for (let index = 0; index < neighbors.length; index += 1) {
      const neighbor = neighbors[index];
      if (parent[neighbor] !== -1) continue;
      parent[neighbor] = node;
      queue[tail++] = neighbor;
      if (neighbor === destination) break;
    }
  }
  if (parent[destination] === -1) return null;

  const path = [];
  for (let node = destination; node !== source; node = parent[node]) path.push(node);
  path.push(source);
  path.reverse();
  return path;
}

function queryPath(source, destination, originName, destinationName) {
  const path = shortestPath(source, destination);
  if (!path) return { kind: "path", connected: false, originName, destinationName };
  const nodes = path.map((id) => describeNode(id, null));
  const edges = path.slice(1).map((id, index) => [path[index], id]);
  const bridges = path.slice(1, -1)
    .filter((id) => id < graph.personCount)
    .map((id) => personNames[id]);
  return {
    kind: "path",
    connected: true,
    originName,
    destinationName,
    degrees: (path.length - 1) / 2,
    bridges,
    nodes,
    edges,
  };
}

function queryNetwork(source, actorName) {
  if (source < 0 || source >= graph.personCount) {
    throw new Error("No se pudo localizar el actor seleccionado.");
  }
  const movieIds = [];
  for (const neighbor of neighborsOf(source)) {
    if (neighbor >= graph.personCount) movieIds.push(neighbor);
  }
  const actorIds = new Set([source]);
  for (const movieId of movieIds) {
    for (const actorId of neighborsOf(movieId)) {
      if (actorId < graph.personCount) actorIds.add(actorId);
    }
  }
  const orderedActorIds = Array.from(actorIds);
  orderedActorIds.sort((left, right) => personNames[left].localeCompare(personNames[right], "es"));
  const orderedMovieIds = movieIds.slice().sort((left, right) => left - right);
  const nodeIds = [...orderedActorIds, ...orderedMovieIds];
  const nodes = nodeIds.map((id) => describeNode(id, source));
  const edges = [];
  const includedActors = new Set(orderedActorIds);
  for (const movieId of orderedMovieIds) {
    for (const actorId of neighborsOf(movieId)) {
      if (includedActors.has(actorId)) edges.push([actorId, movieId]);
    }
  }
  const actorNames = Array.from(new Set(
    orderedActorIds.map((id) => personNames[id])
  )).sort((left, right) => left.localeCompare(right, "es"));
  const directActorNames = Array.from(new Set(
    orderedActorIds.filter((id) => id !== source).map((id) => personNames[id])
  )).sort((left, right) => left.localeCompare(right, "es"));
  const movieTitles = new Set(orderedMovieIds.map((id) => movies[id - graph.personCount][0]));
  return {
    kind: "network",
    actorName,
    actorNames,
    directActorNames,
    actorCount: actorNames.length,
    directActorCount: directActorNames.length,
    movieCount: movieTitles.size,
    nodes,
    edges,
  };
}

async function handleMessage(message) {
  if (message.type === "search") {
    await loadActors();
    return { type: "search-result", id: message.id, ...findSuggestions(message.value) };
  }
  if (message.type === "query-path" || message.type === "query-network") {
    await loadGraph();
    const result = message.type === "query-path"
      ? queryPath(message.origin.node, message.destination.node, message.origin.name, message.destination.name)
      : queryNetwork(message.actor.node, message.actor.name);
    return { type: "query-result", id: message.id, ...result };
  }
  return null;
}

loadActors()
  .then(() => self.postMessage({ type: "ready" }))
  .catch((error) => self.postMessage({ type: "init-error", message: error.message }));

self.addEventListener("message", async (event) => {
  try {
    const result = await handleMessage(event.data);
    if (result) self.postMessage(result);
  } catch (error) {
    self.postMessage({
      type: "request-error",
      id: event.data.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
