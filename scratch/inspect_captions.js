const fs = require('fs');

function decodeUrl(str) {
  if (!str) return '';
  return str
    .replace(/\\\/|\\\//g, '/')
    .replace(/\\/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/g, '&')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

// Find all accessibility_caption occurrences in Da-My7Ckn9R node
const shortcode = 'Da-My7Ckn9R';
const occurrences = [...html.matchAll(new RegExp(`"code"\\s*:\\s*"${shortcode}"`, 'g'))];

for (const m of occurrences) {
  const snippet = html.substring(m.index, m.index + 25000);
  const alts = [...snippet.matchAll(/"accessibility_caption"\s*:\s*"([^"]+)"/g)].map(x => decodeUrl(x[1]));
  const uris = [...snippet.matchAll(/"display_uri"\s*:\s*"([^"]+)"/g)].map(x => decodeUrl(x[1]));
  
  if (alts.length > 0 || uris.length > 0) {
    console.log(`Node at ${m.index}:`);
    console.log(`  display_uris (${uris.length}):`);
    uris.forEach((u, i) => console.log(`    [${i+1}] ${u.substring(0, 100)}`));
    console.log(`  accessibility_captions (${alts.length}):`);
    alts.forEach((a, i) => console.log(`    [${i+1}] ${a}`));
  }
}
