// Screens 390×844 @2x of the robot states in the local preview (vite 5200 → API 3200).
// thinking/speaking: /assistant/chat is intercepted in the browser only (held, then a mock "ПРИМЕР" reply).
const puppeteer = require('/workspace/levex_design/icons3/work/node_modules/puppeteer-core');
const fs = require('fs');
const OUT = '/workspace/levex_out/robot15';
const URL = 'http://127.0.0.1:5200/';
const REPLY = 'ПРИМЕР: Давай начнём с Мастерской. Открой миссию и сделай первый маленький шаг — 10 минут. За выполненную миссию появятся отметки активности.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(b, { reduce = false, fresh = true } = {}) {
  const pg = await b.newPage();
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (reduce) await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await pg.setRequestInterception(true);
  pg._hold = null;
  pg.on('request', (req) => {
    if (req.url().endsWith('/assistant/chat') && req.method() === 'POST') {
      pg._hold = () => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: REPLY, source: 'ok' }) });
      return;
    }
    req.continue();
  });
  await pg.goto(URL, { waitUntil: 'networkidle0' });
  if (fresh) { await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle0' }); }
  await pg.waitForSelector('.map-robot');
  await pg.evaluateHandle('document.fonts.ready');
  await sleep(600);
  return pg;
}
const shot = async (pg, name) => { await pg.screenshot({ path: `${OUT}/${name}.png` }); console.log(name); };

async function frames(pg, name, clip, n = 30, step = 80) {
  const dir = `${OUT}/frames/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const list = []; let prev = Date.now();
  for (let i = 0; i < n; i++) {
    const f = `${dir}/${String(i).padStart(3, '0')}.png`;
    await pg.screenshot({ path: f, clip });
    const now = Date.now(); list.push([f, Math.max(step, now - prev)]); prev = now;
    const left = step - (Date.now() - now); if (left > 0) await sleep(left);
  }
  // concat list for ffmpeg, real durations
  fs.writeFileSync(`${dir}/list.txt`, list.map(([f, d], i) => `file '${f}'\nduration ${(list[i + 1]?.[1] ?? d) / 1000}`).join('\n') + `\nfile '${list.at(-1)[0]}'\n`);
}

(async () => {
  const b = await puppeteer.launch({ executablePath: '/opt/google/chrome/chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'] });
  const pg = await page(b);
  await shot(pg, '01_home_marker_390x844');
  const r = await pg.$eval('.map-robot', (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y }; });
  const mapClip = { x: Math.max(0, r.x - 60), y: r.y - 70, width: 170, height: 190 };
  await frames(pg, 'map_marker', mapClip, 32);
  await pg.click('.map-robot');
  await pg.waitForSelector('.lx-chat-root'); await sleep(700);
  await shot(pg, '03_chat_idle_390x844');
  const headClip = await pg.$eval('.lx-chat__head', (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y - 6, width: Math.min(b.width, 260), height: b.height + 10 }; });
  await pg.type('.lx-chat__field', 'ПРИМЕР: с чего начать сегодня?', { delay: 15 });
  await sleep(500);
  await shot(pg, '04_chat_listening_390x844');
  await frames(pg, 'chat_listening', headClip, 24);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('.lx-typing'); await sleep(700);
  await shot(pg, '05_chat_thinking_390x844');
  await frames(pg, 'chat_thinking', headClip, 24);
  pg._hold();
  await pg.waitForFunction(() => document.querySelector('.lx-chat-root')?.dataset.robotState === 'speaking');
  await pg.evaluate(() => document.activeElement?.blur()); await sleep(700);
  await shot(pg, '06_chat_speaking_390x844');
  await frames(pg, 'chat_speaking', headClip, 24);
  await pg.keyboard.press('Escape'); await pg.evaluate(() => document.activeElement?.blur()); await sleep(600);
  await shot(pg, '02_home_no_marker_390x844');
  await frames(pg, 'map_idle', mapClip, 32);
  const stored = await pg.evaluate(() => localStorage.getItem('levex.assistant.chatOpened'));
  console.log('localStorage', stored);
  await pg.reload({ waitUntil: 'networkidle0' }); await sleep(600);
  console.log('marker after reload', await pg.$('.map-robot__marker'));
  await pg.close();

  const rm = await page(b, { reduce: true });
  await shot(rm, '07_reduced_motion_home_390x844');
  console.log('rm srcs', await rm.$$eval('.map-robot img', (a) => a.map((i) => i.getAttribute('src'))));
  await rm.click('.map-robot'); await rm.waitForSelector('.lx-chat-root'); await sleep(600);
  await rm.type('.lx-chat__field', 'ПРИМЕР: что сделать сегодня?'); await rm.keyboard.press('Enter');
  await rm.waitForSelector('.lx-typing'); await sleep(500);
  await shot(rm, '08_reduced_motion_chat_thinking_390x844');
  console.log('rm chat srcs', await rm.$$eval('.lx-chat img', (a) => a.map((i) => i.getAttribute('src'))));
  rm._hold();
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
