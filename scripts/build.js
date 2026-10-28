const fs = require('fs');
const path = require('path');

console.log('[BUILD] Generating current conference documents...');
try {
  require('./generate-sponsorship-pdf');
  require('./generate-guidelines-pdf');
} catch (err) {
  console.warn('[BUILD] PDF generation warning:', err.message);
}

console.log('[BUILD] Preparing dist output directory for Vercel...');
const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const rootIndex = path.join(__dirname, '..', 'index.html');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy public directory to dist
if (fs.existsSync(publicDir)) {
  // Payment evidence must never be published as static website assets.
  fs.rmSync(path.join(distDir, 'uploads'), { recursive: true, force: true });
  fs.cpSync(publicDir, distDir, {
    recursive: true,
    filter: source => source !== path.join(publicDir, 'uploads')
  });
}

// Ensure root index.html is copied to dist/index.html
if (fs.existsSync(rootIndex)) {
  const { renderTracks, renderBrochure } = require('./render-tracks');
  const { renderSpeakers } = require('./render-speakers');
  fs.writeFileSync(path.join(distDir, 'index.html'), renderSpeakers(renderTracks(fs.readFileSync(rootIndex, 'utf8'))));
  const downloads = path.join(distDir, 'downloads');
  if (fs.existsSync(downloads)) {
    for (const file of fs.readdirSync(downloads)) {
      if (file.endsWith('2027_Brochure.txt')) {
        const target = path.join(downloads, file);
        fs.writeFileSync(target, renderBrochure(fs.readFileSync(target, 'utf8')));
      }
    }
  }
}

console.log('[BUILD] Successfully prepared dist output directory with static assets.');

// Bundle the installed PDF library so receipt downloads do not depend on a CDN.
fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
fs.copyFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'), path.join(distDir, 'assets', 'jspdf.umd.min.js'));

// Provide the recovery URL as a real nested page as well as a clean-URL rewrite.
// Supabase emails may already contain this path, so keep it stable.
const recoveryDir = path.join(distDir, 'secretariat');
fs.mkdirSync(recoveryDir, { recursive: true });
fs.copyFileSync(path.join(publicDir, 'secretariat-reset.html'), path.join(recoveryDir, 'reset.html'));

const legacyDownloads = {
  'IPS_NorthZone_Abstract_Guidelines_2027.pdf': 'NeuroMet_Pharmacon_2027_Abstract_Guidelines.pdf',
  'IPS_NorthZone_Abstract_Template_2027.pdf': 'NeuroMet_Pharmacon_2027_Abstract_Template.pdf',
  'IPS_NorthZone_Sponsorship_Prospectus_2027.pdf': 'NeuroMet_Pharmacon_2027_Sponsorship_Prospectus.pdf'
};
for (const [legacy, current] of Object.entries(legacyDownloads)) {
  const source = path.join(distDir, 'downloads', current);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(distDir, 'downloads', legacy));
}
