const path = require('node:path');
const backendDirectory = path.join(__dirname, 'backend');

module.exports = {
  apps: [{
    name: 'antarfix-estimator-api',
    cwd: backendDirectory,
    script: path.join(backendDirectory, 'dist', 'server.js'),
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    restart_delay: 2000,
    kill_timeout: 5000,
    env: { NODE_ENV: 'production' },
  }],
};
