const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const dir = __dirname + path.sep + 'svg';
const files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.svg'));

(async () => {
  for (const name of files) {
    const input = path.join(dir, name);
    const output = path.join(dir, name.replace(/\.svg$/i, '.png'));
    await sharp(input, { density: 300, limitInputPixels: false }).png({ compressionLevel: 9 }).toFile(output);
    process.stdout.write(`${name} -> ${path.basename(output)}\n`);
  }
})().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error));
  process.exitCode = 1;
});
