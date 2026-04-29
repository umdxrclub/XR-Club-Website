import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { STATIONS } from '../src/lib/demoday.ts';

const BASE = process.env.QR_BASE || 'https://xr.umd.edu';
const OUT = path.resolve('qrs');

await fs.mkdir(OUT, { recursive: true });

for (let i = 0; i < STATIONS.length; i++) {
  const s = STATIONS[i];
  const url = `${BASE}/demoday/scan?s=${s.token}`;
  const num = String(i + 1).padStart(2, '0');
  const file = path.join(OUT, `${num}-${s.slug}.png`);
  await QRCode.toFile(file, url, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 1024,
    color: { dark: '#000000', light: '#ffffff' },
  });
  console.log(`${num}  ${s.name.padEnd(28)} ${url}`);
}
console.log(`\nWrote ${STATIONS.length} QR codes to ${OUT}`);
