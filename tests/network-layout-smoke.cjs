const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createContext() {
  const methods = [
    "setTransform", "clearRect", "save", "translate", "scale", "beginPath",
    "moveTo", "lineTo", "stroke", "arc", "fill", "closePath", "restore",
    "fillText",
  ];
  return Object.fromEntries(methods.map((method) => [method, () => {}]));
}

function createElement(tagName) {
  return {
    tagName,
    style: {},
    children: [],
    className: "",
    hidden: false,
    setAttribute() {},
    addEventListener() {},
    setPointerCapture() {},
    getContext() { return createContext(); },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    getBoundingClientRect() { return { width: 760, height: 380 }; },
  };
}

function layoutPath(NetworkView, count) {
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: index,
    type: index % 2 === 0 ? "person" : "movie",
  }));
  const edges = nodes.slice(1).map((node, index) => [index, node.id]);
  const container = createElement("div");
  return new NetworkView(container, { kind: "path", nodes, edges });
}

function main() {
  const networkSource = fs.readFileSync(
    path.join(__dirname, "..", "site", "network.js"),
    "utf8",
  );
  const window = {};
  const context = {
    document: { createElement },
    window,
    ResizeObserver: class { observe() {} },
  };
  vm.runInNewContext(networkSource, context, { filename: "network.js" });

  const directPath = layoutPath(window.NetworkView, 3);
  const directPositions = Array.from(directPath.positions.values());
  const averageEndpointY = (directPositions[0].y + directPositions[2].y) / 2;
  assert.ok(
    directPositions[1].y < averageEndpointY - 30,
    "The shared movie should sit clearly above the two actor endpoints.",
  );
  assert.ok(
    Math.abs(directPositions[0].y - directPositions[2].y) < 1,
    "The actor endpoints should remain balanced around the shared movie.",
  );

  const multiStepPath = layoutPath(window.NetworkView, 7);
  const multiStepPositions = Array.from(multiStepPath.positions.values());
  const verticalSpread = Math.max(...multiStepPositions.map((point) => point.y))
    - Math.min(...multiStepPositions.map((point) => point.y));
  assert.ok(verticalSpread > 100, "Multi-step paths should use a visible curved layout.");

  console.log(
    `Path layout smoke test passed: direct-route curve ${Math.round(averageEndpointY - directPositions[1].y)}px; ` +
    `multi-step vertical spread ${Math.round(verticalSpread)}px.`,
  );
}

main();
