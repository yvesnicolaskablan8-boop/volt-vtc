const http = require('http');
const fs = require('fs');
const path = require('path');
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { filename, data } = JSON.parse(body);
        const base64 = data.replace(/^data:image\/\w+;base64,/, '');
        const outPath = path.join(__dirname, 'assets', filename);
        fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true });
        fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
        res.writeHead(200); res.end('saved: ' + outPath);
        console.log('Saved: ' + outPath);
        setTimeout(() => process.exit(0), 500);
      } catch (e) { res.writeHead(500); res.end('error: ' + e.message); }
    });
  }
});
server.listen(3099, () => console.log('Screenshot saver on :3099'));
