import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = false;
const hostname = '127.0.0.1';
const port = Number(process.env.PORT || 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

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
    console.log(`Salon POS ready on http://${hostname}:${port}`);
  });
});
