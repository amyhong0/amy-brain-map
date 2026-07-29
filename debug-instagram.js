// Instagram 파싱 디버깅용
const https = require('https');

function testFetch() {
  const url = 'https://www.instagram.com/p/Da2HgwNEldz/';
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  };

  https.get(url, options, (res) => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', res.headers);
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('HTML length:', data.length);
      
      // OG 태그 추출
      const ogTitle = data.match(/<meta property="og:title" content="([^"]*)"/i);
      const ogDesc = data.match(/<meta property="og:description" content="([^"]*)"/i);
      const ogImage = data.match(/<meta property="og:image" content="([^"]*)"/i);
      
      console.log('OG Title:', ogTitle ? ogTitle[1] : 'NOT FOUND');
      console.log('OG Description:', ogDesc ? ogDesc[1] : 'NOT FOUND');
      console.log('OG Image:', ogImage ? ogImage[1] : 'NOT FOUND');
      
      // 추가 이미지 태그 확인
      const allOgImages = data.match(/<meta property="og:image[^"]*" content="([^"]*)"/gi);
      if (allOgImages) {
        console.log('All OG images found:', allOgImages.length);
        allOgImages.forEach((match, i) => {
          const url = match.match(/content="([^"]*)"/)[1];
          console.log(`  Image ${i+1}:`, url);
        });
      }
      
      // 이미지 태그 확인
      const imgTags = data.match(/<img[^>]*src="([^"]*)"[^>]*>/gi);
      if (imgTags) {
        console.log('Img tags found:', imgTags.length);
        imgTags.slice(0, 5).forEach((tag, i) => {
          const src = tag.match(/src="([^"]*)"/)[1];
          console.log(`  Img ${i+1}:`, src);
        });
      }
    });
  }).on('error', (err) => {
    console.error('Error:', err.message);
  });
}

testFetch();