const { createApp } = require('./app');
const { env } = require('./config/env');

const app = createApp();

app.listen(env.port, () => {
  console.log(`Maria Clara Clothing running on http://localhost:${env.port}`);
});
