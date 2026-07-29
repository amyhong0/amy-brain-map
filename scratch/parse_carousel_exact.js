const fs = require('fs');

function decodeHtmlEntities(str) {
  return str
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, "'");
}

function parseInstagramPostCarousel(html, postUrl) {
  const shortcodeMatch = postUrl.match(/instagram\.com\/p\/([^\/\?]+)/);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';
  console.log('Shortcode:', shortcode);

  const occurrences = [...html.matchAll(new RegExp(`"code"\\s*:\\s*"${shortcode}"`, 'g'))];
  console.log(`Found ${occurrences.length} occurrences of shortcode "${shortcode}"`);

  let carouselBlock = '';

  // Look for the occurrence that has "carousel_media" shortly after it
  for (const m of occurrences) {
    const snippet = html.substring(m.index, m.index + 20000);
    const cMatch = snippet.match(/"carousel_media"\s*:\s*\[([\s\S]*?)\]\s*,\s*"caption"/);
    if (cMatch) {
      console.log('Found matching carousel_media block at index:', m.index);
      carouselBlock = cMatch[1];
      break;
    }
  }

  if (!carouselBlock) {
    console.log('No specific carousel_media block matched with post shortcode, using fallback match');
    const cMatch = html.match(/"carousel_media"\s*:\s*\[([\s\S]*?)\]/);
    if (cMatch) carouselBlock = cMatch[1];
  }

  if (!carouselBlock) return [];

  // Parse items inside carouselBlock
  const displayUris = [...carouselBlock.matchAll(/"display_uri"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));
  const accessibilityCaptions = [...carouselBlock.matchAll(/"accessibility_caption"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));

  const results = [];
  const seen = new Set();

  for (let i = 0; i < displayUris.length; i++) {
    const url = displayUris[i];
    const altText = accessibilityCaptions[i] || '';
    const norm = url.split('?')[0];
    if (!seen.has(norm)) {
      seen.add(norm);
      results.push({ url, altText, index: results.length + 1 });
    }
  }

  return results;
}

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');
const carousel = parseInstagramPostCarousel(html, 'https://www.instagram.com/p/Da-My7Ckn9R/');

console.log(`\nExtracted ${carousel.length} carousel slides for target post:`);
carousel.forEach(item => {
  console.log(`\n--- Slide ${item.index} ---`);
  console.log('URL:', item.url.substring(0, 100));
  console.log('Alt/OCR Text:', item.altText);
});
