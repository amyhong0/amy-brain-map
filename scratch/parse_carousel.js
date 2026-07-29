const fs = require('fs');

function decodeHtmlEntities(str) {
  return str
    .replace(/\\u0026/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, "'");
}

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

// Find all display_url or carousel_media in the HTML
const displayUrls = [...html.matchAll(/"display_url"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));
console.log('display_url count:', displayUrls.length);
displayUrls.forEach((u, i) => console.log(`display_url [${i}]`, u.substring(0, 100)));

// Search for carousel_media or edge_sidecar_to_children
const carouselMatches = [...html.matchAll(/"carousel_media"\s*:\s*\[([\s\S]*?)\]/g)];
console.log('carousel_media matches:', carouselMatches.length);

// Search for image_versions2 or candidates
const candidates = [...html.matchAll(/"candidates"\s*:\s*\[([\s\S]*?)\]/g)];
console.log('candidates count:', candidates.length);

// Also test searching for images inside the main post object vs sidecar
const sidecarMatches = [...html.matchAll(/"edge_sidecar_to_children"\s*:\s*\{"edges"\s*:\s*\[([\s\S]*?)\]\}/g)];
console.log('edge_sidecar_to_children matches:', sidecarMatches.length);
if (sidecarMatches.length > 0) {
  const sidecarContent = sidecarMatches[0][1];
  const sidecarDisplayUrls = [...sidecarContent.matchAll(/"display_url"\s*:\s*"([^"]+)"/g)].map(m => decodeHtmlEntities(m[1]));
  console.log('Sidecar display_urls:', sidecarDisplayUrls.length);
  sidecarDisplayUrls.forEach((u, i) => console.log(`Sidecar [${i}]`, u.substring(0, 100)));
}
