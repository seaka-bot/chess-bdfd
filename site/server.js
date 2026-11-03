// Standalone server for the emoji tool: serves chess-emojis.html at / and the upload route at POST /bdfd-api/chess-emojis.
// Usage (Node 18+):  node site/server.js   → http://localhost:8790
// The bot token only lives in memory during the request: it is never written to disk or logged.
// Per-IP limit (3 uploads every 10 minutes) and at most 3 uploads at once, so the server IP doesn't get blocked by Discord.
const http = require('http'), fs = require('fs'), path = require('path');
const CE = require('./chess-emojis.js');
const PORT = +process.env.PORT || 8790;
const PAGE = fs.readFileSync(path.join(__dirname, 'chess-emojis.html'));

const uses = new Map(); let running = 0, total = [];
// forget old IPs every 10 minutes, so the map doesn't grow forever
setInterval(() => { const n = Date.now(); for (const [ip, l] of uses) if (!l.some((t) => n - t < 600000)) uses.delete(ip); }, 600000).unref();
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE); }
  if (req.method !== 'POST' || url !== '/bdfd-api/chess-emojis') return json(res, 404, { erro: 'not found' });
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
  const now = Date.now(), list = (uses.get(ip) || []).filter((t) => now - t < 600000);
  if (list.length >= 3) return json(res, 429, { erro: 'limite' });
  if (running >= 3) return json(res, 503, { erro: 'ocupado' });
  // global cap: 60 uploads every 10 minutes from all IPs together. A fake token gets a 401 from Discord, and too many 401s
  // get the server's IP blocked by the Discord API (which would also take down other bots on the same machine)
  total = total.filter((t) => now - t < 600000);
  if (total.length >= 60) return json(res, 503, { erro: 'ocupado' });
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
  req.on('end', async () => {
    let token; try { ({ token } = JSON.parse(body)); } catch { return json(res, 400, { erro: 'json' }); }
    body = '';
    if (!CE.tokenValido(token)) return json(res, 400, { erro: 'formato' });
    token = token.trim(); total.push(now);
    list.push(now); uses.set(ip, list); running++;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const send = (ev) => res.write(JSON.stringify(ev) + '\n');
    try { await CE.subir(token, send); }
    catch (e) { send({ tipo: 'erro', erro: e.publico || 'falhou', status: e.status, detalhe: e.detalhe }); }
    finally { token = null; running--; res.end(); }
  });
}).listen(PORT, () => console.log(`chess emoji tool on http://localhost:${PORT}`));
