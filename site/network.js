(() => {
  class NetworkView {
    constructor(container, graph) {
      this.container = container;
      this.graph = graph;
      this.canvas = document.createElement("canvas");
      this.context = this.canvas.getContext("2d");
      this.tooltip = document.createElement("div");
      this.tooltip.className = "graph-tooltip";
      this.tooltip.setAttribute("role", "tooltip");
      this.tooltip.hidden = true;
      this.container.replaceChildren(this.canvas, this.tooltip);
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.dragging = null;
      this.hovered = null;
      this.positions = new Map();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
      this.addControls();
      this.bindEvents();
      this.resize();
    }

    addControls() {
      const controls = document.createElement("div");
      controls.className = "graph-controls";
      const actions = [
        ["+", "Acercar", () => this.zoom(1.2)],
        ["−", "Alejar", () => this.zoom(1 / 1.2)],
        ["⌂", "Restablecer vista", () => this.resetView()],
      ];
      for (const [label, title, action] of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("click", action);
        controls.append(button);
      }
      this.container.append(controls);
    }

    bindEvents() {
      this.canvas.addEventListener("pointerdown", (event) => {
        const point = this.pointerPoint(event);
        const node = this.nodeAt(point.x, point.y);
        this.dragging = node
          ? { node: node.id, pointerId: event.pointerId }
          : { pan: true, x: point.x, y: point.y, pointerId: event.pointerId };
        this.canvas.setPointerCapture(event.pointerId);
      });
      this.canvas.addEventListener("pointermove", (event) => {
        const point = this.pointerPoint(event);
        if (this.dragging && this.dragging.pointerId === event.pointerId) {
          if (this.dragging.pan) {
            this.offsetX += point.x - this.dragging.x;
            this.offsetY += point.y - this.dragging.y;
            this.dragging.x = point.x;
            this.dragging.y = point.y;
          } else {
            const position = this.positions.get(this.dragging.node);
            if (position) {
              const world = this.toWorld(point.x, point.y);
              position.x = world.x;
              position.y = world.y;
            }
          }
          this.draw();
          return;
        }
        const node = this.nodeAt(point.x, point.y);
        this.hovered = node ? node.id : null;
        this.canvas.style.cursor = node ? "grab" : "move";
        if (node) {
          this.showTooltip(node, event.offsetX, event.offsetY);
        } else {
          this.tooltip.hidden = true;
        }
        this.draw();
      });
      const stopDragging = (event) => {
        if (this.dragging && this.dragging.pointerId === event.pointerId) {
          this.dragging = null;
          this.canvas.style.cursor = this.hovered === null ? "move" : "grab";
        }
      };
      this.canvas.addEventListener("pointerup", stopDragging);
      this.canvas.addEventListener("pointercancel", stopDragging);
      this.canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        const point = this.pointerPoint(event);
        const before = this.toWorld(point.x, point.y);
        this.scale = this.clampScale(this.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
        this.offsetX = point.x - before.x * this.scale;
        this.offsetY = point.y - before.y * this.scale;
        this.draw();
      }, { passive: false });
      this.canvas.addEventListener("pointerleave", () => {
        if (!this.dragging) {
          this.hovered = null;
          this.tooltip.hidden = true;
          this.draw();
        }
      });
    }

    pointerPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    toWorld(x, y) {
      return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
    }

    clampScale(value) {
      return Math.max(0.25, Math.min(4, value));
    }

    zoom(factor) {
      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const before = this.toWorld(centerX, centerY);
      this.scale = this.clampScale(this.scale * factor);
      this.offsetX = centerX - before.x * this.scale;
      this.offsetY = centerY - before.y * this.scale;
      this.draw();
    }

    resetView() {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.layout();
      this.draw();
    }

    resize() {
      const rect = this.container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const changed = this.width !== rect.width || this.height !== rect.height;
      this.width = rect.width;
      this.height = rect.height;
      const ratio = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(this.width * ratio);
      this.canvas.height = Math.round(this.height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!this.positions.size || changed) {
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.layout();
      }
      this.draw();
    }

    layout() {
      this.positions.clear();
      const nodes = this.graph.nodes;
      const width = this.width || 700;
      const height = this.height || 380;
      const centerX = width / 2;
      const centerY = height / 2;
      const root = nodes.find((node) => node.root);
      if (this.graph.kind === "path") {
        const radiusX = width * 0.39;
        const radiusY = height * 0.35;
        const arcCenterY = height * 0.65;
        nodes.forEach((node, index) => {
          const progress = nodes.length === 1 ? 0.5 : index / (nodes.length - 1);
          const angle = Math.PI + Math.PI * progress;
          this.positions.set(node.id, nodes.length === 1 ? { x: centerX, y: centerY } : {
            x: centerX + Math.cos(angle) * radiusX,
            y: arcCenterY + Math.sin(angle) * radiusY,
          });
        });
        return;
      }

      const movies = nodes.filter((node) => node.type === "movie");
      const actors = nodes.filter((node) => node.type === "person" && !node.root);
      if (root) this.positions.set(root.id, { x: centerX, y: centerY });
      const innerRadius = Math.min(width, height) * 0.26;
      movies.forEach((node, index) => {
        const angle = (2 * Math.PI * index) / Math.max(1, movies.length) - Math.PI / 2;
        this.positions.set(node.id, {
          x: centerX + Math.cos(angle) * innerRadius,
          y: centerY + Math.sin(angle) * innerRadius,
        });
      });
      const outerRadius = Math.min(width, height) * 0.44;
      actors.forEach((node, index) => {
        const angle = (2 * Math.PI * index) / Math.max(1, actors.length) - Math.PI / 2;
        this.positions.set(node.id, {
          x: centerX + Math.cos(angle) * outerRadius,
          y: centerY + Math.sin(angle) * outerRadius,
        });
      });
      this.applyPhysics();
    }

    applyPhysics() {
      const nodes = this.graph.nodes;
      const count = nodes.length;
      if (count < 2 || count > 120) return;
      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const idealDistance = Math.sqrt((this.width * this.height) / count) * 0.42;
      const indexById = new Map(nodes.map((node, index) => [node.id, index]));
      const displacementX = new Float32Array(count);
      const displacementY = new Float32Array(count);
      for (let iteration = 0; iteration < 55; iteration += 1) {
        displacementX.fill(0);
        displacementY.fill(0);
        for (let left = 0; left < count; left += 1) {
          const leftPosition = this.positions.get(nodes[left].id);
          for (let right = left + 1; right < count; right += 1) {
            const rightPosition = this.positions.get(nodes[right].id);
            let dx = leftPosition.x - rightPosition.x;
            let dy = leftPosition.y - rightPosition.y;
            let distance = Math.hypot(dx, dy);
            if (distance < 0.01) {
              dx = (left + 1) * 0.013;
              dy = (right + 1) * 0.017;
              distance = Math.hypot(dx, dy);
            }
            const force = (idealDistance * idealDistance) / distance;
            const xForce = (dx / distance) * force;
            const yForce = (dy / distance) * force;
            displacementX[left] += xForce;
            displacementY[left] += yForce;
            displacementX[right] -= xForce;
            displacementY[right] -= yForce;
          }
        }
        for (const [from, to] of this.graph.edges) {
          const left = indexById.get(from);
          const right = indexById.get(to);
          if (left === undefined || right === undefined) continue;
          const leftPosition = this.positions.get(from);
          const rightPosition = this.positions.get(to);
          const dx = leftPosition.x - rightPosition.x;
          const dy = leftPosition.y - rightPosition.y;
          const distance = Math.max(0.01, Math.hypot(dx, dy));
          const force = (distance * distance) / idealDistance;
          const xForce = (dx / distance) * force;
          const yForce = (dy / distance) * force;
          displacementX[left] -= xForce;
          displacementY[left] -= yForce;
          displacementX[right] += xForce;
          displacementY[right] += yForce;
        }
        const temperature = 11 * (1 - iteration / 55) + 0.2;
        for (let index = 0; index < count; index += 1) {
          const node = nodes[index];
          const position = this.positions.get(node.id);
          displacementX[index] += (centerX - position.x) * 0.015;
          displacementY[index] += (centerY - position.y) * 0.015;
          const distance = Math.hypot(displacementX[index], displacementY[index]);
          if (!distance) continue;
          const step = Math.min(distance, temperature);
          position.x += (displacementX[index] / distance) * step;
          position.y += (displacementY[index] / distance) * step;
          position.x = Math.max(18, Math.min(this.width - 18, position.x));
          position.y = Math.max(18, Math.min(this.height - 18, position.y));
        }
      }
    }

    nodeAt(x, y) {
      const world = this.toWorld(x, y);
      for (let index = this.graph.nodes.length - 1; index >= 0; index -= 1) {
        const node = this.graph.nodes[index];
        const position = this.positions.get(node.id);
        if (!position) continue;
        const radius = node.type === "movie" ? 11 : 10;
        if (Math.hypot(world.x - position.x, world.y - position.y) <= radius + 3) {
          return node;
        }
      }
      return null;
    }

    showTooltip(node, x, y) {
      this.tooltip.textContent = node.title || node.label;
      this.tooltip.hidden = false;
      const left = Math.min(x + 12, this.width - 210);
      const top = Math.min(y + 12, this.height - 44);
      this.tooltip.style.left = `${Math.max(4, left)}px`;
      this.tooltip.style.top = `${Math.max(4, top)}px`;
    }

    draw() {
      if (!this.context || !this.width || !this.height) return;
      const context = this.context;
      const ratio = window.devicePixelRatio || 1;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, this.width, this.height);
      context.save();
      context.translate(this.offsetX, this.offsetY);
      context.scale(this.scale, this.scale);
      context.lineWidth = 1;
      context.strokeStyle = "#cccccc";
      for (const [from, to] of this.graph.edges) {
        const start = this.positions.get(from);
        const end = this.positions.get(to);
        if (!start || !end) continue;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }

      const showLabels = this.graph.nodes.length <= 90;
      for (const node of this.graph.nodes) {
        const position = this.positions.get(node.id);
        if (!position) continue;
        const selected = this.hovered === node.id;
        context.beginPath();
        if (node.type === "movie") {
          context.moveTo(position.x, position.y - 9);
          context.lineTo(position.x + 8, position.y + 7);
          context.lineTo(position.x - 8, position.y + 7);
          context.closePath();
          context.fillStyle = "#ffc107";
        } else {
          context.arc(position.x, position.y, selected ? 11 : 9, 0, Math.PI * 2);
          context.fillStyle = node.origin || node.root
            ? "#28a745"
            : node.destination
              ? "#dc3545"
              : "#007bff";
        }
        context.fill();
        if (selected) {
          context.lineWidth = 2;
          context.strokeStyle = "#263238";
          context.stroke();
          context.lineWidth = 1;
          context.strokeStyle = "#cccccc";
        }
        if (showLabels || selected) {
          const label = node.label || node.title;
          context.font = "12px Segoe UI, sans-serif";
          context.textAlign = "center";
          context.textBaseline = "top";
          context.fillStyle = "#252a32";
          context.fillText(label, position.x, position.y + 11, 150);
        }
      }
      context.restore();
    }
  }

  window.NetworkView = NetworkView;
})();
