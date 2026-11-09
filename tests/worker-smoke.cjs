const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  const siteDirectory = path.resolve(process.argv[2] || "_site");
  const workerPath = path.join(__dirname, "..", "site", "app-worker.js");
  const messages = [];
  let onMessage;
  globalThis.self = {
    location: { href: "https://example.test/Kevin-Bacon-ARS/app-worker.js" },
    postMessage: (message) => messages.push(message),
    addEventListener: (type, listener) => {
      if (type === "message") onMessage = listener;
    },
  };
  globalThis.fetch = async (url) => {
    const filename = path.join(siteDirectory, "data", path.basename(new URL(url).pathname));
    if (!fs.existsSync(filename)) return new Response(null, { status: 404 });
    return new Response(fs.readFileSync(filename));
  };
  vm.runInThisContext(fs.readFileSync(workerPath, "utf8"), { filename: workerPath });

  await waitFor(() => messages.some((message) => message.type === "ready"), "actor catalog");
  const search = async (id, value) => {
    await onMessage({ data: { id, type: "search", value } });
    return messages.find((message) => message.id === id && message.type === "search-result");
  };
  const tom = await search(1, "Tom Cruise");
  const bacon = await search(2, "Kevin Bacon");
  assert.equal(tom.selected.name, "Tom Cruise");
  assert.equal(bacon.selected.name, "Kevin Bacon");

  await onMessage({
    data: { id: 3, type: "query-path", origin: tom.selected, destination: bacon.selected },
  });
  const pathResult = messages.find((message) => message.id === 3 && message.type === "query-result");
  assert.equal(pathResult.connected, true);
  assert.equal(pathResult.degrees, 1);
  assert.equal(pathResult.nodes.length, 3);
  assert.deepEqual(pathResult.bridges, []);
  assert.equal(pathResult.edges.length, 2);

  await onMessage({ data: { id: 4, type: "query-network", actor: bacon.selected } });
  const networkResult = messages.find((message) => message.id === 4 && message.type === "query-result");
  assert.ok(networkResult.actorCount > 0);
  assert.ok(networkResult.movieCount > 0);
  assert.ok(networkResult.nodes.some((node) => node.root && node.name === "Kevin Bacon"));
  assert.equal(networkResult.edges.length > 0, true);
  console.log(
    `Worker smoke test passed: Tom Cruise–Kevin Bacon = ${pathResult.degrees} degree; ` +
    `Kevin Bacon network = ${networkResult.actorCount} actors, ${networkResult.movieCount} movies.`,
  );
}

function waitFor(predicate, label) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 120_000) {
        clearInterval(timer);
        reject(new Error(`Timed out loading ${label}.`));
      }
    }, 20);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
