'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 10000);

const ADMIN_USER = String(process.env.ADMIN_USER || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '123456').trim();
const USER_PASSWORD = String(process.env.USER_PASSWORD || '').trim();

const SESSION_TTL = 1000 * 60 * 60 * 24 * 7;
const DATA_FILE = path.join(__dirname, 'data', 'gameplay.json');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      users: [],
      sessions: {},
      config: { siteName: 'Império GamePlay' },
      packages: [
        { id: 'basico', name: 'Básico', ram: '4GB', gpu: 'Compartilhada', price: 19.90 },
        { id: 'medio', name: 'Médio', ram: '8GB', gpu: 'Dedicada', price: 34.90 },
        { id: 'premium', name: 'Premium', ram: '16GB', gpu: 'Dedicada', price: 59.90 }
      ]
    }, null, 2));
  }
}

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  let filePath = '.' + (req.url === '/' ? '/index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeType = mimeTypes[ext] || 'application/octet-stream';

  if (req.url.startsWith('/api/')) {
    const data = readData();
    res.setHeader('Content-Type', 'application/json');
    
    if (req.url === '/api/login' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const { user, pass } = JSON.parse(body);
        let role = null, id = null;
        if (user === ADMIN_USER && pass === ADMIN_PASSWORD) role = 'admin';
        else {
          const found = data.users.find(u => u.username === user && u.password === pass);
          if (found) { role = 'user'; id = found.id; }
        }
        if (role) {
          const token = crypto.randomBytes(32).toString('hex');
          data.sessions[token] = { role, id, createdAt: Date.now() };
          writeData(data);
          res.end(JSON.stringify({ ok: true, token, role }));
        } else {
          res.end(JSON.stringify({ ok: false, error: 'Dados incorretos' }));
        }
      });
      return;
    }
    
    return res.end(JSON.stringify({ ok: true, packages: data.packages || [] }));
  }

  filePath = path.resolve(__dirname, filePath);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Página não encontrada');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(500); res.end('Erro no servidor'); return; }
    res.setHeader('Content-Type', mimeType);
    res.end(content);
  });
});

ensureDataDir();
server.listen(PORT, () => console.log(`🚀 Império GamePlay rodando na porta ${PORT}`));

