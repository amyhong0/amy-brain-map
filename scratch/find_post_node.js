const fs = require('fs');

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

const targetCode = 'Da-My7Ckn9R';
const idx = html.indexOf(targetCode);
console.log(`Index of '${targetCode}':`, idx);

if (idx !== -1) {
  // Show around this index
  const start = Math.max(0, idx - 500);
  const end = Math.min(html.length, idx + 5000);
  const snippet = html.substring(start, end);
  console.log('--- Snippet around Da-My7Ckn9R ---');
  console.log(snippet.substring(0, 3000));
}
