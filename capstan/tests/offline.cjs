// Loads once (service worker installs), goes offline, reloads: the app must still boot with audio.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
  const p = await ctx.newPage();
  await p.goto(process.argv[2]);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(800);
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForTimeout(1500);
  const ok = await p.evaluate(async () => {
    const files = ['dsp.js', 'worklet.js', 'export-worker.js', 'icons/icon-180.png', 'manifest.webmanifest'];
    const res = await Promise.all(files.map((f) => fetch(f).then((r) => r.ok).catch(() => false)));
    return !!window.CapstanDSP && !!window.__capstan && !!document.querySelector('#platter') && res.every(Boolean);
  });
  console.log(ok ? '  ok   boots offline; every engine file comes from the cache' : '  FAIL offline boot');
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
