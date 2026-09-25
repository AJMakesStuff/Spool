/* Shared inventory is persisted by the Spool server. */
'use strict';
const BRANDS = ['Anycubic', 'Bambu Lab', 'ColorFabb', 'Creality', 'ELEGOO', 'eSUN', 'Flashforge', 'Hatchbox', 'Kingroon', 'Overture', 'Polymaker', 'Prusament', 'QIDI', 'Siraya Tech', 'SUNLU', 'Voxelab'];
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const round = n => Math.round(n * 10) / 10;
const format = n => Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let state = { version: 1, spools: [], prints: [] };
let page = 'inventory';
let toastTimer;
let revision = null;
let committed = JSON.stringify(state);
let saving = false;
let loading = false;
function storageWarning(message) {
  $('#storage-warning').textContent = message;
  $('#storage-warning').hidden = !message;
}
function lockControls() {
  document.querySelectorAll('button, input, select, textarea').forEach(control => {
    if (saving || loading || revision === null) {
      if (!control.hasAttribute('data-storage-lock')) { control.dataset.storageLock = String(control.disabled); control.disabled = true; }
    } else if (control.hasAttribute('data-storage-lock')) {
      control.disabled = control.dataset.storageLock === 'true'; delete control.dataset.storageLock;
    }
  });
}
async function refreshState() {
  if (loading || saving || document.querySelector('dialog[open]')) return;
  loading = true; lockControls();
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw Error('Unable to load shared inventory. Check the server connection.');
    const result = await response.json();
    state = validateData(result.data); revision = result.revision; committed = JSON.stringify(state);
    render(); storageWarning('');
  } catch (error) { storageWarning(error.message); }
  finally { loading = false; lockControls(); }
}
async function save() {
  if (saving || loading || revision === null) { state = JSON.parse(committed); return false; }
  saving = true; lockControls();
  try {
    const response = await fetch('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, data: state }) });
    if (response.status === 409) {
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      revision = null;
      throw Error('Another browser updated the inventory. Your change was not saved. Refreshing; please try again.');
    }
    if (!response.ok) throw Error('Change could not be saved. Check the connection and try again.');
    const result = await response.json();
    state = validateData(result.data); revision = result.revision; committed = JSON.stringify(state); storageWarning('');
    return true;
  } catch (error) { state = JSON.parse(committed); render(); storageWarning(error.message); toast(error.message); return false; }
  finally { saving = false; lockControls(); }
}
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function confirmAction(title, message, accept = 'Confirm') {
  $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; $('#confirm-accept').textContent = accept;
  const dialog = $('#confirm-dialog'); dialog.returnValue = ''; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
function render() {
  $('#nav-count').textContent = state.spools.length;
  $('#stat-count').innerHTML = `${state.spools.length} <small>spools</small>`;
  $('#stat-weight').innerHTML = `${format(state.spools.reduce((sum, s) => sum + s.remaining, 0) / 1000)} <small>kg</small>`;
  $('#stat-low').innerHTML = `${state.spools.filter(s => s.remaining / s.total <= .2).length} <small>spools</small>`;
  $('#stat-prints').innerHTML = `${state.prints.length} <small>prints</small>`;
  $('#stat-used').textContent = `${format(state.prints.reduce((sum, p) => sum + p.grams, 0))} g put to good use`;
  renderInventory(); renderHistory();
}
function renderInventory() {
  const query = $('#search').value.toLowerCase().trim(), material = $('#material-filter').value, stock = $('#stock-filter').value;
  let spools = state.spools.filter(s => (!query || [s.name, s.brand, s.material, s.colorName, s.location, s.notes].some(v => v.toLowerCase().includes(query))) && (!material || s.material === material) && (!stock || (stock === 'empty' ? s.remaining === 0 : stock === 'low' ? s.remaining > 0 && s.remaining / s.total <= .2 : s.remaining / s.total > .2)));
  spools.sort((a, b) => $('#sort').value === 'name' ? a.name.localeCompare(b.name) : $('#sort').value === 'remaining' ? a.remaining - b.remaining : b.createdAt - a.createdAt);
  $('#library-count').textContent = spools.length;
  $('#empty-state').hidden = state.spools.length !== 0;
  $('#no-results').hidden = state.spools.length === 0 || spools.length !== 0;
  $('#spool-grid').innerHTML = spools.map(s => {
    const percent = Math.round(s.remaining / s.total * 100), low = s.remaining / s.total <= .2;
    return `<article class="spool-card" style="--spool-color:${s.color}"><div class="spool-visual"><span class="material-badge">${escapeHtml(s.material)}</span>${low ? `<span class="stock-badge">${s.remaining === 0 ? 'Empty spool' : '↘ Low stock'}</span>` : ''}<div class="spool-art" aria-hidden="true"></div></div><div class="card-body"><p class="card-brand">${escapeHtml(s.brand)}</p><h3 title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</h3><div class="card-meta"><span class="color-dot"></span>${escapeHtml(s.colorName)} <span>·</span> ${escapeHtml(s.diameter)} mm</div><div class="remaining-label"><strong>${format(s.remaining)} <small>/ ${format(s.total)} g</small></strong><span>${percent}% left</span></div><div class="progress ${low ? 'low' : ''}" role="meter" aria-label="Filament remaining" aria-valuemin="0" aria-valuemax="${s.total}" aria-valuenow="${s.remaining}"><span style="width:${percent}%"></span></div><p class="card-location">⌑ &nbsp;${escapeHtml(s.location || 'No location set')}</p><div class="card-actions"><button class="button" data-action="log" data-id="${escapeHtml(s.id)}" ${s.remaining <= 0 ? 'disabled' : ''}>＋ Log print</button><button class="icon-button" data-action="edit" data-id="${escapeHtml(s.id)}" title="Edit filament" aria-label="Edit ${escapeHtml(s.name)}">✎</button><button class="icon-button" data-action="delete" data-id="${escapeHtml(s.id)}" title="Delete filament" aria-label="Delete ${escapeHtml(s.name)}">×</button></div></div></article>`;
  }).join('');
}
function renderHistory() {
  $('#history-count').textContent = state.prints.length;
  $('#history-list').innerHTML = state.prints.length ? [...state.prints].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).map(p => `<article class="history-row"><div class="history-symbol">✓</div><div class="history-details"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.spoolName)}</p>${p.notes ? `<p>${escapeHtml(p.notes)}</p>` : ''}</div><div class="history-weight">${format(p.grams)} g<small>${escapeHtml(new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))}</small></div><button class="button secondary" data-undo="${escapeHtml(p.id)}">Undo</button></article>`).join('') : '<div class="empty-state"><div class="empty-icon">◷</div><h2>The making starts here.</h2><p>Choose “Log print” on a filament card to record a print and update your stock.</p><button class="button secondary" data-go-inventory>View filament library</button></div>';
}
function setPage(next) {
  page = next; $('#inventory-page').hidden = page !== 'inventory'; $('#history-page').hidden = page !== 'history';
  $('.nav-item.active')?.classList.remove('active'); $(`[data-page="${page}"]`).classList.add('active');
  $('#breadcrumb').textContent = page === 'inventory' ? 'Filament inventory' : 'Print history';
  $('#page-title').innerHTML = page === 'inventory' ? 'Your filament, in focus<span>.</span>' : 'Look what you’ve made<span>.</span>';
  $('#page-subtitle').textContent = page === 'inventory' ? 'Know what’s on hand. Make room for your next idea.' : 'A record of your prints, and the filament that brought them to life.';
}
function updateBrandField() {
  const other = $('#brand-select').value === '__other__';
  $('#custom-brand-field').hidden = !other;
  $('#custom-brand').disabled = !other;
  $('#custom-brand').required = other;
}
function setBrandField(brand = '') {
  $('#brand-select').value = !brand || BRANDS.includes(brand) ? brand : '__other__';
  $('#custom-brand').value = brand && !BRANDS.includes(brand) ? brand : '';
  updateBrandField();
}
$('#brand-select').innerHTML += BRANDS.map(brand => `<option>${escapeHtml(brand)}</option>`).join('') + '<option value="__other__">Other</option>';
$('#brand-select').addEventListener('change', updateBrandField);
function updateColorPreview() {
  const color = $('#spool-color').value;
  if (/^#[0-9a-f]{6}$/i.test(color)) $('#color-preview').value = color;
}
function applyPickedColor() {
  $('#spool-color').value = $('#color-preview').value;
}
$('#color-preview').addEventListener('input', applyPickedColor);
$('#color-preview').addEventListener('change', applyPickedColor);
function openSpool(id) {
  const form = $('#spool-form'); form.reset(); $('#spool-error').textContent = ''; $('#spool-id').value = id || '';
  $('#spool-dialog-title').textContent = id ? 'Edit filament' : 'Add filament';
  if (id) { const spool = state.spools.find(s => s.id === id); for (const key of ['name', 'brand', 'material', 'colorName', 'color', 'total', 'remaining', 'diameter', 'location', 'notes']) form.elements.namedItem(key).value = spool[key]; }
  const spool = state.spools.find(s => s.id === id);
  setBrandField(spool?.brand);
  updateColorPreview();
  form.elements.namedItem('emptySpoolWeight').value = spool?.emptySpoolWeight ?? '';
  $('#last-measurement').hidden = spool?.lastMeasuredWeight == null;
  $('#last-measurement').textContent = spool?.lastMeasuredWeight != null ? `Last scale reading: ${format(spool.lastMeasuredWeight)} g (spool + filament). Enter a new reading to update stock.` : '';
  updateMeasurementPreview();
  $('#spool-dialog').showModal();
}
function measuredRemaining(measured, empty, total) {
  if (empty === '' || empty == null) throw Error('Enter the empty spool weight to calculate remaining filament.');
  const gross = Number(measured), tare = Number(empty);
  if (!Number.isFinite(gross) || !Number.isFinite(tare) || gross < 0 || gross > 200000 || tare < 0 || tare > 100000) throw Error('Enter valid, non-negative measured and empty spool weights.');
  if (gross < tare) throw Error('Measured weight cannot be less than the empty spool weight.');
  const remaining = round(gross - tare);
  if (remaining > Number(total)) throw Error('Calculated filament exceeds the original filament weight. Check your weights.');
  return remaining;
}
function updateMeasurementPreview() {
  const form = $('#spool-form'), measured = form.elements.namedItem('measuredWeight').value;
  const remaining = form.elements.namedItem('remaining');
  remaining.readOnly = measured !== '';
  if (measured === '') { $('#measurement-preview').textContent = 'Optional. Leave measured weight blank to keep the remaining weight above.'; return; }
  try {
    const grams = measuredRemaining(measured, form.elements.namedItem('emptySpoolWeight').value, form.elements.namedItem('total').value);
    remaining.value = grams;
    $('#measurement-preview').textContent = `${format(Number(measured))} g − ${format(Number(form.elements.namedItem('emptySpoolWeight').value))} g = ${format(grams)} g filament remaining. Applied when you save.`;
  } catch (error) { $('#measurement-preview').textContent = error.message; }
}
$('#spool-form').addEventListener('input', event => {
  if (event.target.name === 'color') updateColorPreview();
  if (['measuredWeight', 'emptySpoolWeight', 'total'].includes(event.target.name)) updateMeasurementPreview();
});
$('#spool-form').addEventListener('submit', async event => {
  event.preventDefault(); if (saving || loading || revision === null) return; const data = Object.fromEntries(new FormData(event.target));
  if (data.brand === '__other__') data.brand = (data.customBrand || '').trim();
  delete data.customBrand;
  data.total = Number(data.total); data.remaining = Number(data.remaining);
  const measured = data.measuredWeight;
  delete data.measuredWeight;
  if (measured != null && measured !== '') {
    try { data.remaining = measuredRemaining(measured, data.emptySpoolWeight, data.total); data.lastMeasuredWeight = Number(measured); }
    catch (error) { $('#spool-error').textContent = error.message; return; }
  }
  data.emptySpoolWeight = data.emptySpoolWeight == null || data.emptySpoolWeight === '' ? null : Number(data.emptySpoolWeight);
  for (const k of ['name', 'brand', 'colorName', 'location', 'notes']) data[k] = data[k].trim();
  if (!data.name || !data.brand || !data.colorName) { $('#spool-error').textContent = 'Please enter a name, brand, and color name.'; return; }
  if (data.remaining > data.total) { $('#spool-error').textContent = 'Remaining filament cannot exceed the original spool weight.'; return; }
  const id = $('#spool-id').value, existing = state.spools.find(s => s.id === id);
  const spool = { ...existing, ...data, id: existing?.id || uid(), createdAt: existing?.createdAt || Date.now() };
  try { validateData({ ...state, spools: [...state.spools.filter(s => s.id !== id), spool] }); } catch (error) { $('#spool-error').textContent = error.message; return; }
  if (existing) Object.assign(existing, spool); else state.spools.push(spool);
  if (!await save()) return; render(); $('#spool-dialog').close(); toast(existing ? 'Filament updated.' : 'Filament added to your collection.');
});
$('#usage-form').addEventListener('submit', async event => {
  event.preventDefault(); if (saving || loading || revision === null) return; const data = Object.fromEntries(new FormData(event.target)), spool = state.spools.find(s => s.id === $('#usage-spool-id').value);
  const grams = round(Number(data.grams));
  if (!spool || grams <= 0 || !Number.isFinite(grams) || grams > spool.remaining) { $('#usage-error').textContent = 'Enter a weight greater than zero and within the remaining filament.'; return; }
  if (!data.name.trim()) { $('#usage-error').textContent = 'Give this print a name.'; return; }
  if (data.date > today()) { $('#usage-error').textContent = 'Choose today or an earlier date for a completed print.'; return; }
  const print = { id: uid(), spoolId: spool.id, spoolName: spool.name, name: data.name.trim(), grams, date: data.date, notes: data.notes.trim(), createdAt: Date.now() };
  try { validateData({ ...state, prints: [...state.prints, print] }); } catch (error) { $('#usage-error').textContent = error.message; return; }
  spool.remaining = round(spool.remaining - grams); state.prints.push(print); if (!await save()) return; render(); $('#usage-dialog').close(); toast(`Print logged. ${format(spool.remaining)} g left on this spool.`);
});
$('#spool-grid').addEventListener('click', async event => {
  if (saving || loading || revision === null) return;
  const button = event.target.closest('[data-action]'); if (!button) return;
  const spool = state.spools.find(s => s.id === button.dataset.id); if (!spool) return;
  if (button.dataset.action === 'edit') openSpool(spool.id);
  if (button.dataset.action === 'log') {
    $('#usage-form').reset(); $('#usage-error').textContent = ''; $('#usage-spool-id').value = spool.id;
    $('#usage-summary').textContent = `${spool.name} · ${format(spool.remaining)} g available`;
    $('#usage-form').elements.grams.max = spool.remaining; $('#usage-form').elements.date.value = today(); $('#usage-form').elements.date.max = today(); $('#usage-dialog').showModal();
  }
  if (button.dataset.action === 'delete' && await confirmAction('Delete this filament?', `Remove “${spool.name}” from your collection? Its print history will be kept.`, 'Delete filament')) {
    state.spools = state.spools.filter(s => s.id !== spool.id); if (!await save()) return; render(); toast('Filament removed. Print history retained.');
  }
});
$('#history-list').addEventListener('click', async event => {
  if (event.target.closest('[data-go-inventory]')) { setPage('inventory'); return; }
  if (saving || loading || revision === null) return;
  const button = event.target.closest('[data-undo]'); if (!button) return;
  const print = state.prints.find(p => p.id === button.dataset.undo); const spool = state.spools.find(s => s.id === print.spoolId);
  if (spool && round(spool.remaining + print.grams) > spool.total) { toast('Cannot restore this usage: edit the spool weight first to make room.'); return; }
  if (!await confirmAction('Undo this print?', spool ? `Remove “${print.name}” and restore ${format(print.grams)} g to ${spool.name}?` : `Remove “${print.name}” from history? Its spool has been deleted, so the weight cannot be restored.`, 'Undo print')) return;
  if (spool) spool.remaining = round(spool.remaining + print.grams);
  state.prints = state.prints.filter(p => p.id !== print.id); if (!await save()) return; render(); toast('Print log undone.');
});
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
$('.brand').addEventListener('click', () => setPage('inventory'));
$('#add-spool').addEventListener('click', () => openSpool()); $('#empty-add').addEventListener('click', () => openSpool());
$('#material-filter').innerHTML += MATERIALS.map(m => `<option>${m}</option>`).join('');
$('#spool-form select[name="material"]').innerHTML = MATERIALS.map(m => `<option>${m}</option>`).join('');
for (const id of ['search', 'material-filter', 'stock-filter', 'sort']) $('#' + id).addEventListener(id === 'search' ? 'input' : 'change', renderInventory);
$('#clear-filters').addEventListener('click', () => { $('#search').value = ''; $('#material-filter').value = ''; $('#stock-filter').value = ''; renderInventory(); });
$('#export-btn').addEventListener('click', () => {
  downloadBackup(state);
});
function downloadBackup(data) {
  const blob = new Blob([JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `spool-backup-${today()}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); toast('Backup exported. Keep it somewhere safe.');
}
$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async event => {
  if (saving || loading || revision === null) return;
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw Error('Backup files must be smaller than 20 MB.');
    const data = validateData(JSON.parse(await file.text()));
    if (!await confirmAction('Restore this backup?', `Replace the shared inventory and history for all browsers with ${data.spools.length} spools and ${data.prints.length} print logs? Export your current data first if you want to keep it.`, 'Restore backup')) return;
    state = data; if (!await save()) return; render(); toast('Your backup has been restored.');
  } catch (error) { toast(error instanceof SyntaxError ? 'This file is not valid JSON. Choose a Spool backup.' : error.message); }
});
$('#load-demo').addEventListener('click', async () => {
  if (saving || loading || revision === null || state.spools.length) return;
  const samples = [
    ['Matte Forest Green', 'Bambu Lab', 'PLA', 'Forest green', '#587360', 760, 'Dry box A'],
    ['Ivory White', 'Polymaker', 'PLA', 'Ivory', '#e4ddcb', 920, 'Shelf 01'],
    ['Burnt Terracotta', 'eSUN', 'PLA+', 'Terracotta', '#b56c4f', 145, 'Dry box A'],
    ['Midnight Black', 'Prusament', 'PETG', 'Black', '#353c3e', 580, 'Dry box B'],
    ['Coastal Blue', 'Bambu Lab', 'PLA', 'Ocean blue', '#7194a1', 430, 'Shelf 01'],
    ['Sunflower Yellow', 'Overture', 'TPU', 'Yellow', '#dcb953', 85, 'Dry box B']
  ];
  state.spools = samples.map((s, i) => ({ id: uid(), name: s[0], brand: s[1], material: s[2], colorName: s[3], color: s[4], total: 1000, remaining: s[5], location: s[6], diameter: '1.75', notes: 'Sample spool — edit or delete this to add your own inventory.', createdAt: Date.now() - i * 1000 }));
  if (!await save()) return; render(); toast('Sample collection added. You can edit or delete any spool.');
});
render();
lockControls();
refreshState();
setInterval(refreshState, 5000);
