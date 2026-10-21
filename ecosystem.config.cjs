const path = require('path');

module.exports = {
  apps: [
    {
      name: 'assethub-api',
      script: 'index.js',
      cwd: path.join(__dirname, 'server'),
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
