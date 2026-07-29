const fs = require('fs');
const NVIDIA_API_KEY = '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';

async function testSingleImageVision(base64Url, index) {
  const visionPrompt = `이미지 ${index + 1}: 이 이미지에 있는 모든 텍스트를 빠짐없이 한국어로 추출해주세요.`;
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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
            { type: 'text', text: visionPrompt },
            { type: 'image_url', image_url: { url: base64Url } }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    console.error(`Image ${index + 1} API Error:`, await res.text());
    return null;
  }
  const data = await res.json();
  return data.choices[0]?.message?.content || null;
}

async function testMultiImageFlow() {
  const url = 'https://www.instagram.com/p/Da-My7Ckn9R/';
  const res = await fetch(url, {
    headers: { 
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  const html = await res.text();

  function decodeHtmlEntities(str) {
    return str
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, "'");
  }

  const scontentMatches = [...html.matchAll(/https:\/\/scontent[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  const cdnMatches = [...html.matchAll(/https:\/\/[a-z0-9-]+\.cdninstagram\.com\/v\/[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  const allCdnUrls = [...new Set([...scontentMatches, ...cdnMatches].map(m => decodeHtmlEntities(m[0])))];

  const imageUrls = [];
  const seen = new Set();
  for (const cdnUrl of allCdnUrls) {
    if (cdnUrl.includes('/v/t51.') || cdnUrl.includes('/v/t50.') || cdnUrl.includes('/v/t39.')) {
      const norm = cdnUrl.split('?')[0];
      if (!seen.has(norm)) {
        seen.add(norm);
        imageUrls.push(cdnUrl);
      }
    }
  }

  console.log('Unique carousel images found:', imageUrls.length);

  // Convert up to 6 images to Base64
  const validBase64Urls = [];
  for (let i = 0; i < Math.min(imageUrls.length, 6); i++) {
    const imgUrl = imageUrls[i];
    try {
      const imgRes = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Referer': 'https://www.instagram.com/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        }
      });
      if (imgRes.ok) {
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        validBase64Urls.push(`data:${contentType};base64,${base64}`);
      }
    } catch(e) {
      console.error(`Image ${i+1} download failed:`, e.message);
    }
  }

  console.log(`Processing ${validBase64Urls.length} images concurrently (1 image per request)...`);

  const results = await Promise.all(
    validBase64Urls.map((b64, idx) => testSingleImageVision(b64, idx))
  );

  results.forEach((resText, i) => {
    console.log(`\n--- Image ${i+1} OCR Result ---`);
    console.log(resText);
  });
}

testMultiImageFlow();
