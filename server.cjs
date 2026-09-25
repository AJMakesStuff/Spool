'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./data.js');

function createServer(dataDir = process.env.DATA_DIR || path.join(__dirname, 'data')) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'inventory.json');
  let current = { revision: 0, data: { version: 1, spools: [], prints: [] } };
  if (fs.existsSync(file)) {
    current = JSON.parse(fs.readFileSync(file, 'utf8'));
    validateData(current.data);
    if (!Number.isSafeInteger(current.revision) || current.revision < 0) throw Error('Invalid saved revision. Restore a valid volume backup.');
  }
  const assets = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/data.js': ['data.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
  function reply(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/health' && req.method === 'GET') return reply(res, 200, { status: 'ok' });
      if (pathname === '/api/state' && req.method === 'GET') return reply(res, 200, current);
      if (pathname === '/api/state' && req.method === 'PUT') {
        // Only JSON requests from this origin may mutate the shared collection.
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return reply(res, 403, { error: 'Origin not allowed' });
        if (req.headers['sec-fetch-site'] === 'cross-site') return reply(res, 403, { error: 'Origin not allowed' });
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') return reply(res, 415, { error: 'JSON required' });
        let size = 0; const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) return reply(res, 413, { error: 'Request too large' });
          chunks.push(chunk);
        }
        let input, data;
        try { input = JSON.parse(Buffer.concat(chunks).toString()); data = validateData(input.data); }
        catch { return reply(res, 400, { error: 'Invalid inventory data' }); }
        if (input.revision !== current.revision) return reply(res, 409, { error: 'Inventory changed. Reload before saving.' });
        const next = { revision: current.revision + 1, data };
        // Synchronous commit serializes competing requests. Rename is atomic on the volume.
        const temp = file + '.tmp';
        const fd = fs.openSync(temp, 'w', 0o600);
        try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
        fs.renameSync(temp, file);
        current = next;
        return reply(res, 200, current);
      }
      if (pathname.startsWith('/api/')) return reply(res, 405, { error: 'Method not allowed' });
      const asset = assets[pathname];
      if (!asset || !['GET', 'HEAD'].includes(req.method)) return reply(res, 404, { error: 'Not found' });
      const content = fs.readFileSync(path.join(__dirname, asset[0]));
      res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) { console.error(error.message); if (!res.headersSent) reply(res, 500, { error: 'Storage unavailable' }); else res.end(); }
  });
}
if (require.main === module) {
  createServer().listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Spool server ready'));
}
module.exports = { createServer };
