process.env.PORT = process.env.PORT || '8011';

require('../server/index.js');

setTimeout(async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api/packs/status`);
    const body = await response.json();
    console.log(JSON.stringify(body, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}, 4000);
