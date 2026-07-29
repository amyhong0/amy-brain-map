// 수정된 로직으로 Instagram 파싱 최종 테스트
const url = 'https://www.instagram.com/p/Da2HgwNEldz/';

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

(async () => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  const html = await res.text();
  
  // Cheerio 없이 직접 파싱 (테스트용)
  const ogTitle = decodeHtmlEntities(
    html.match(/property="og:title" content="([^"]*)"/)?.[1] ||
    html.match(/content="([^"]*)" property="og:title"/)?.[1] || ''
  );
  const ogDesc = decodeHtmlEntities(
    html.match(/property="og:description" content="([^"]*)"/)?.[1] ||
    html.match(/content="([^"]*)" property="og:description"/)?.[1] || ''
  );
  const ogImg = decodeHtmlEntities(
    html.match(/property="og:image" content="([^"]*)"/)?.[1] ||
    html.match(/content="([^"]*)" property="og:image"/)?.[1] || ''
  );

  console.log('=== OG Title (decoded) ===');
  console.log(ogTitle);

  console.log('\n=== OG Description (content only) ===');
  const content = ogDesc
    .replace(/^\d+ likes?, \d+ comments? - [^\-]+ - [^:]+:\s*/, '')
    .replace(/^\d+ likes?, \d+ comments? - \S+ on \w+ \d+, \d+:\s*/, '')
    .replace(/- \S+ on Instagram:?/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  console.log(content);

  console.log('\n=== OG Image URL (decoded) ===');
  console.log(ogImg.substring(0, 200));

  // 이미지 수집
  const seen = new Set();
  const imageUrls = [];
  
  function addImage(src) {
    if (!src || !src.startsWith('http')) return;
    const decoded = decodeHtmlEntities(src);
    const normalized = decoded.split('?')[0];
    if (!seen.has(normalized)) {
      seen.add(normalized);
      imageUrls.push(decoded);
    }
  }

  // og:image
  const ogImgMatches = [...html.matchAll(/property="og:image" content="([^"]*)"/g)];
  const ogImgMatches2 = [...html.matchAll(/content="([^"]*)" property="og:image"/g)];
  [...ogImgMatches, ...ogImgMatches2].forEach(m => addImage(m[1]));

  // CDN 이미지 (캐러셀)
  const scontentMatches = [...html.matchAll(/https:\/\/scontent[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  const cdnMatches = [...html.matchAll(/https:\/\/[a-z0-9-]+\.cdninstagram\.com\/v\/[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  const allCdnUrls = [...new Set([...scontentMatches, ...cdnMatches].map(m => m[0]))];
  
  for (const cdnUrl of allCdnUrls) {
    if (cdnUrl.includes('/v/t51.') || cdnUrl.includes('/v/t50.') || cdnUrl.includes('/v/t39.')) {
      addImage(cdnUrl);
    }
  }

  console.log('\n=== Collected Images ===');
  console.log('Total:', imageUrls.length);
  imageUrls.forEach((img, i) => {
    console.log(`[${i+1}] ${img.substring(0, 120)}`);
  });

  // Vision API 테스트 (이미지 URL이 유효한지 확인)
  if (imageUrls.length > 0) {
    console.log('\n=== Image URL Validation ===');
    for (const imgUrl of imageUrls.slice(0, 3)) {
      try {
        const imgRes = await fetch(imgUrl, { method: 'HEAD' });
        console.log(`[${imgRes.status}] ${imgUrl.substring(0, 80)}`);
        console.log('  Content-Type:', imgRes.headers.get('content-type'));
        console.log('  Content-Length:', imgRes.headers.get('content-length'));
      } catch(e) {
        console.log(`[ERROR] ${imgUrl.substring(0, 80)} - ${e.message}`);
      }
    }
  }
})().catch(e => console.error(e));
