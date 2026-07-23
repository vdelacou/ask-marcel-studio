// One-shot driver for Ask Marcel Studio: launch the BUILT app, start a fresh
// conversation, optionally pin a model, send one question, wait for the agent to
// finish, dump the full thread text + a screenshot, quit. See SKILL.md alongside.
//
// Usage:  node .claude/skills/run-studio/driver.mjs '<question>' <tag>
// Env:    MODEL_LABEL  exact label from the composer model picker (optional)
//         RUN_DIR      output dir (default <tmpdir>/ask-marcel-studio-runs)
//
// Exit codes: 2 UI never became ready, 3 no clean fresh thread, 4 send failed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const OUT_DIR = process.env.RUN_DIR || path.join(os.tmpdir(), 'ask-marcel-studio-runs');
const QUESTION = process.argv[2] || 'Who is the CIO of Celine?';
const TAG = process.argv[3] || `run-${Date.now()}`;
const CAP_MS = 480_000;

const require = createRequire(path.join(APP_DIR, 'package.json'));
const { _electron } = require('playwright-core');

fs.mkdirSync(OUT_DIR, { recursive: true });
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

const app = await _electron.launch({
  executablePath: path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: [APP_DIR],
  timeout: 45_000,
});
log('launched');

let page = null;
for (let i = 0; i < 45 && !page; i++) {
  for (const w of app.windows()) {
    if (w.url().startsWith('devtools')) continue;
    try {
      if ((await w.locator('textarea[aria-label="Message"]').count()) > 0) { page = w; break; }
    } catch { /* window still booting */ }
  }
  if (!page) await new Promise((r) => setTimeout(r, 1000));
}
if (!page) {
  for (const w of app.windows()) {
    log('window:', w.url());
    try {
      log((await w.evaluate(() => document.body.innerText)).slice(0, 800));
      await w.screenshot({ path: path.join(OUT_DIR, `${TAG}-notready.png`) });
    } catch { /* ignore */ }
  }
  await app.close();
  process.exit(2);
}
log('ui ready:', page.url());

// The memory-elicitation dialog persists across launches and its overlay blocks the
// composer; dismiss every queued one before touching the UI.
for (let i = 0; i < 8; i++) {
  const dismissed = await page.evaluate(() => {
    const overlay = document.querySelector('div.fixed.inset-0');
    if (!overlay) return 'NONE';
    const btns = [...overlay.querySelectorAll('button')];
    const skip = btns.find((b) => b.textContent?.trim() === 'Skip')
      ?? btns.find((b) => b.textContent?.trim() === 'Not now');
    if (!skip) return 'NO_BUTTON';
    skip.click();
    return 'CLICKED:' + skip.textContent.trim();
  });
  if (dismissed === 'NONE') break;
  log('overlay:', dismissed);
  if (dismissed === 'NO_BUTTON') {
    await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-overlay.png`) });
    break;
  }
  await new Promise((r) => setTimeout(r, 1200));
}

const bodyText = () => page.evaluate(() => document.body.innerText);
let fresh = false;
for (let i = 0; i < 3 && !fresh; i++) {
  const clicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, [role="button"]')];
    const el = els.find((e) => e.textContent?.trim().includes('New conversation'));
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'OK';
  });
  await new Promise((r) => setTimeout(r, 1500));
  const t = await bodyText();
  fresh = !t.includes('Done') && !t.includes("Didn't work");
  log(`new-conversation attempt ${i + 1}: click=${clicked} fresh=${fresh}`);
}
if (!fresh) {
  log('FATAL: could not reach a clean thread');
  await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-notfresh.png`) });
  await app.close();
  process.exit(3);
}

const MODEL = process.env.MODEL_LABEL || '';
if (MODEL) {
  try {
    await page.selectOption('select[aria-label="Model for this conversation"]', { label: MODEL });
    log('model set:', MODEL);
  } catch (e) {
    log('model select FAILED:', e.message);
  }
  await new Promise((r) => setTimeout(r, 800));
}

const preCount = (await bodyText()).split(QUESTION).length - 1;
await page.locator('textarea[aria-label="Message"]').click();
await page.keyboard.type(QUESTION, { delay: 15 });

const sendSel = 'button[aria-label="Send"]:not([disabled])';
const stopSel = 'button[aria-label="Stop"]';
let started = false;
for (let attempt = 1; attempt <= 2 && !started; attempt++) {
  try {
    await page.waitForSelector(sendSel, { timeout: 10_000 });
  } catch {
    log('send button never enabled (attempt', attempt, ')');
    continue;
  }
  await page.locator(sendSel).click();
  for (let i = 0; i < 20 && !started; i++) {
    if ((await page.locator(stopSel).count()) > 0) started = true;
    else await new Promise((r) => setTimeout(r, 1000));
  }
  log(`send attempt ${attempt}: started=${started}`);
}
const postCount = (await bodyText()).split(QUESTION).length - 1;
log('question bubbles: pre=', preCount, 'post=', postCount);
if (!started || postCount !== preCount + 1) {
  log('FATAL: turn did not start cleanly');
  await page.screenshot({ path: path.join(OUT_DIR, `${TAG}-sendfail.png`) });
  await app.close();
  process.exit(4);
}

// The Stop button flickers between agent steps: only 4 consecutive absent polls
// (~6 s) count as finished, or the dump catches a half-done thread and closing the
// app kills the turn.
const t0 = Date.now();
let lastNote = 0;
let goneStreak = 0;
while (Date.now() - t0 < CAP_MS) {
  const running = (await page.locator(stopSel).count()) > 0;
  if (running) {
    started = true;
    goneStreak = 0;
  } else if (started) {
    goneStreak++;
    if (goneStreak >= 4) break;
  }
  if (Date.now() - lastNote > 30_000) {
    lastNote = Date.now();
    log('still running,', Math.round((Date.now() - t0) / 1000), 's');
  }
  await new Promise((r) => setTimeout(r, 1500));
}
log('finished after', Math.round((Date.now() - t0) / 1000), 's');
await new Promise((r) => setTimeout(r, 2500));

const text = await page.evaluate(() => document.body.innerText);
fs.writeFileSync(path.join(OUT_DIR, `${TAG}.txt`), text);
await page.screenshot({ path: path.join(OUT_DIR, `${TAG}.png`) });
log('dumped:', path.join(OUT_DIR, `${TAG}.txt`));
console.log('----TAIL----');
console.log(text.slice(-2600));
await app.close();
