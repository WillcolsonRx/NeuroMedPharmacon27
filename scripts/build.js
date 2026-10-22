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
  fs.cpSync(publicDir, distDir, { recursive: true });
}

// Ensure root index.html is copied to dist/index.html
if (fs.existsSync(rootIndex)) {
  fs.copyFileSync(rootIndex, path.join(distDir, 'index.html'));
}

console.log('[BUILD] Successfully prepared dist output directory with static assets.');
