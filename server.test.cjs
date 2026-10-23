const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('./server.cjs');
const spool = { id: 'one', name: 'Green', brand: 'Bambu Lab', material: 'PLA Silk', colorName: 'Green', color: '#527b65', total: 1000, remaining: 750, diameter: '1.75', location: 'Shelf', notes: '', createdAt: 1, emptySpoolWeight: 250, lastMeasuredWeight: 1000 };
const inventory = { version: 1, spools: [spool], prints: [] };
async function start(dir) {
  const server = createServer(dir);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function stop(server) { await new Promise(resolve => server.close(resolve)); }
const put = (url, revision, data, contentType = 'application/json') => fetch(url + '/api/state', { method: 'PUT', headers: { 'Content-Type': contentType }, body: JSON.stringify({ revision, data }) });
test('state updates accept case-insensitive JSON content types', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spool-test-')); let running;
  try {
    running = await start(dir);
    assert.equal((await put(running.url, 0, inventory, 'Application/JSON; charset=utf-8')).status, 200);
  } finally { if (running) await stop(running.server); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('state updates reject prints dated in the future', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spool-test-')); let running;
  try {
    running = await start(dir);
    const futurePrint = { id: 'future', spoolId: spool.id, spoolName: spool.name, name: 'Future print', grams: 1, date: '2999-12-31', notes: '', createdAt: 1 };
    assert.equal((await put(running.url, 0, { ...inventory, prints: [futurePrint] })).status, 400);
  } finally { if (running) await stop(running.server); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('shared inventory persists across server restarts and competing edits cannot overwrite it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spool-test-')); let running;
  try {
    running = await start(dir);
    const first = await (await fetch(running.url + '/api/state')).json(); assert.equal(first.revision, 0);
    const results = await Promise.all([put(running.url, 0, inventory), put(running.url, 0, inventory)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    const secondBrowser = await (await fetch(running.url + '/api/state')).json();
    assert.equal(secondBrowser.data.spools[0].remaining, 750);
    assert.equal(secondBrowser.data.spools[0].emptySpoolWeight, 250);
    await stop(running.server); running = await start(dir);
    const persisted = await (await fetch(running.url + '/api/state')).json(); assert.deepEqual(persisted, secondBrowser);
    assert.equal((await put(running.url, 1, { ...inventory, spools: [{ ...spool, remaining: -1 }] })).status, 400);
    assert.equal((await fetch(running.url + '/data/inventory.json')).status, 404);
    assert.equal((await fetch(running.url + '/data.js')).status, 200);
    const icon = await fetch(running.url + '/icon.svg');
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get('content-type'), /^image\/svg\+xml/);
    const manifestResponse = await fetch(running.url + '/manifest.json');
    assert.equal(manifestResponse.status, 200);
    assert.match(manifestResponse.headers.get('content-type'), /^application\/manifest\+json/);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.display, 'standalone');
    for (const entry of manifest.icons) assert.equal((await fetch(running.url + entry.src)).status, 200);
    const worker = await fetch(running.url + '/service-worker.js');
    assert.equal(worker.status, 200);
    assert.match(worker.headers.get('content-type'), /^text\/javascript/);
    assert.equal((await fetch(running.url + '/health')).status, 200);
    assert.equal((await fetch(running.url + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://other.example' }, body: JSON.stringify({ revision: 1, data: inventory }) })).status, 403);
  } finally { if (running) await stop(running.server); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('PUT rejects a null Origin header without modifying inventory', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spool-test-')); let running;
  try {
    running = await start(dir);
    const response = await fetch(running.url + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'null' }, body: JSON.stringify({ revision: 0, data: inventory }) });
    assert.equal(response.status, 403);
    assert.equal((await (await fetch(running.url + '/api/state')).json()).revision, 0);
  } finally { if (running) await stop(running.server); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('corrupt on-disk data fails startup instead of silently resetting inventory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spool-test-'));
  try { fs.writeFileSync(path.join(dir, 'inventory.json'), '{broken'); assert.throws(() => createServer(dir)); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('rejects saves that would overflow the persisted revision', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spool-test-')); let running;
  try {
    fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify({ revision: Number.MAX_SAFE_INTEGER, data: inventory }));
    running = await start(dir);
    assert.equal((await put(running.url, Number.MAX_SAFE_INTEGER, inventory)).status, 409);
    await stop(running.server); running = null;
    assert.doesNotThrow(() => createServer(dir));
  } finally { if (running) await stop(running.server); fs.rmSync(dir, { recursive: true, force: true }); }
});
