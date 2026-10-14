import { createApp, dataDirFromEnv } from './server.js';

const port = Number(process.env.PORT || 8080);
const dataDir = dataDirFromEnv(process.env);
const server = createApp({ dataDir });

server.listen(port, () => {
  console.log(`Backyard Glow Up API listening on http://localhost:${server.address().port}`);
  console.log(`Saving designs and requests in ${dataDir}`);
});

// Hosts stop the server with SIGTERM on every deploy. Closing first lets designs that
// are being made finish, and the process then exits on its own.
process.on('SIGTERM', () => server.close());
