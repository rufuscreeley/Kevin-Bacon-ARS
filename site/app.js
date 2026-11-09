(() => {
  const worker = new Worker("./app-worker.js");
  const pendingRequests = new Map();
  const fields = {
    origin: {
      input: document.getElementById("actor-origin"),
      suggestions: document.getElementById("suggestions-origin"),
    },
    destination: {
      input: document.getElementById("actor-destination"),
      suggestions: document.getElementById("suggestions-destination"),
    },
    network: {
      input: document.getElementById("actor-network"),
      suggestions: document.getElementById("suggestions-network"),
    },
  };
  const status = document.getElementById("status");
  const result = document.getElementById("result");
  let requestId = 0;
  let activeMode = "path";
  let isReady = false;
  let queryRunning = false;
  let searchTimer = null;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function askWorker(type, details = {}) {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      worker.postMessage({ type, id, ...details });
    });
  }

  function appendHighlightedName(container, name, query) {
    const lowerName = name.toLocaleLowerCase();
    const lowerQuery = query.trim().toLocaleLowerCase();
    const matchIndex = lowerQuery ? lowerName.indexOf(lowerQuery) : -1;
    if (matchIndex < 0) {
      container.textContent = name;
      return;
    }
    container.append(document.createTextNode(name.slice(0, matchIndex)));
    const strong = document.createElement("strong");
    strong.textContent = name.slice(matchIndex, matchIndex + lowerQuery.length);
    container.append(strong, document.createTextNode(name.slice(matchIndex + lowerQuery.length)));
  }

  function renderSuggestions(field, response, query) {
    const target = field.suggestions;
    target.replaceChildren();
    if (!query.trim()) {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = "Escribe al menos una letra para ver coincidencias.";
      target.append(hint);
      return;
    }
    if (!response.suggestions.length) {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = "No hay coincidencias para la búsqueda actual.";
      target.append(hint);
      return;
    }
    const heading = document.createElement("span");
    heading.className = "suggestion-heading";
    heading.textContent = "Coincidencias sugeridas";
    target.append(heading);
    const list = document.createElement("div");
    list.className = "suggestion-list";
    for (const actor of response.suggestions) {
      const button = document.createElement("button");
      button.className = "suggestion";
      button.type = "button";
      button.addEventListener("click", () => {
        field.input.value = actor.name;
        searchActors(field);
        field.input.focus();
      });
      appendHighlightedName(button, actor.name, query);
      list.append(button);
    }
    target.append(list);
  }

  async function searchActors(field) {
    const query = field.input.value;
    if (!isReady) return null;
    if (!query.trim()) {
      renderSuggestions(field, { suggestions: [] }, query);
      return { suggestions: [], selected: null };
    }
    try {
      const response = await askWorker("search", { value: query });
      if (field.input.value === query) renderSuggestions(field, response, query);
      return response;
    } catch (error) {
      setStatus(error.message, true);
      return null;
    }
  }

  function bindSearch(field) {
    field.input.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => searchActors(field), 120);
    });
    field.input.addEventListener("focus", () => {
      if (isReady && field.input.value.trim()) searchActors(field);
    });
  }

  function addMessage(text, isError = false) {
    const box = document.createElement("div");
    box.className = `result-message${isError ? " error" : ""}`;
    box.textContent = text;
    result.append(box);
  }

  function addGraph(graph, tall = false) {
    const heading = document.createElement("h3");
    heading.className = "graph-heading";
    heading.textContent = "Explora el grafo";
    result.append(heading);
    const caption = document.createElement("p");
    caption.className = "graph-caption";
    caption.textContent = graph.nodes.length > 90
      ? "Arrastra para mover la red; usa la rueda o los controles para acercar. Pasa el cursor por los nodos para ver sus nombres."
      : "Arrastra los nodos para reorganizar la red y usa la rueda o los controles para acercar.";
    result.append(caption);
    const container = document.createElement("div");
    container.className = `graph-container${tall ? " tall" : ""}`;
    result.append(container);
    const legend = document.createElement("div");
    legend.className = "graph-legend";
    legend.innerHTML = graph.kind === "path"
      ? '<span class="legend-item"><span class="legend-dot origin"></span>Actor de origen</span><span class="legend-item"><span class="legend-dot destination"></span>Actor de destino</span><span class="legend-item"><span class="legend-triangle"></span>Película</span>'
      : '<span class="legend-item"><span class="legend-dot"></span>Actor</span><span class="legend-item"><span class="legend-triangle"></span>Película</span>';
    result.append(legend);
    window.requestAnimationFrame(() => new window.NetworkView(container, graph));
  }

  function renderPath(response) {
    result.replaceChildren();
    result.classList.remove("hidden");
    if (!response.connected) {
      addMessage(
        `No existe conexión alguna entre ${response.originName} y ${response.destinationName} dentro del grafo actual.`,
        true,
      );
      return;
    }
    addMessage(
      `📊 Ficha Informativa: ${response.degrees} ${response.degrees === 1 ? "grado" : "grados"} de separación entre ${response.originName} y ${response.destinationName}`,
    );
    const bridges = document.createElement("p");
    bridges.className = "bridge-list";
    if (response.bridges.length) {
      const label = document.createElement("strong");
      label.textContent = "Nodos que hacen de puente/conexión: ";
      bridges.append(label, document.createTextNode(response.bridges.join(", ")));
    } else {
      const label = document.createElement("strong");
      label.textContent = "Conexión directa: ";
      bridges.append(label, document.createTextNode("Actuaron en la misma película."));
    }
    result.append(bridges);
    addGraph(response);
  }

  function renderNetwork(response) {
    result.replaceChildren();
    result.classList.remove("hidden");
    if (!response.directActorCount) {
      addMessage(`🌐 ${response.actorName} no tiene actores conectados a un grado de separación.`);
    } else {
      addMessage(
        `🌐 ${response.actorName} está conectado directamente con ${formatNumber(response.actorCount)} actores a través de ${formatNumber(response.movieCount)} película(s)`,
      );
      if (response.actorNames.length <= 60) {
        const actorList = document.createElement("p");
        actorList.className = "bridge-list";
        const label = document.createElement("strong");
        label.textContent = "Actores en primer grado: ";
        actorList.append(label, document.createTextNode(response.actorNames.join(", ")));
        result.append(actorList);
      } else {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = `Actores en primer grado (${formatNumber(response.actorNames.length)})`;
        const list = document.createElement("p");
        list.className = "bridge-list";
        list.textContent = response.actorNames.join(", ");
        details.append(summary, list);
        result.append(details);
      }
    }
    addGraph(response, true);
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("es-ES").format(value);
  }

  async function getSelectedActor(field) {
    const response = await searchActors(field);
    return response && response.selected;
  }

  function setQueryBusy(busy) {
    queryRunning = busy;
    document.querySelectorAll('.query-form button[type="submit"]').forEach((item) => {
      item.disabled = busy;
    });
    if (busy) {
      result.classList.add("hidden");
      setStatus("Buscando la conexión en la red… La primera consulta puede tardar unos segundos.");
    }
  }

  document.getElementById("path-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setQueryBusy(true);
    try {
      const [origin, destination] = await Promise.all([
        getSelectedActor(fields.origin),
        getSelectedActor(fields.destination),
      ]);
      if (!origin || !destination) {
        setStatus("Completa ambos campos con nombres válidos para visualizar la conexión entre actores.");
        return;
      }
      const response = await askWorker("query-path", { origin, destination });
      renderPath(response);
      setStatus("");
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setQueryBusy(false);
    }
  });

  document.getElementById("network-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    setQueryBusy(true);
    try {
      const actor = await getSelectedActor(fields.network);
      if (!actor) {
        setStatus("Escribe un nombre de actor válido para ver sus conexiones directas por películas.");
        return;
      }
      const response = await askWorker("query-network", { actor });
      renderNetwork(response);
      setStatus("");
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      setQueryBusy(false);
    }
  });

  document.querySelectorAll(".mode-option").forEach((option) => {
    option.addEventListener("click", () => {
      activeMode = option.dataset.mode;
      document.querySelectorAll(".mode-option").forEach((item) => {
        const selected = item === option;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-checked", String(selected));
      });
      document.getElementById("path-form").classList.toggle("hidden", activeMode !== "path");
      document.getElementById("network-form").classList.toggle("hidden", activeMode !== "network");
      result.classList.add("hidden");
      setStatus("");
      if (isReady) {
        searchActors(activeMode === "path" ? fields.origin : fields.network);
        if (activeMode === "path") searchActors(fields.destination);
      }
    });
  });

  document.getElementById("sidebar-toggle").addEventListener("click", (event) => {
    const sidebar = document.getElementById("sidebar");
    const open = sidebar.classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("pointerdown", (event) => {
    const sidebar = document.getElementById("sidebar");
    const toggle = document.getElementById("sidebar-toggle");
    if (sidebar.classList.contains("open") && !sidebar.contains(event.target) && !toggle.contains(event.target)) {
      sidebar.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  Object.values(fields).forEach(bindSearch);
  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "ready") {
      isReady = true;
      setStatus("Escribe al menos una letra para ver coincidencias.");
      Object.values(fields).forEach(searchActors);
      return;
    }
    if (message.type === "init-error") {
      setStatus(message.message, true);
      return;
    }
    if (message.type === "progress") {
      if (queryRunning) setStatus(message.message);
      return;
    }
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);
    if (message.type === "request-error") pending.reject(new Error(message.message));
    else pending.resolve(message);
  });

  fetch("./data/stats.json")
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudieron cargar las métricas (${response.status}).`);
      return response.json();
    })
    .then((stats) => {
      document.getElementById("metric-actors").textContent = formatNumber(stats.actors);
      document.getElementById("metric-movies").textContent = formatNumber(stats.movies);
      document.getElementById("metric-years").textContent = `${stats.year_min}–${stats.year_max}`;
      document.getElementById("metric-connections").textContent = formatNumber(stats.connections);
    })
    .catch((error) => setStatus(error.message, true));
})();
