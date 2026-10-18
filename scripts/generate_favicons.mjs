import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const svgPath = path.resolve('apps/web/public/icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Set transparent background HTML with the SVG
  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; display: flex; align-items: center; justify-content: center; }
    svg { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  await page.setContent(html);

  // 1. Generate 512x512 favicon.png
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  const png512 = await page.screenshot({ omitBackground: true, type: 'png' });
  fs.writeFileSync('apps/web/public/favicon.png', png512);
  console.log('✓ Generated apps/web/public/favicon.png (512x512)');

  // 2. Generate apple-touch-icon.png (180x180)
  await page.setViewport({ width: 180, height: 180, deviceScaleFactor: 1 });
  const png180 = await page.screenshot({ omitBackground: true, type: 'png' });
  fs.writeFileSync('apps/web/public/apple-touch-icon.png', png180);
  console.log('✓ Generated apps/web/public/apple-touch-icon.png (180x180)');

  // 3. Generate 32x32 PNG for ICO
  await page.setViewport({ width: 32, height: 32, deviceScaleFactor: 1 });
  const png32 = await page.screenshot({ omitBackground: true, type: 'png' });
  
  // Build standard ICO format containing the 32x32 PNG
  // Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  // Directory entry: 16 bytes
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(32, 0);  // Width
  dirEntry.writeUInt8(32, 1);  // Height
  dirEntry.writeUInt8(0, 2);   // Color palette
  dirEntry.writeUInt8(0, 3);   // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(png32.length, 8); // Image size
  dirEntry.writeUInt32LE(22, 12); // Image offset (6 + 16 = 22)

  const icoBuffer = Buffer.concat([header, dirEntry, png32]);
  fs.writeFileSync('apps/web/public/favicon.ico', icoBuffer);
  console.log('✓ Generated apps/web/public/favicon.ico (32x32 ICO)');

  await browser.close();
  console.log('All favicons successfully generated matching the AutoGTM Compass logo!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
