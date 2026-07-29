// 이미지를 다운로드해서 어떤 이미지인지 로컬에 저장
const fs = require('fs');
const path = require('path');

const IMAGES = [
  'https://scontent-ssn1-1.cdninstagram.com/v/t51.82787-15/748360281_17975360202086785_2015908960998161865_n.jpg?stp=c164.0.492.492a_dst-jpg_e35_s640x640_tt6&_nc_cat=101&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMyJ9&_nc_ohc=YeQ-6-F8SCYQ7kNvwEKxaGR&_nc_oc=Adqx8icClE-nbrZEbIX94YpYkr1X70gSi_WWpiV1sbpNcqHhhxjKU3apJjniT4TfH2c&_nc_zt=23&_nc_ht=scontent-ssn1-1.cdninstagram.com&_nc_gid=deSYq5A8DQad2rtoYx_D-Q&_nc_ss=7f689&oh=00_AQCm8Hz_eHZ-040EeYClMVub8XFoAe2gBjeR-KHp-k6VHg&oe=6A6F34DF',
];

// 최신 이미지도 새로 수집
async function getLatestImages() {
  const url = 'https://www.instagram.com/p/Da2HgwNEldz/';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    }
  });
  const html = await res.text();
  
  function decodeHtmlEntities(str) {
    return str
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  
  const seen = new Set();
  const imgs = [];
  
  // og:image
  const ogMatches = [...html.matchAll(/property="og:image" content="([^"]*)"/g)];
  ogMatches.forEach(m => {
    const decoded = decodeHtmlEntities(m[1]);
    const norm = decoded.split('?')[0];
    if (!seen.has(norm)) { seen.add(norm); imgs.push(decoded); }
  });
  
  // scontent CDN
  const cdn = [...html.matchAll(/https:\/\/scontent[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  cdn.forEach(m => {
    if (m[0].includes('/v/t51.')) {
      const norm = m[0].split('?')[0];
      if (!seen.has(norm)) { seen.add(norm); imgs.push(m[0]); }
    }
  });
  
  return imgs;
}

(async () => {
  console.log('Getting latest image URLs...');
  const imageUrls = await getLatestImages();
  console.log('Found', imageUrls.length, 'images');
  
  // 이미지 다운로드해서 저장
  const dir = './debug-images';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  
  for (let i = 0; i < Math.min(imageUrls.length, 5); i++) {
    const url = imageUrls[i];
    console.log(`\nDownloading image ${i+1}: ${url.substring(0, 80)}`);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.instagram.com/',
        }
      });
      console.log('  Status:', res.status, '| Size:', res.headers.get('content-length'), 'bytes');
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const filepath = path.join(dir, `image_${i+1}.jpg`);
        fs.writeFileSync(filepath, Buffer.from(buf));
        console.log('  Saved to:', filepath, '| Size:', buf.byteLength, 'bytes');
      }
    } catch(e) {
      console.log('  Error:', e.message);
    }
  }
  
  console.log('\nAll images saved to ./debug-images/');
  console.log('Please open these files to see what images look like.');
})();
