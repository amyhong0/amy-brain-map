// 테스트용 Instagram 파싱 스크립트
const https = require('https');

function fetchInstagramHTML(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractMetaTags(html) {
  const ogTitle = html.match(/<meta property="og:title" content="([^"]*)"/i);
  const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/i);
  const ogImage = html.match(/<meta property="og:image" content="([^"]*)"/i);
  
  return {
    title: ogTitle ? ogTitle[1] : '',
    description: ogDesc ? ogDesc[1] : '',
    image: ogImage ? ogImage[1] : ''
  };
}

async function testInstagram() {
  const url = 'https://www.instagram.com/p/Da2HgwNEldz/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==';
  
  try {
    console.log('Instagram URL 파싱 테스트 시작...');
    const html = await fetchInstagramHTML(url);
    console.log('HTML 길이:', html.length);
    
    const meta = extractMetaTags(html);
    console.log('OG Title:', meta.title);
    console.log('OG Description:', meta.description);
    console.log('OG Image:', meta.image);
    
    // 이미지 URL 더 찾기
    const imageMatches = html.match(/<meta property="og:image" content="([^"]*)"/gi);
    if (imageMatches) {
      console.log('발견된 이미지 수:', imageMatches.length);
      imageMatches.forEach((match, i) => {
        const url = match.match(/content="([^"]*)"/)[1];
        console.log(`이미지 ${i+1}:`, url);
      });
    }
    
  } catch (error) {
    console.error('에러:', error.message);
  }
}

testInstagram();