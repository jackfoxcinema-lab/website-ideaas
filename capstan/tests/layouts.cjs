// Screenshots at other sizes: small iPhone and a desktop browser.
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, mobile] of [['se', { width: 375, height: 667 }, true], ['desktop', { width: 1440, height: 900 }, false]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const p = await ctx.newPage();
    await p.goto(url); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/layout-${name}.png` });
    await ctx.close();
  }
  await b.close();
})();
