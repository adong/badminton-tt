#!/usr/bin/env node
/* Screenshots with headless Chrome over the DevTools protocol (node 22's built-in WebSocket, no npm).
   node tools/shoot.js [steps.json] [outdir] [width height mobile]
   Defaults: tools/shots.json, docs/, 1280 x 800. Serve ~/claude-games first (the preview server on port 8841), or set
   URL=... Each step may have js (run in the page, using the window.game hooks), click [x, y] or clickAt (an
   expression giving [x, y]) / keys / hold (real input, after the js),
   wait (ms) and shot (file name).
   From TT Dots & Boxes via TT Spot the Difference. docs/screenshot.jpg: node tools/shoot.js tools/shots.json docs 1200 750 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const [stepsFile = path.join(__dirname, 'shots.json'), outDir = path.join(dir, 'docs'), W = '1280', H = '800', mobile = '0'] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(require('os').tmpdir(), 'badmintontt-chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VK = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, ' ': 32, Escape: 27, Tab: 9 };

(async () => {
  let ws;
  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); }
    }
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map(), logs = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') {
        const x = d.params.exceptionDetails;
        logs.push('EXC ' + ((x.exception && x.exception.description) || x.text) + (x.url ? ` (${x.url.split('/').pop()}:${x.lineNumber + 1})` : ''));
      }
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map((a) => a.value || a.description).join(' '));
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: mobile === '1' });
    if (mobile === '1') await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url: process.env.URL || 'http://localhost:8841/badminton-tt/' });
    await sleep(4000);
    for (const s of steps) {
      if (s.size) await send('Emulation.setDeviceMetricsOverride', { width: s.size[0], height: s.size[1], deviceScaleFactor: 1, mobile: false });
      if (s.js) {
        const r = await send('Runtime.evaluate', { expression: s.js, awaitPromise: true, returnByValue: true });
        const v = r.result && r.result.result ? r.result.result.value : r;
        console.log((s.label || s.shot || 'js') + ':', typeof v === 'string' ? v : JSON.stringify(v));
      }
      // real input through Chrome: click [x, y] (a mouse press and release), keys ['ArrowRight', ...] (down then up),
      // hold { key, ms } (a key held down for a while)
      let at = s.click;
      if (s.clickAt) { // an expression in the page that gives [x, y]
        const r = await send('Runtime.evaluate', { expression: s.clickAt, returnByValue: true });
        at = r.result.result.value;
        console.log((s.label || 'click') + ' at', JSON.stringify(at));
      }
      if (at) {
        for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 });
      }
      for (const key of s.keys || []) {
        const code = key.length === 1 ? 'Key' + key.toUpperCase() : key;
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key.length === 1 ? key : undefined, windowsVirtualKeyCode: VK[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: VK[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) });
      }
      if (s.hold) {
        const k = s.hold.key, one = k.length === 1;
        const vk = VK[k] || (one ? k.toUpperCase().charCodeAt(0) : 0), code = one ? 'Key' + k.toUpperCase() : k;
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk });
        await sleep(s.hold.ms);
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
      }
      if (s.wait) await sleep(s.wait);
      if (s.shot) {
        const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
        fs.writeFileSync(path.join(outDir, s.shot + '.jpg'), Buffer.from(r.result.data, 'base64'));
        console.log('saved', s.shot);
      }
    }
    if (logs.length) console.log('page errors:\n' + logs.join('\n'));
  } catch (e) {
    console.error(e);
  } finally {
    try { ws && ws.close(); } catch (e) { /* closed */ }
    await new Promise((r) => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 3000); });
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp folder, the OS cleans it */ }
  }
})();
