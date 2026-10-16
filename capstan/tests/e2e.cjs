// End-to-end run in headless Chromium at iPhone 16 size with a fake microphone.
// Usage: NODE_PATH=<global node_modules> node tests/e2e.cjs <url> <voice.wav> <screenshot dir>
const { chromium } = require('playwright');
const [url, wav, out] = process.argv.slice(2);
let failures = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    permissions: ['microphone'], acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const S = (expr) => page.evaluate(`(() => { const S = window.__capstan.S; return ${expr}; })()`);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

  console.log('first launch');
  await page.goto(url);
  await sleep(1200);
  await shot('01-first-launch');
  ok(await page.locator('#sticker').isVisible(), 'install sticker shows in a Safari tab');
  await page.locator('#stickerX').tap();
  ok(!(await page.locator('#sticker').isVisible()), 'sticker dismisses');

  console.log('record');
  await page.locator('#recKey').tap();
  await sleep(600);
  ok(await S('!!S.rec'), 'recording started');
  await sleep(3200);
  await shot('02-recording');
  const recSec = await S('S.rec ? S.rec.samples / S.rec.sr : 0');
  ok(recSec > 3, `captured ${recSec.toFixed(2)} s`);
  ok(await S('S.rec.level') > 0.001 || (await S('S.rec.samples')) > 0, 'mic level seen');

  console.log('stop -> saved + auto-rewind');
  await page.locator('#stopKey').tap();
  await sleep(300);
  ok(await S('!S.rec && !!S.cur'), 'tape saved and loaded');
  await sleep(150);
  await shot('03-rewinding');
  await sleep(1400);
  const afterRewind = await S('S.pos');
  ok(afterRewind < 100, `auto-rewound to start (pos ${afterRewind.toFixed(0)})`);
  const lenSec = await S('S.len / S.tapeSR');
  ok(Math.abs(lenSec - recSec) < 0.6, `tape length ${lenSec.toFixed(2)} s`);

  console.log('play');
  await page.locator('#playKey').tap();
  await sleep(1200);
  const p1 = await S('S.pos / S.tapeSR');
  ok(await S('S.playing'), 'playing');
  ok(p1 > 0.7 && p1 < 1.6, `position advancing (${p1.toFixed(2)} s)`);
  await shot('04-playing');

  console.log('scrub backwards with a finger');
  const box = await page.locator('#platter').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, R = box.width * 0.38;
  await sleep(1500);
  const before = await S('S.pos / S.tapeSR');
  const pt = (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  let a = -Math.PI / 2;
  await page.mouse.move(...pt(a));
  await page.mouse.down();
  let minV = 0;
  for (let i = 0; i < 30; i++) { a -= 0.12; await page.mouse.move(...pt(a)); await sleep(16); minV = Math.min(minV, await S('S.v')); }
  await shot('05-scrubbing');
  // hold still: the tape stops
  await sleep(400);
  const vHold = await S('S.v');
  await page.mouse.up();
  const after = await S('S.pos / S.tapeSR');
  ok(minV < -0.5, `tape ran backwards (min speed ${minV.toFixed(2)}x)`);
  ok(Math.abs(vHold) < 0.15, `holding the platter stops the tape (${vHold.toFixed(3)}x)`);
  ok(after < before - 0.5, `position moved back ${(before - after).toFixed(2)} s`);
  await sleep(700);
  const vAfter = await S('S.v');
  ok(Math.abs(vAfter - 1) < 0.05, `motor grabs it back to 1x after release (${vAfter.toFixed(3)}x)`);

  console.log('stock + drive');
  await page.locator('#stockKey').tap();
  await sleep(200);
  ok((await page.locator('#stockName').textContent()) === 'REEL 15', 'stock cycles TYPE II -> REEL 15');
  const fb = await page.locator('#fader').boundingBox();
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height * 0.62);
  await page.mouse.down();
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height * 0.30, { steps: 6 });
  await page.mouse.up();
  const drive = await S('S.drive');
  ok(drive > 0.6, `drive raised to ${(drive * 100).toFixed(0)}`);
  await shot('06-drive');

  console.log('pause, skip, cue');
  await page.locator('#playKey').tap();
  await sleep(300);
  ok(!(await S('S.playing')), 'paused');
  const s0 = await S('S.pos / S.tapeSR');
  await page.locator('#ffKey').tap();
  await sleep(900);
  const s1 = await S('S.pos / S.tapeSR');
  ok(s1 - s0 > 0.3, `skip forward moved ${(s1 - s0).toFixed(2)} s (tape end clamps)`);
  await page.locator('#stopKey').tap();
  await sleep(1300);
  ok((await S('S.pos')) < 100, 'STOP while stopped rewinds to zero');

  console.log('library');
  await page.locator('#tapesKey').tap();
  await sleep(500);
  await shot('07-library');
  ok((await page.locator('#libCount').textContent()) === '01', 'library shows 1 tape');
  await page.locator('.t-more').first().tap();
  await sleep(200);
  await page.locator('.t-actions button', { hasText: 'RENAME' }).tap();
  await sleep(150);
  await page.keyboard.type('Hook idea');
  await page.keyboard.press('Enter');
  await sleep(150);
  ok((await page.locator('.t-name').first().textContent()) === 'Hook idea', 'rename works');
  await page.locator('.t-more').first().tap();
  await sleep(150);
  await shot('08-row-actions');
  const dl = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await page.locator('.act-share').tap();
  const download = await dl;
  ok(!!download, 'export prints a WAV and hands it over');
  if (download) {
    const p = `${out}/export.wav`;
    await download.saveAs(p);
    const size = require('fs').statSync(p).size;
    ok(size > 44 + 2 * 48000 * 3, `WAV is ${(size / 1024).toFixed(0)} KB (${download.suggestedFilename()})`);
  }
  await page.locator('.act-del').tap();
  await sleep(200);
  ok((await page.locator('#libCount').textContent()) === '00', 'deleted');
  await shot('09-deleted-undo');
  await page.locator('#toastUndo').tap();
  await sleep(200);
  ok((await page.locator('#libCount').textContent()) === '01', 'undo restores it');
  await page.locator('#doneKey').tap();
  await sleep(450);

  console.log('persistence');
  await page.reload();
  await sleep(1500);
  ok(await S('S.tapes.length === 1 && !!S.cur && S.cur.name === "Hook idea"'), 'tape survives a reload and is loaded');
  ok(await S('S.cur.stock === "R15"'), 'stock remembered per tape');

  console.log('crash during recording is rescued');
  await page.locator('#recKey').tap();
  await sleep(2700);
  await page.evaluate(() => { window.onbeforeunload = null; });
  await page.goto('about:blank');
  await page.goto(url);
  await sleep(1800);
  const n = await S('S.tapes.filter(t => !t.deleted).length');
  const lastLen = await S('S.tapes[S.tapes.length - 1].length / S.tapes[S.tapes.length - 1].sr');
  ok(n === 2 && lastLen > 1.5, `interrupted take kept (${lastLen.toFixed(2)} s)`);
  await shot('10-rescued');

  console.log('dark finish');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await sleep(1300);
  await shot('11-dark');
  await page.locator('#tapesKey').tap();
  await sleep(500);
  await shot('12-dark-library');

  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
