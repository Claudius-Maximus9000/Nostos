import { createApp } from './server.js';

const port = Number(process.env.PORT) || 8080;
const server = createApp();

server.listen(port, () => {
  console.log(`Backyard Glow Up API listening on http://localhost:${port}`);
});
