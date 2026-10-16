// Renders the home-screen icons from tests/icon.html. Run with NODE_PATH pointing at global modules.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 2048 } });
  await p.goto('file://' + process.argv[2]);
  await p.locator('#a').screenshot({ path: process.argv[3] + '/icon-1024.png' });
  await p.locator('#b').screenshot({ path: process.argv[3] + '/icon-maskable-1024.png' });
  await b.close();
})();
