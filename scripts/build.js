const fs = require('fs');
const path = require('path');

console.log('[BUILD] Generating official Sponsorship PDF...');
try {
  require('./generate-sponsorship-pdf');
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
  fs.copyFileSync(rootIndex, path.join(distDir, 'index.html'));
}

console.log('[BUILD] Successfully prepared dist output directory with static assets.');

// Bundle the installed PDF library so receipt downloads do not depend on a CDN.
fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
fs.copyFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js'), path.join(distDir, 'assets', 'jspdf.umd.min.js'));
