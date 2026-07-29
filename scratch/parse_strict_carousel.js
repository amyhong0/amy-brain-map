const fs = require('fs');

function decodeHtmlEntities(str) {
  return str
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, "'");
}

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

const match = html.match(/"carousel_media"\s*:\s*\[([\s\S]*?)\]\s*,\s*"carousel_media_count"/);
if (match) {
  const content = match[1];
  console.log('carousel_media length:', content.length);
  const urls = [...content.matchAll(/"url"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));
  console.log('URLs in carousel_media:', urls.length);
  const seen = new Set();
  const carouselImages = [];
  urls.forEach(u => {
    const norm = u.split('?')[0];
    if (!seen.has(norm) && u.startsWith('http')) {
      seen.add(norm);
      carouselImages.push(u);
    }
  });
  console.log('Unique carousel images:', carouselImages.length);
  carouselImages.forEach((u, i) => console.log(`[Carousel Image ${i+1}]`, u.substring(0, 100)));
} else {
  console.log('carousel_media pattern not matched, trying relaxed search...');
  const idx = html.indexOf('carousel_media');
  if (idx !== -1) {
    console.log('Found carousel_media at index:', idx);
    const snippet = html.substring(idx, idx + 2000);
    console.log('Snippet:\n', snippet);
  }
}
