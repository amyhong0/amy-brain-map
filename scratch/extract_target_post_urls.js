const fs = require('fs');

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

const targetIndex = 567731;
const snippet = html.substring(targetIndex - 100, targetIndex + 25000);

function decodeHtmlEntities(str) {
  return str
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, "'");
}

const urls = [...snippet.matchAll(/"url"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));
const seen = new Set();
const targetImages = [];
urls.forEach(u => {
  const norm = u.split('?')[0];
  if (!seen.has(norm) && u.startsWith('http') && u.includes('/v/t51.')) {
    seen.add(norm);
    targetImages.push(u);
  }
});

console.log('Target post Da-My7Ckn9R unique image URLs count:', targetImages.length);
targetImages.forEach((u, i) => console.log(`[Target Slide ${i+1}]`, u.substring(0, 100)));
