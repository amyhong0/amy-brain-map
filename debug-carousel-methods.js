// Instagram 캐러셀 이미지를 가져오는 다양한 방법 테스트
const shortcode = 'Da2HgwNEldz';

// 방법 1: Instagram embed endpoint
async function tryEmbedEndpoint() {
  console.log('\n=== Method 1: Instagram /embed endpoint ===');
  const url = `https://www.instagram.com/p/${shortcode}/embed/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      }
    });
    const html = await res.text();
    console.log('Status:', res.status, '| HTML:', html.length, 'chars');
    
    // img src 찾기
    const imgMatches = [...html.matchAll(/https:\/\/[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
    const filtered = [...new Set(imgMatches.map(m => m[0]))].filter(u => u.includes('/v/t51.') || u.includes('scontent'));
    console.log('Post images found:', filtered.length);
    filtered.slice(0, 3).forEach((u, i) => console.log(`  [${i+1}] ${u.substring(0, 120)}`));
    
    // HTML snippet
    const bodyIdx = html.indexOf('<body');
    console.log('\nBody snippet:', html.substring(bodyIdx, bodyIdx + 300));
    return filtered;
  } catch(e) {
    console.log('Error:', e.message);
    return [];
  }
}

// 방법 2: Instagram GraphQL API (공개, 로그인 불필요했던 방식)
async function tryGraphQL() {
  console.log('\n=== Method 2: GraphQL API ===');
  const variables = JSON.stringify({ shortcode, child_comment_count: 0, fetch_comment_count: 0, parent_comment_count: 0, has_threaded_comments: false });
  const url = `https://www.instagram.com/api/graphql`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRFToken': 'missing',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.instagram.com/',
        'Accept': '*/*',
      },
      body: `variables=${encodeURIComponent(variables)}&doc_id=8845758582119845&server_timestamps=true`
    });
    console.log('Status:', res.status);
    const body = await res.text();
    console.log('Response:', body.substring(0, 300));
  } catch(e) {
    console.log('Error:', e.message);
  }
}

// 방법 3: Instagram embed/captioned (공개 임베드 JSON)
async function tryEmbedCaptioned() {
  console.log('\n=== Method 3: /embed/captioned/ endpoint ===');
  const url = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.instagram.com/',
      }
    });
    const html = await res.text();
    console.log('Status:', res.status, '| HTML:', html.length, 'chars');
    
    // img src 찾기
    const imgMatches = [...html.matchAll(/https:\/\/[^\s"'<>\\]+\.jpg[^\s"'<>\\]*/g)];
    const decoded = [...new Set(imgMatches.map(m => m[0].replace(/\\u0026/g, '&').replace(/\\/g, '')))];
    const filtered = decoded.filter(u => u.includes('/v/t51.') || (u.includes('scontent') && !u.includes('profile')));
    console.log('Post images found:', filtered.length);
    filtered.slice(0, 5).forEach((u, i) => console.log(`  [${i+1}] ${u.substring(0, 120)}`));
    
    // 텍스트 찾기
    const textMatch = html.match(/TimelineMedia[^{]*\{[^}]+caption[^:]*:\s*"([^"]+)"/);
    const imgDataMatch = html.match(/data-instagram-id="[^"]*"[^>]*>/);
    console.log('\nText found:', textMatch?.[1]?.substring(0, 100) || 'none');
    
    return filtered;
  } catch(e) {
    console.log('Error:', e.message);
    return [];
  }
}

// 방법 4: 가장 중요 - 이미지를 Googlebot HTML에서 가져와서 302/redirect 없이 접근
async function tryWithGooglebotReferer() {
  console.log('\n=== Method 4: Images with Googlebot Referer ===');
  // 먼저 Googlebot HTML에서 이미지 URL 수집
  const igUrl = `https://www.instagram.com/p/${shortcode}/`;
  const res = await fetch(igUrl, {
    headers: {
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    }
  });
  const html = await res.text();
  
  // scontent URL 모두 수집
  const rawMatches = [...html.matchAll(/https:\/\/scontent[^\s"'<>]+\.jpg[^\s"'<>]*/g)];
  const allImgs = [...new Set(rawMatches.map(m => m[0]))].filter(u => u.includes('/v/t51.'));
  console.log('Found', allImgs.length, 'carousel image URLs');
  
  // 각각 다운로드 시도
  const fs = require('fs');
  const path = require('path');
  const dir = './debug-images2';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  
  const workingImages = [];
  
  for (let i = 0; i < Math.min(allImgs.length, 6); i++) {
    const imgUrl = allImgs[i];
    try {
      // 다양한 헤더 조합 시도
      const imgRes = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
          'Referer': 'https://www.google.com/',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        }
      });
      console.log(`  [${i+1}] Status: ${imgRes.status} | ${imgUrl.substring(0, 80)}`);
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const fp = path.join(dir, `img_${i+1}.jpg`);
        fs.writeFileSync(fp, Buffer.from(buf));
        workingImages.push({ url: imgUrl, path: fp, size: buf.byteLength });
        console.log(`       Saved: ${buf.byteLength} bytes`);
      }
    } catch(e) {
      console.log(`  [${i+1}] Error: ${e.message}`);
    }
  }
  
  return workingImages;
}

(async () => {
  await tryEmbedEndpoint();
  await tryEmbedCaptioned();
  const working = await tryWithGooglebotReferer();
  
  if (working.length > 0) {
    console.log('\n✅ Working images:', working.length);
    working.forEach(w => console.log(`  ${w.path} (${w.size} bytes)`));
  } else {
    console.log('\n❌ No working images found with any method');
  }
  
  await tryGraphQL();
})();
