const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('app.js', 'utf8');

async function app(saved) {
  const nodes = new Map();
  function node(selector) {
    if (selector === 'dialog[open]') return null;
    if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', innerHTML: '', hidden: true, handlers: {}, classList: { add() { }, remove() { } }, addEventListener(event, fn) { this.handlers[event] = fn; }, close() { }, elements: {} });
    return nodes.get(selector);
  }
  const storage = new Map();
  let serverData = saved ? JSON.parse(saved) : { version: 1, spools: [], prints: [] }, serverRevision = 0;
  let failSave = false, conflict = false;
  const context = vm.createContext({
    document: { querySelector: node, querySelectorAll: () => [] }, localStorage: { getItem: () => null }, console, setTimeout: () => 0, setInterval: () => 0, clearTimeout() { }, FormData: class { constructor(form) { return Object.entries(form.data); } }, fetch: async (url, options = {}) => {
      if (options.method === 'PUT') {
        if (failSave) throw Error('Disconnected');
        const input = JSON.parse(options.body);
        if (conflict || input.revision !== serverRevision) return { ok: false, status: 409 };
        serverData = input.data; serverRevision++; storage.set('spool-studio-v1', JSON.stringify(serverData));
      }
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify({ revision: serverRevision, data: serverData })) };
    }
  });
  vm.runInContext(fs.readFileSync('data.js', 'utf8'), context);
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { node, storage, run: code => vm.runInContext(code, context), failSave: () => failSave = true, conflict: () => conflict = true };
}
test('sample inventory persists and filters by name, material, and low stock', async () => {
  const a = await app(); await a.node('#load-demo').handlers.click();
  assert.equal(JSON.parse(a.storage.get('spool-studio-v1')).spools.length, 6);
  a.node('#search').value = 'forest'; a.run('renderInventory()'); assert.equal(a.node('#library-count').textContent, 1);
  a.node('#search').value = ''; a.node('#stock-filter').value = 'low'; a.run('renderInventory()'); assert.equal(a.node('#library-count').textContent, 2);
  a.node('#material-filter').value = 'TPU'; a.run('renderInventory()'); assert.equal(a.node('#library-count').textContent, 1);
});
test('logging deducts exact weight, rejects excess, and survives reload', async () => {
  const a = await app(); await a.node('#load-demo').handlers.click();
  a.node('#usage-spool-id').value = a.run('state.spools[0].id');
  const submit = data => a.node('#usage-form').handlers.submit({ preventDefault() { }, target: { data } });
  await submit({ name: 'Bracket', grams: '60.5', date: '2026-01-01', notes: 'Test' });
  assert.equal(a.run('state.spools[0].remaining'), 699.5); assert.equal(a.run('state.prints.length'), 1);
  await submit({ name: 'Too much', grams: '900', date: '2026-01-01', notes: '' });
  assert.equal(a.run('state.spools[0].remaining'), 699.5); assert.equal(a.run('state.prints.length'), 1);
  const restored = await app(a.storage.get('spool-studio-v1')); assert.equal(restored.run('state.spools[0].remaining'), 699.5); assert.equal(restored.run('state.prints.length'), 1);
});
test('backup validation rejects unsafe colors, duplicate IDs, and excessive weight', async () => {
  const a = await app(); await a.node('#load-demo').handlers.click();
  assert.throws(() => a.run("validateData({...state,spools:[{...state.spools[0],color:'red;display:none'}]})"));
  assert.throws(() => a.run('validateData({...state,spools:[state.spools[0],state.spools[0]]})'));
  assert.throws(() => a.run('validateData({...state,spools:[{...state.spools[0],remaining:1001}]})'));
  assert.equal(a.run("escapeHtml('<img onerror=\"x\">')"), '&lt;img onerror=&quot;x&quot;&gt;');
});
test('failed server writes roll back local changes and display an error', async () => {
  const a = await app(); a.failSave(); await a.node('#load-demo').handlers.click();
  assert.equal(a.run('state.spools.length'), 0); assert.equal(a.node('#storage-warning').hidden, false);
});
test('a stale browser does not overwrite newer server data', async () => {
  const a = await app(); a.conflict(); await a.node('#load-demo').handlers.click();
  assert.equal(a.run('state.spools.length'), 0); assert.equal(a.run('revision'), null);
});
test('unchanged background refresh does not rebuild the page', async () => {
  const a = await app();
  a.run('renderCount = 0; render = () => renderCount++');
  await a.run('refreshState()');
  assert.equal(a.run('renderCount'), 0);
});
test('new spool validates starting weight before saving', async () => {
  const a = await app(); const data = { name: 'My spool', brand: 'Brand', material: 'PLA', colorName: 'Green', color: '#527b65', total: '1000', remaining: '1200', diameter: '1.75', location: 'Shelf', notes: '' };
  const submit = () => a.node('#spool-form').handlers.submit({ preventDefault() { }, target: { data } });
  await submit(); assert.equal(a.run('state.spools.length'), 0);
  data.remaining = '850'; await submit(); assert.equal(a.run('state.spools.length'), 1); assert.equal(a.run('state.spools[0].remaining'), 850);
});
test('scale measurement deducts tare and keeps the measurement through backup reload', async () => {
  const a = await app();
  const data = { name: 'Weighed spool', brand: 'Brand', material: 'PLA', colorName: 'Green', color: '#527b65', total: '1000', remaining: '1000', measuredWeight: '875.5', emptySpoolWeight: '250', diameter: '1.75', location: 'Shelf', notes: '' };
  await a.node('#spool-form').handlers.submit({ preventDefault() { }, target: { data } });
  assert.equal(a.run('state.spools[0].remaining'), 625.5);
  const restored = await app(a.storage.get('spool-studio-v1'));
  assert.equal(restored.run('state.spools[0].emptySpoolWeight'), 250);
  assert.equal(restored.run('state.spools[0].lastMeasuredWeight'), 875.5);
  a.node('#usage-spool-id').value = a.run('state.spools[0].id');
  await a.node('#usage-form').handlers.submit({ preventDefault() { }, target: { data: { name: 'Print', grams: '25', date: '2026-01-01', notes: '' } } });
  a.node('#spool-id').value = a.run('state.spools[0].id');
  await a.node('#spool-form').handlers.submit({ preventDefault() { }, target: { data: { ...data, remaining: '600.5', measuredWeight: '' } } });
  assert.equal(a.run('state.spools[0].remaining'), 600.5);
  assert.equal(a.run('state.spools[0].lastMeasuredWeight'), 875.5);
});
test('scale measurement rejects missing tare, negative net, and excessive net; accepts empty spool', async () => {
  const a = await app();
  assert.throws(() => a.run("measuredRemaining('500','','1000')"));
  assert.throws(() => a.run("measuredRemaining('200','250','1000')"));
  assert.throws(() => a.run("measuredRemaining('1500','250','1000')"));
  assert.equal(a.run("measuredRemaining('250','250','1000')"), 0);
  assert.equal(a.run("measuredRemaining('500','0','1000')"), 500);
  await a.node('#load-demo').handlers.click();
  assert.throws(() => a.run('validateData({...state,spools:[{...state.spools[0],emptySpoolWeight:-1}]})'));
});
