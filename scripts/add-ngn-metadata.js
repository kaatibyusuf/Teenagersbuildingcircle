#!/usr/bin/env node
'use strict';
/* Makes the card payments safe for cards billed in another currency (cedis, dollars, pounds...).
   Each checkout now records, in the payment's metadata, the naira amount it charged ("ngn"), and the webhook passes it on to
   Apps Script, which credits that naira amount. Run from the project root:  node scripts/add-ngn-metadata.js
   Each file is changed only if its spot is found; otherwise it is left alone and named. Safe to run twice. */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'frontend', 'api');
const JOBS = [
  ['placement-checkout.mjs', "metadata: { kind: 'placement',", "metadata: { ngn: String(FEE), kind: 'placement',"],
  ['fees-checkout.mjs', "metadata: { kind: 'fee',", "metadata: { ngn: String(amount), kind: 'fee',"],
  ['bootcamp-checkout.mjs', 'metadata: {\n', 'metadata: {\n      ngn: String(amount),   // the naira price; used when the card is charged in another currency\n'],
  ['guide-checkout.mjs', 'metadata: {\n', 'metadata: {\n      ngn: String(amount),   // the naira price; used when the card is charged in another currency\n'],
  ['sponsor-checkout.mjs', 'metadata: {\n', 'metadata: {\n      ngn: String(amount),   // the naira amount; used when the card is charged in another currency\n'],
  ['bachs-webhook.mjs', "    currency: d.currency || '',\n", "    currency: d.currency || '',\n    ngn: meta.ngn || '',               // the naira price we charged, for cards billed in another currency\n"]
];
for (const [name, from, to] of JOBS) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) { console.log(name + ': not found, skipped.'); continue; }
  const s = fs.readFileSync(file, 'utf8');
  if (/\bngn\b/.test(s)) { console.log(name + ': already done.'); continue; }
  if (s.split(from).length !== 2) { console.log(name + ': NOT changed (could not find the spot). Send me the file and I will fit it.'); continue; }
  fs.writeFileSync(file, s.replace(from, () => to));
  console.log(name + ': done.');
}
