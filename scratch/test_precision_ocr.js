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

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');

// Find target post shortcode Da-My7Ckn9R
const matches = [...html.matchAll(/"code"\s*:\s*"Da-My7Ckn9R"/g)];
const idx = matches[matches.length - 1].index;
const snippet = html.substring(idx, idx + 35000);
const uris = [...snippet.matchAll(/"display_uri"\s*:\s*"([^"]+)"/g)].map(m => decodeUrl(m[1]));

console.log('Found URIs count:', uris.length);

async function testPrompt(slideIdx, imgUrl) {
  console.log(`\n=================== Slide ${slideIdx + 1} ===================`);
  console.log('Downloading slide image...');
  const res = await fetch(imgUrl, {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Referer': 'https://www.instagram.com/'
    }
  });
  console.log('Status:', res.status);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  // Try different prompts to extract EVERY word verbatim
  const prompts = [
    'You are a high-precision OCR system. Extract ALL text visible in this image verbatim, line by line, in Korean/English. Do not summarize, skip, or rephrase anything.',
    '이 이미지 안에 있는 모든 글자를 빠짐없이 그대로(토씨 하나 틀리지 말고) 줄바꿈을 유지해서 한글/영어로 전사(transcribe)해줘.'
  ];

  for (let pIdx = 0; pIdx < prompts.length; pIdx++) {
    const promptText = prompts[pIdx];
    console.log(`\n--- Prompt ${pIdx + 1} ---`);
    const apiRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta/llama-3.2-11b-vision-instruct',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.1
      })
    });
    const data = await apiRes.json();
    console.log('OCR Output:\n', data.choices[0]?.message?.content);
  }
}

async function runAll() {
  for (let i = 0; i < uris.length; i++) {
    await testPrompt(i, uris[i]);
  }
}

runAll();
