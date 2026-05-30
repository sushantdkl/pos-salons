import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import os from 'os';

const dev = false;
const hostname = '0.0.0.0';
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (error) {
      console.error('Request failed:', error);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (error) => {
    if (error) throw error;

    const localIP = getLocalIP();
    console.log('\nSalon POS System started successfully\n');
    console.log(`Local:   http://localhost:${port}`);
    console.log(`Network: http://${localIP}:${port}`);
    console.log('\nKeep this window open while using the POS system.');
    console.log('To stop: Press Ctrl+C\n');
  });
});
