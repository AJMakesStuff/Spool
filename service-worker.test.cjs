const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('worker serves the offline shell and leaves shared state and writes on the network', async () => {
  const handlers = {};
  const cached = new Map();
  const deleted = [];
  const cache = {
    async addAll(paths) { paths.forEach(path => cached.set(path, { path })); },
    async match(path) { return cached.get(path); }
  };
  vm.runInNewContext(fs.readFileSync('service-worker.js', 'utf8'), {
    URL,
    self: { location: { origin: 'https://spool.test' }, addEventListener: (name, handler) => handlers[name] = handler },
    caches: { open: async () => cache, keys: async () => ['spool-shell-v0', 'spool-shell-v1', 'other-app'], delete: async key => deleted.push(key) },
    fetch: async () => { throw Error('Offline'); }
  });
  let work;
  handlers.install({ waitUntil: promise => work = promise });
  await work;
  for (const path of cached.keys()) assert.ok(fs.existsSync(path === '/' ? 'index.html' : path.slice(1)));
  handlers.activate({ waitUntil: promise => work = promise });
  await work;
  assert.deepEqual(deleted, ['spool-shell-v0']);
  handlers.fetch({ request: { method: 'GET', url: 'https://spool.test/' }, respondWith: promise => work = promise });
  assert.equal((await work).path, '/');
  for (const [method, url] of [['GET', 'https://spool.test/api/state'], ['PUT', 'https://spool.test/api/state'], ['POST', 'https://spool.test/'], ['GET', 'https://other.test/app.js']]) {
    handlers.fetch({ request: { method, url }, respondWith: () => assert.fail('Request must bypass cache') });
  }
});
