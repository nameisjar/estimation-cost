import { createApp } from './app.js';
import { config } from './config.js';
const server = createApp().listen(config.port, () => console.log(`AntarFix API: http://localhost:${config.port}`));
server.on('error', error => { console.error(error.message); process.exit(1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
