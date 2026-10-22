#!/usr/bin/env node
/* The headless check, in node, with no browser: loads js/rules.js (the same file the page uses) and runs BTRules.check().
   node tools/check.js                  shuttle physics, the shot solver, scoring, CPU rallies and the brother's return
   node tools/check.js --sabotage drag  proves it can fail: drag that pushes instead of slowing (also: score, lazy)
   node tools/check.js --n 3            three times the random cases
   Exit code 1 if anything failed. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console, Math, Date };
ctx.globalThis = ctx;
vm.createContext(ctx);
const f = 'js/rules.js';
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });

const args = process.argv.slice(2);
const flag = (name, d) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : d;
};
const t0 = Date.now();
const res = ctx.BTRules.check({ sabotage: flag('--sabotage', ''), n: +flag('--n', 1) });
res.seconds = +((Date.now() - t0) / 1000).toFixed(1);
console.log(JSON.stringify(res, null, 1));
console.log(res.ok ? 'CHECK PASSED' : `CHECK FAILED (${res.fails.length} problems)`);
process.exit(res.ok ? 0 : 1);
