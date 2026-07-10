// Minimal HTTPS static server for the GemType Word add-in (Office requires HTTPS).
// Uses office-addin-dev-certs for a trusted localhost certificate.
const https = require('https');
const fs = require('fs');
const path = require('path');
const devCerts = require('office-addin-dev-certs');

const PORT = 3000;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'text/xml', '.json': 'application/json',
};

(async () => {
  const options = await devCerts.getHttpsServerOptions();
  https
    .createServer(options, (req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/src/taskpane/taskpane.html';
      const filePath = path.join(ROOT, path.normalize(urlPath));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(data);
      });
    })
    .listen(PORT, () => console.log(`GemType add-in served at https://localhost:${PORT}`));
})();
