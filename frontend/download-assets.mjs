import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const assets = [
  { url: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=800&q=80', dest: 'public/images/categories/plumbing.jpg' },
  { url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&q=80', dest: 'public/images/categories/electrical.jpg' },
  { url: 'https://images.unsplash.com/photo-1599933311354-94939223793e?w=800&q=80', dest: 'public/images/categories/ac-service.jpg' },
  { url: 'https://images.unsplash.com/photo-1581578731522-9b7d7e84b744?w=800&q=80', dest: 'public/images/categories/cleaning.jpg' },
  { url: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=800&q=80', dest: 'public/images/categories/deep-clean.jpg' },
  { url: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=800&q=80', dest: 'public/images/categories/locksmith.jpg' },
  { url: 'https://images.unsplash.com/photo-1550628121-6a5d3062cb41?w=800&q=80', dest: 'public/images/categories/carpentry.jpg' },
  { url: 'https://images.unsplash.com/photo-1558002038-103792e17734?w=800&q=80', dest: 'public/images/categories/smart-tv.jpg' },
  { url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=800&q=80', dest: 'public/images/categories/painting.jpg' },
  { url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&q=80', dest: 'public/images/categories/appliance-repair.jpg' },
  { url: 'https://images.unsplash.com/photo-1461151304267-38535e770e79?w=800&q=80', dest: 'public/images/categories/smart-tv-repair.jpg' },
  { url: 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=800&q=80', dest: 'public/images/ev/ev-station-1.jpg' },
  { url: 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?w=800&q=80', dest: 'public/images/ev/ev-charging.jpg' },
  { url: 'https://images.unsplash.com/photo-1528190336454-13cd56b45b5a?w=800&q=80', dest: 'public/images/hero/hero-bg.jpg' }
];

async function download(url, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        console.error(`FAIL ${dest} HTTP ${res.statusCode}`);
        resolve(false);
        return;
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close();
        console.log(`OK ${dest}`);
        resolve(true);
      });
    }).on('error', (err) => {
      console.error(`ERROR ${dest}: ${err.message}`);
      resolve(false);
    });
  });
}

async function main() {
  for (const asset of assets) {
    await download(asset.url, asset.dest);
  }
}

main();
