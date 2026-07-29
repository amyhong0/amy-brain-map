const fs = require('fs');

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

const targetCode = 'Da-My7Ckn9R';
const matches = [...html.matchAll(new RegExp(targetCode, 'g'))];
console.log(`Total occurrences of '${targetCode}':`, matches.length);

matches.forEach((m, idx) => {
  console.log(`\nMatch ${idx + 1} at index ${m.index}:`);
  const snippet = html.substring(Math.max(0, m.index - 100), Math.min(html.length, m.index + 400));
  console.log(snippet);
});
