#!/usr/bin/env node
/* Update the Apps Script project from the backend/ folder, without copy-paste.
 *
 *   node scripts/deploy-backend.js                     look only: shows what would change
 *   node scripts/deploy-backend.js --push              upload the changes to Apps Script
 *   node scripts/deploy-backend.js --push --skip=Skills,Other     leave out the named files
 *   node scripts/deploy-backend.js --push --deploy=DEPLOYMENT_ID --desc="what changed"
 *                                                      also publish a new version to the live web app
 *
 * Needs clasp logged in as the account that owns the script (clasp login).
 * Every run first saves a fresh copy of what is in Apps Script now, next to the project folder
 * (appsscript-backup-DATE), so nothing is ever lost. Files that exist only in Apps Script are kept.
 */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const SCRIPT_ID = '19UQOutP_1hozWVb31qwlsrbOL8afN5BCOn444E8LuEdBC6EgsTnBDLwp';
const args = process.argv.slice(2);
const PUSH = args.includes('--push');
const arg = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3).replace(/^"|"$/g, '') : ''; };
const SKIP = arg('skip').toLowerCase().split(',').filter(Boolean).map(x => x.replace(/\.(js|gs)$/i, ''));
const DEPLOY = arg('deploy'), DESC = arg('desc') || 'Update from backend folder';

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'backend');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const backup = path.join(root, '..', 'appsscript-backup-' + stamp);
const stage = path.join(os.tmpdir(), 'gas-stage-' + stamp);

const run = (cmd, cwd) => cp.execSync(cmd, { cwd: cwd, stdio: 'pipe', shell: true }).toString();
const read = f => fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
const norm = t => t.replace(/\r\n/g, '\n').trimEnd();
const key = f => f.replace(/\.(js|gs)$/i, '').toLowerCase().replace('pcak', 'pack').replace('examthaniy', 'examseedthaniy');   // two files are named differently in Apps Script ("Pcak11", "ExamThaniy2")

function fail(msg) { console.error('\n' + msg + '\n'); process.exit(1); }

if (!fs.existsSync(src)) fail('Run this from the project: the backend folder was not found at ' + src);
fs.mkdirSync(backup, { recursive: true });
console.log('Saving a copy of what is in Apps Script now to: ' + backup);
try { run('clasp clone ' + SCRIPT_ID, backup); }
catch (e) { fail('clasp could not read the project:\n' + String(e.stderr || e.message).trim() + '\nCheck: clasp login (as the account that owns the script).'); }

if (!fs.existsSync(path.join(backup, 'appsscript.json'))) fail('clasp did not download the project (the copy in ' + backup + ' is empty), so nothing was uploaded.\nThe usual cause is an expired sign-in. Run: clasp logout   then: clasp login   (as abdulsamad@himaayahschools.com), then run this again.');
fs.rmSync(stage, { recursive: true, force: true });
fs.cpSync(backup, stage, { recursive: true });

const isCode = f => /\.(js|gs)$/i.test(f) && f !== 'appsscript.json';
const remote = {};
fs.readdirSync(backup).filter(isCode).forEach(f => { remote[key(f)] = f; });
const local = fs.readdirSync(src).filter(f => /\.gs$/i.test(f));

const changed = [], same = [], added = [], skipped = [], seen = new Set();
local.forEach(f => {
  const k = key(f); seen.add(k);
  if (SKIP.indexOf(f.replace(/\.gs$/i, '').toLowerCase()) >= 0) { skipped.push(f); return; }
  const text = read(path.join(src, f));
  if (remote[k]) {
    if (norm(read(path.join(backup, remote[k]))) === norm(text)) { same.push(f); return; }
    fs.writeFileSync(path.join(stage, remote[k]), text, 'utf8');
    changed.push(f);
  } else {
    fs.writeFileSync(path.join(stage, f.replace(/\.gs$/i, '.js')), text, 'utf8');
    added.push(f);
  }
});
const kept = Object.keys(remote).filter(k => !seen.has(k)).map(k => remote[k]);

const list = (t, a) => console.log('\n' + t + ' (' + a.length + ')' + (a.length ? ':\n  ' + a.join('\n  ') : ''));
list('Will be UPDATED in Apps Script', changed);
list('Will be ADDED as new files', added);
list('Skipped on request (--skip), left as in Apps Script', skipped);
console.log('\nUnchanged: ' + same.length + ' files');
list('Only in Apps Script (kept, not touched)', kept);

try {
  const man = JSON.parse(read(path.join(backup, 'appsscript.json')));
  if (man.oauthScopes && !man.oauthScopes.some(s => /gmail|mail\.google\.com/.test(s)))
    console.log('\nNOTE: appsscript.json lists its own permissions and none is for Gmail. Add "https://www.googleapis.com/auth/gmail.send" to oauthScopes, or emails fall back to the default sender.');
} catch (e) { /* no manifest to check */ }

if (!PUSH) {
  console.log('\nLook only: nothing was changed in Apps Script. To upload, run again with --push');
  process.exit(0);
}
if (!changed.length && !added.length) { console.log('\nNothing to upload: Apps Script already matches backend/.'); process.exit(0); }

console.log('\nUploading...');
try { run('clasp push -f', stage); } catch (e) { fail('Upload failed:\n' + String(e.stderr || e.message).trim()); }
console.log('Uploaded to the Apps Script editor.');
if (DEPLOY) {
  try { console.log(run('clasp deploy -i ' + DEPLOY + ' -d "' + DESC.replace(/"/g, '') + '"', stage).trim()); console.log('Live web app now uses the new version.'); }
  catch (e) { fail('Uploaded, but publishing failed:\n' + String(e.stderr || e.message).trim()); }
} else console.log('Not published yet. In Apps Script: Deploy > Manage deployments > New version (or rerun with --deploy=DEPLOYMENT_ID).');
