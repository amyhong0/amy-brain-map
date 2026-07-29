const fs = require('fs');
const NVIDIA_API_KEY = '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';

function decodeUrl(str) {
  if (!str) return '';
  return str
    .replace(/\\\/|\\\//g, '/')
    .replace(/\\/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\\u0026/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function extractInstagramCarouselData(html, url) {
  const shortcodeMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([^\/\?]+)/);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';

  const imageUrls = [];
  const altTexts = [];
  const seen = new Set();

  const addImage = (imgUrl, alt) => {
    if (!imgUrl) return;
    const decoded = decodeUrl(imgUrl);
    if (!decoded.startsWith('http')) return;
    // Extract image ID (e.g. 751485594_17975848008086785) for deduplication key
    const idMatch = decoded.match(/\/([0-9]+_[0-9]+_[0-9]+_n\.jpg)/);
    const key = idMatch ? idMatch[1] : decoded.split('?')[0];
    
    if (!seen.has(key)) {
      seen.add(key);
      imageUrls.push(decoded);
      if (alt) altTexts.push(alt);
    }
  };

  // 1. Target post's JSON block specifically
  if (shortcode) {
    const occurrences = [...html.matchAll(new RegExp(`"code"\\s*:\\s*"${shortcode}"`, 'g'))];
    for (const m of occurrences) {
      const snippet = html.substring(m.index, m.index + 35000);
      const cMatch = snippet.match(/"carousel_media"\s*:\s*\[([\s\S]*?)\]\s*,\s*"(?:caption|like_count|id)"/);
      if (cMatch) {
        const block = cMatch[1];
        const uriMatches = [...block.matchAll(/"display_uri"\s*:\s*"([^"]+)"/g)];
        const altMatches = [...block.matchAll(/"accessibility_caption"\s*:\s*"([^"]+)"/g)];
        uriMatches.forEach((m, idx) => {
          const alt = altMatches[idx] ? decodeUrl(altMatches[idx][1]) : '';
          addImage(m[1], alt);
        });
        break;
      }
    }
  }

  // 2. og:image as primary cover fallback if carousel_media didn't catch cover
  const ogMatches = [...html.matchAll(/property="og:image"\s+content="([^"]+)"/g)];
  ogMatches.forEach(m => addImage(m[1]));

  return { imageUrls, altTexts };
}

async function testFullFix() {
  const html = fs.readFileSync('scratch/ig_page.html', 'utf8');
  const url = 'https://www.instagram.com/p/Da-My7Ckn9R/';
  const { imageUrls, altTexts } = extractInstagramCarouselData(html, url);

  console.log('Extracted image URLs count:', imageUrls.length);
  imageUrls.forEach((u, i) => console.log(`[Image ${i+1}]`, u.substring(0, 110)));
  console.log('\nExtracted Alt Texts:', altTexts);

  // Download Image 1 (Cover Image)
  console.log('\nDownloading Image 1 (Cover Image)...');
  const res = await fetch(imageUrls[0], {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Referer': 'https://www.instagram.com/'
    }
  });
  console.log('Image 1 Download Status:', res.status, '| Content-Type:', res.headers.get('content-type'));
  if (!res.ok) return;

  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');

  const visionRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta/llama-3.2-11b-vision-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '이 이미지에 있는 모든 텍스트를 한글로 정확하게 추출해주세요.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
        ]
      }],
      max_tokens: 512,
      temperature: 0.1
    })
  });

  const data = await visionRes.json();
  console.log('\nVision Output for Cover Image:\n', data.choices[0]?.message?.content);
}

testFullFix();
