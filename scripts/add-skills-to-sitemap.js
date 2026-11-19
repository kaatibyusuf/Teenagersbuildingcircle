// Adds the eight Skills Schools course pages to frontend/sitemap.xml. Safe to run twice.
// Run from the project root:  node scripts/add-skills-to-sitemap.js
const fs = require('fs'), path = require('path');
const file = path.join('frontend', 'sitemap.xml');
if (!fs.existsSync(file)) { console.error('Run this from the project root (the folder that contains "frontend"). Could not find ' + file); process.exit(1); }
let x = fs.readFileSync(file, 'utf8');
const slugs = ['cybersecurity', 'web-development', 'software-engineering', 'product-management', 'product-design', 'graphic-design', 'ui-ux', 'video-creation'];
const day = new Date().toISOString().slice(0, 10);
let added = 0, lines = '';
for (const s of slugs) {
  const loc = 'https://www.himaayahschools.com/skills-school/' + s;
  if (x.includes('<loc>' + loc + '</loc>')) continue;
  lines += '  <url><loc>' + loc + '</loc><lastmod>' + day + '</lastmod><priority>0.8</priority></url>\n'; added++;
}
if (!added) { console.log('Already in the sitemap. Nothing to do.'); process.exit(0); }
if (!x.includes('</urlset>')) { console.error('sitemap.xml has no </urlset>. Nothing changed.'); process.exit(1); }
x = x.replace('</urlset>', lines + '</urlset>');
fs.writeFileSync(file, x);
console.log('Added ' + added + ' course pages to frontend/sitemap.xml');
