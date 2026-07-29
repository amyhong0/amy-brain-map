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

function cleanVisionOcrOutput(rawText) {
  if (!rawText) return '';
  const lines = rawText.split('\n');
  const cleaned = [];
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(이미지|사진)에 (있는|보이는) .*추출/i.test(trimmed)) continue;
    if (/^이 이미지에는 텍스트가/i.test(trimmed)) continue;
    if (/^이미지에 있는 모든 텍스트를/i.test(trimmed)) continue;
    if (/^이 두 문구를 한글로 번역하면/i.test(trimmed)) continue;
    if (/^이 두 단어는 이미지를 설명하는/i.test(trimmed)) continue;
    if (/^위 텍스트는/i.test(trimmed)) continue;
    if (/^이미지 안에 있는 모든 글자를/i.test(trimmed)) continue;
    if (/^\*\*(Korean|English) Text:\*\*/i.test(trimmed)) continue;
    if (/^Note:/i.test(trimmed)) continue;
    
    cleaned.push(trimmed);
  }
  
  const deduped = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (i === 0 || cleaned[i] !== cleaned[i - 1]) {
      deduped.push(cleaned[i]);
    }
  }
  
  return deduped.join('\n');
}

const html = fs.readFileSync('scratch/ig_page.html', 'utf8');
const matches = [...html.matchAll(/"code"\s*:\s*"Da-My7Ckn9R"/g)];
const idx = matches[matches.length - 1].index;
const snippet = html.substring(idx, idx + 35000);
const uris = [...snippet.matchAll(/"display_uri"\s*:\s*"([^"]+)"/g)].map(m => decodeUrl(m[1]));

async function testFullOcr() {
  const results = [];
  for (let i = 0; i < uris.length; i++) {
    const imgUrl = uris[i];
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Referer': 'https://www.instagram.com/'
      }
    });
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const apiRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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
            { type: 'text', text: '이 이미지 안에 있는 모든 글자를 빠짐없이 그대로(토씨 하나 틀리지 말고) 줄바꿈을 유지해서 한글/영어 텍스트만 전사(transcribe)해줘. 영문 번역이나 주석, 부연 설명은 절대로 붙이지 마.' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 1024,
        temperature: 0.1
      })
    });

    const data = await apiRes.json();
    const rawContent = data.choices[0]?.message?.content || '';
    const cleaned = cleanVisionOcrOutput(rawContent);
    results.push(`[슬라이드 ${i + 1} 이미지 텍스트]\n${cleaned}`);
  }

  console.log('\n=================== PURE VERBATIM OCR RESULT ===================');
  console.log(results.join('\n\n'));
}

testFullOcr();
