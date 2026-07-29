// 핵심 진단: NVIDIA Vision API가 Instagram CDN 이미지를 읽을 수 있는지 테스트
// 먼저 이미지를 직접 다운로드해서 base64로 변환 후 Vision API에 전달
const NVIDIA_API_KEY = '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';

// 이미 확인된 Instagram 이미지 URL (Googlebot UA로 수집한 것)
const TEST_IMAGE_URL = 'https://scontent-ssn1-1.cdninstagram.com/v/t51.82787-15/748360281_17975360202086785_2015908960998161865_n.jpg?stp=c164.0.492.492a_dst-jpg_e35_s640x640_tt6&_nc_cat=101&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMyJ9&_nc_ohc=YeQ-6-F8SCYQ7kNvwEKxaGR&_nc_oc=Adqx8icClE-nbrZEbIX94YpYkr1X70gSi_WWpiV1sbpNcqHhhxjKU3apJjniT4TfH2c&_nc_zt=23&_nc_ht=scontent-ssn1-1.cdninstagram.com&_nc_gid=deSYq5A8DQad2rtoYx_D-Q&_nc_ss=7f689&oh=00_AQCm8Hz_eHZ-040EeYClMVub8XFoAe2gBjeR-KHp-k6VHg&oe=6A6F34DF';

async function testVisionWithUrl(imageUrl, label) {
  console.log(`\n=== [${label}] Vision API with URL ===`);
  console.log('URL:', imageUrl.substring(0, 80));
  
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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
            { type: 'text', text: '이 이미지에 있는 모든 텍스트를 한국어로 추출해주세요. 없으면 "텍스트 없음"이라고 하세요.' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }],
        max_tokens: 1024,
        temperature: 0.1,
      })
    });
    
    console.log('API Status:', res.status, res.statusText);
    const body = await res.text();
    if (res.ok) {
      const data = JSON.parse(body);
      const result = data.choices?.[0]?.message?.content;
      console.log('Result:', result?.substring(0, 300));
    } else {
      console.log('Error body:', body.substring(0, 500));
    }
  } catch(e) {
    console.log('Exception:', e.message);
  }
}

async function testVisionWithBase64(imageUrl, label) {
  console.log(`\n=== [${label}] Vision API with Base64 ===`);
  
  // 1. 이미지 다운로드
  console.log('Downloading image...');
  let imgBase64 = '';
  let contentType = '';
  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'Referer': 'https://www.instagram.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    });
    console.log('Image download status:', imgRes.status, '| Content-Type:', imgRes.headers.get('content-type'));
    if (!imgRes.ok) {
      console.log('Image download FAILED');
      return;
    }
    contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await imgRes.arrayBuffer();
    imgBase64 = Buffer.from(buffer).toString('base64');
    console.log('Base64 length:', imgBase64.length, '| Estimated size:', Math.round(buffer.byteLength/1024), 'KB');
  } catch(e) {
    console.log('Download exception:', e.message);
    return;
  }
  
  // 2. Base64로 Vision API 호출
  const dataUrl = `data:${contentType};base64,${imgBase64}`;
  console.log('Calling Vision API with base64...');
  
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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
            { type: 'text', text: '이 이미지에 있는 모든 텍스트를 한국어로 추출해주세요. 없으면 "텍스트 없음"이라고 하세요.' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        max_tokens: 1024,
        temperature: 0.1,
      })
    });
    
    console.log('API Status:', res.status, res.statusText);
    const body = await res.text();
    if (res.ok) {
      const data = JSON.parse(body);
      const result = data.choices?.[0]?.message?.content;
      console.log('Result:', result?.substring(0, 300));
    } else {
      console.log('Error body:', body.substring(0, 500));
    }
  } catch(e) {
    console.log('Exception:', e.message);
  }
}

(async () => {
  // 테스트 1: URL 직접 전달
  await testVisionWithUrl(TEST_IMAGE_URL, 'Direct URL');
  
  // 테스트 2: Base64 변환 후 전달
  await testVisionWithBase64(TEST_IMAGE_URL, 'Base64');
})();
