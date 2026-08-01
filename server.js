import { createServer } from 'node:http';
import next from 'next';

const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer(async (req, res) => {
      try {
        await handle(req, res);
      } catch (error) {
        console.error('Request handling failed:', error);

        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
        }

        res.end('Internal Server Error');
      }
    });

    server.listen(port, () => {
      console.log(`The Hair Cut Pos started on Passenger port ${port}`);
    });
  })
  .catch((error) => {
    console.error('The Hair Cut Pos startup failed:', error);
    process.exit(1);
  });
