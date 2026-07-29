const fs = require('fs');
const NVIDIA_API_KEY = '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';

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

function extractTargetPostMedia(html, url) {
  const shortcodeMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([^\/\?]+)/);
  const shortcode = shortcodeMatch ? shortcodeMatch[1] : '';
  console.log('Target Shortcode:', shortcode);

  let targetBlock = '';

  if (shortcode) {
    // Search for code: "shortcode" from end of file backwards or targeting main media object
    const matches = [...html.matchAll(new RegExp(`"code"\\s*:\\s*"${shortcode}"`, 'g'))];
    console.log(`Found ${matches.length} matches for shortcode "${shortcode}"`);
    
    // The main post object is usually the LAST occurrence or the one with taken_at & carousel_media
    for (let i = matches.length - 1; i >= 0; i--) {
      const idx = matches[i].index;
      const snippet = html.substring(idx, idx + 30000);
      if (snippet.includes('"carousel_media"') || snippet.includes('"display_url"') || snippet.includes('"accessibility_caption"')) {
        console.log(`Using node snippet at index ${idx}`);
        targetBlock = snippet;
        break;
      }
    }
  }

  if (!targetBlock) {
    console.log('Fallback to og:image');
    const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
    return { imageUrls: ogMatch ? [decodeUrl(ogMatch[1])] : [], altTexts: [] };
  }

  // Extract display_uri and accessibility_caption strictly from targetBlock
  const uris = [...targetBlock.matchAll(/"display_uri"\s*:\s*"([^"]+)"/g)].map(m => decodeUrl(m[1]));
  const alts = [...targetBlock.matchAll(/"accessibility_caption"\s*:\s*"([^"]+)"/g)].map(m => decodeUrl(m[1]));

  const imageUrls = [];
  const altTexts = [];
  const seen = new Set();

  uris.forEach((uri, idx) => {
    const idMatch = uri.match(/\/([0-9]+_[0-9]+_[0-9]+_n\.jpg)/);
    const key = idMatch ? idMatch[1] : uri.split('?')[0];
    if (!seen.has(key)) {
      seen.add(key);
      imageUrls.push(uri);
      if (alts[idx]) altTexts.push(alts[idx]);
    }
  });

  return { imageUrls, altTexts };
}

async function testPostExtraction() {
  const html = fs.readFileSync('scratch/ig_page.html', 'utf8');
  const url = 'https://www.instagram.com/p/Da-My7Ckn9R/';
  const { imageUrls, altTexts } = extractTargetPostMedia(html, url);

  console.log('\n--- TARGET POST SLIDES FOUND ---');
  console.log('Image count:', imageUrls.length);
  imageUrls.forEach((u, i) => {
    console.log(`\nSlide ${i+1}:`);
    console.log('URL:', u.substring(0, 110));
    if (altTexts[i]) console.log('Alt OCR:', altTexts[i]);
  });

  // Run Vision API on Slide 1
  if (imageUrls.length > 0) {
    console.log('\nRunning Vision API on Slide 1...');
    const res = await fetch(imageUrls[0], {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Referer': 'https://www.instagram.com/'
      }
    });
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
            { type: 'text', text: '이 이미지에 있는 제목 문구를 한글로 추출해줘.' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
          ]
        }],
        max_tokens: 512,
        temperature: 0.1
      })
    });
    const data = await visionRes.json();
    console.log('\nVision Output for Slide 1:\n', data.choices[0]?.message?.content);
  }
}

testPostExtraction();
