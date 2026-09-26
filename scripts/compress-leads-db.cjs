const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const src = 'data/leads.db';
const dest = 'data/leads.db.gz';

if (!fs.existsSync(src)) {
  console.error("data/leads.db does not exist!");
  process.exit(1);
}

console.log("Compressing data/leads.db -> data/leads.db.gz...");
const t0 = Date.now();

const readStream = fs.createReadStream(src);
const writeStream = fs.createWriteStream(dest);
const gzip = zlib.createGzip({ level: 6 });

readStream.pipe(gzip).pipe(writeStream).on('finish', () => {
  const stat = fs.statSync(dest);
  console.log(`Finished in ${((Date.now() - t0)/1000).toFixed(1)}s! Compressed size: ${(stat.size / (1024*1024)).toFixed(2)} MB`);
});
