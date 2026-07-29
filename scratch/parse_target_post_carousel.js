const fs = require('fs');

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

const targetIndex = 567731;
const snippet = html.substring(targetIndex - 100, targetIndex + 10000);

console.log('Snippet length:', snippet.length);

// Look for carousel_media inside this node!
function decodeHtmlEntities(str) {
  return str
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, "'");
}

const carouselMatch = snippet.match(/"carousel_media"\s*:\s*\[([\s\S]*?)\]\s*,\s*"carousel_media_count"/);
if (carouselMatch) {
  console.log('\nFOUND CAROUSEL_MEDIA FOR Da-My7Ckn9R!');
  const urls = [...carouselMatch[1].matchAll(/"url"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));
  const seen = new Set();
  const carouselImages = [];
  urls.forEach(u => {
    const norm = u.split('?')[0];
    if (!seen.has(norm) && u.startsWith('http')) {
      seen.add(norm);
      carouselImages.push(u);
    }
  });
  console.log('Total carousel images for post Da-My7Ckn9R:', carouselImages.length);
  carouselImages.forEach((u, i) => console.log(`[Slide ${i+1}]`, u.substring(0, 120)));
} else {
  console.log('Searching for display_url or candidates in post Da-My7Ckn9R snippet...');
  const urls = [...snippet.matchAll(/"url"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));
  console.log('Total URLs found in snippet:', urls.length);
}
