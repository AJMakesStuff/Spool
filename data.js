'use strict';
const MATERIALS = [
  'PLA', 'PLA+', 'PLA Silk', 'PLA Matte', 'PLA Tough', 'PLA High Speed',
  'PLA Wood', 'PLA Marble', 'PLA Glow in the Dark', 'PLA-CF',
  'PETG', 'PETG High Speed', 'PETG-CF',
  'ABS', 'ABS+', 'ABS-CF', 'ASA', 'ASA-CF',
  'TPU', 'TPU 95A', 'TPU 90A', 'TPU 85A', 'TPE',
  'PA / Nylon', 'PA6', 'PA12', 'PA-CF', 'PA-GF',
  'PC', 'PC-ABS', 'PC-CF', 'PVA', 'BVOH', 'HIPS', 'PP', 'Other'
];

function validateData(data) {
  const string = (v, max) => typeof v === 'string' && v.length <= max;
  const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (!data || data.version !== 1 || !Array.isArray(data.spools) || !Array.isArray(data.prints) || data.spools.length > 10000 || data.prints.length > 100000) throw Error('This is not a supported Spool backup.');
  const spoolIds = new Set(), printIds = new Set();
  for (const s of data.spools) {
    if (!s || !string(s.id, 100) || !s.id || spoolIds.has(s.id) || !string(s.name, 80) || !s.name.trim() || !string(s.brand, 60) || !s.brand.trim() || !MATERIALS.includes(s.material) || !string(s.colorName, 40) || !s.colorName.trim() || !/^#[0-9a-f]{6}$/i.test(s.color) || !finite(s.total, 1, 100000) || !finite(s.remaining, 0, s.total) || !['1.75', '2.85', '3'].includes(s.diameter) || !string(s.location, 60) || !string(s.notes, 1000) || !finite(s.createdAt, 0, 1e15)) throw Error('The backup contains invalid spool data.');
    if (s.emptySpoolWeight != null && !finite(s.emptySpoolWeight, 0, 100000)) throw Error('The backup contains an invalid empty spool weight.');
    if (s.lastMeasuredWeight != null && !finite(s.lastMeasuredWeight, 0, 200000)) throw Error('The backup contains an invalid measured weight.');
    spoolIds.add(s.id);
  }
  for (const p of data.prints) {
    if (!p || !string(p.id, 100) || !p.id || printIds.has(p.id) || !string(p.spoolId, 100) || !string(p.spoolName, 80) || !string(p.name, 100) || !p.name.trim() || !finite(p.grams, 0.1, 100000) || !string(p.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || new Date(p.date).toISOString().slice(0, 10) !== p.date || !string(p.notes, 1000) || !finite(p.createdAt, 0, 1e15)) throw Error('The backup contains invalid print history.');
    printIds.add(p.id);
  }
  return { version: 1, spools: data.spools, prints: data.prints };
}

if (typeof module !== 'undefined') module.exports = { validateData, MATERIALS };
