const fs = require('fs');

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

const targetIndex = 567731;
const snippet = html.substring(targetIndex, targetIndex + 3000);
console.log(snippet);
