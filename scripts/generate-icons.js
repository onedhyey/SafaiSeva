import fs from 'fs';
import path from 'path';

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Master SVG template for the SafaiSeva emblem
function createSvg({ size = 512, isMaskable = false, isAppleTouch = false, isFavicon = false }) {
  let scale = 0.72;
  let tx = 14;
  let ty = 14;
  let rx = 24;
  let bgFill = '#080E0B';
  let showBg = true;

  if (isMaskable) {
    scale = 0.60;
    tx = 20;
    ty = 20;
    rx = 0; // full bleed square for maskable Android adaptive icon safe zone
  } else if (isAppleTouch) {
    scale = 0.68;
    tx = 16;
    ty = 16;
    rx = 0; // iOS applies its own squircle mask to the canvas
  } else if (isFavicon) {
    scale = 0.82;
    tx = 9;
    ty = 9;
    rx = 22;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34D399" />
      <stop offset="50%" stop-color="#10B981" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E1A14" />
      <stop offset="100%" stop-color="#060C09" />
    </linearGradient>
    <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#10B981" flood-opacity="0.25" />
    </filter>
    <mask id="ss-mask">
      <!-- Base shape of the mark -->
      <rect width="100" height="100" rx="22" fill="#FFFFFF"/>
      
      <!-- Primary diagonal track 1 -->
      <path d="M 33 0 L 43 0 L 43 32 C 43 36 46 40 50 44 L 68 62 C 72 66 74 70 74 76 L 74 100 L 64 100 L 64 76 C 64 72 62 68 58 64 L 40 46 C 35 41 33 37 33 32 Z" fill="#000000"/>
      
      <!-- Track 2 (Upper right branch) -->
      <path d="M 58 0 L 68 0 L 68 32 C 68 36 71 40 75 44 L 92 61 C 97 66 100 71 100 78 L 100 88 C 100 88 95 78 88 71 L 78 61 C 75 58 73 54 73 50 L 73 32 C 73 24 67 18 58 0 Z" fill="#000000"/>
      
      <!-- Track 3 (Lower left branch) -->
      <path d="M 0 22 C 0 22 5 32 12 39 L 22 49 C 25 52 27 56 27 60 L 27 76 C 27 84 33 90 42 100 L 32 100 L 32 76 C 32 72 29 68 25 64 L 8 47 C 3 42 0 37 0 30 Z" fill="#000000"/>
    </mask>
  </defs>
  
  <!-- Background Canvas -->
  ${showBg ? `<rect width="100" height="100" rx="${rx}" fill="url(#bgGrad)" />` : ''}
  
  <!-- Outer subtle border for standard icons -->
  ${!isMaskable && !isAppleTouch ? `<rect width="98" height="98" x="1" y="1" rx="${rx}" fill="none" stroke="#10B981" stroke-width="1.5" stroke-opacity="0.3" />` : ''}

  <!-- SafaiSeva SS Monogram -->
  <g transform="translate(${tx}, ${ty}) scale(${scale})" filter="${isFavicon ? 'none' : 'url(#subtleGlow)'}">
    <rect width="100" height="100" rx="22" fill="url(#emeraldGrad)" mask="url(#ss-mask)"/>
  </g>
</svg>`;
}

async function generateAll() {
  let sharpModule;
  try {
    const imported = await import('sharp');
    sharpModule = imported.default || imported;
  } catch {
    console.warn('Optional package "sharp" is not installed. Icon PNG generation skipped. SVG favicon updated.');
    const faviconSvg = createSvg({ size: 100, isFavicon: true });
    fs.writeFileSync(path.join(outDir, 'favicon.svg'), faviconSvg);
    return;
  }

  const sharp = sharpModule;
  console.log('Generating SafaiSeva icons and assets with sharp...');

  // 1. Favicon SVG
  const faviconSvg = createSvg({ size: 100, isFavicon: true });
  fs.writeFileSync(path.join(outDir, 'favicon.svg'), faviconSvg);

  // 2. High-res PWA Icon 512x512
  const svg512 = createSvg({ size: 512, isMaskable: false });
  await sharp(Buffer.from(svg512))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-512.png'));

  // 3. Maskable PWA Icon 512x512
  const svg512Maskable = createSvg({ size: 512, isMaskable: true });
  await sharp(Buffer.from(svg512Maskable))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-512-maskable.png'));

  // 4. Standard PWA Icon 192x192
  const svg192 = createSvg({ size: 192, isMaskable: false });
  await sharp(Buffer.from(svg192))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-192.png'));

  // 4b. Maskable PWA Icon 192x192
  const svg192Maskable = createSvg({ size: 192, isMaskable: true });
  await sharp(Buffer.from(svg192Maskable))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-192-maskable.png'));

  // 5. Apple Touch Icon 180x180 (iOS Home Screen)
  const svgApple = createSvg({ size: 180, isAppleTouch: true });
  await sharp(Buffer.from(svgApple))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'apple-touch-icon.png'));
  
  // Duplicate standard apple touch size variants for older WebKit devices
  await sharp(Buffer.from(svgApple))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'apple-touch-icon-precomposed.png'));

  // 6. Additional icon sizes for optimal desktop & tablet PWA installations
  const svg384 = createSvg({ size: 384, isMaskable: false });
  await sharp(Buffer.from(svg384))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-384.png'));

  const svg144 = createSvg({ size: 144, isMaskable: false });
  await sharp(Buffer.from(svg144))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-144.png'));

  const svg96 = createSvg({ size: 96, isMaskable: false });
  await sharp(Buffer.from(svg96))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-96.png'));

  const svg72 = createSvg({ size: 72, isMaskable: false });
  await sharp(Buffer.from(svg72))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-72.png'));

  const svg48 = createSvg({ size: 48, isMaskable: false });
  await sharp(Buffer.from(svg48))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-48.png'));

  const svg32 = createSvg({ size: 32, isFavicon: true });
  await sharp(Buffer.from(svg32))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-32.png'));

  const svg16 = createSvg({ size: 16, isFavicon: true });
  await sharp(Buffer.from(svg16))
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(outDir, 'icon-16.png'));

  // 7. Favicon.ico fallback (as standard 32x32 PNG)
  await sharp(Buffer.from(svg32))
    .png()
    .toFile(path.join(outDir, 'favicon.ico'));

  console.log('All SafaiSeva PWA and Apple Touch icons generated successfully!');
}

generateAll().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
