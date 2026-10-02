// Cuts the monster avatars out of the portrait sheets in art/references/.
// Reads art/portraits/portraits.json and writes art/portraits/<id>.png
// (exactly size × size, square, frame removed). The sheets are never modified.
//
// Dev tool only (the game just loads the PNGs). It needs the `sharp` image
// library, which is not a project dependency:
//   npm install --no-save sharp
//   node tools/extract-portraits.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'art/portraits/portraits.json'), 'utf8'));

for (const p of manifest.portraits) {
  const [left, top, width, height] = p.crop;
  if (width !== height) throw new Error(`${p.id}: crop must be square`);
  await sharp(join(root, 'art/references', p.sheet))
    .extract({ left, top, width, height })
    // Crops are ~220 px; lanczos keeps the slight upscale to 256 px clean.
    .resize(manifest.size, manifest.size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(join(root, 'art/portraits', `${p.id}.png`));
  console.log(`${p.id}.png`);
}
