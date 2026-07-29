// Instagram 파싱 로직 테스트 (Node.js)
const https = require('https');

function testInstagramParsing() {
  const url = 'https://www.instagram.com/p/Da2HgwNEldz/';
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  };

  console.log('Instagram 파싱 테스트 시작...');
  
  https.get(url, options, (res) => {
    console.log('응답 상태:', res.statusCode);
    
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('HTML 길이:', data.length);
      
      // 메타 태그 추출
      const ogTitleMatch = data.match(/<meta property="og:title" content="([^"]*)"/i);
      const ogDescMatch = data.match(/<meta property="og:description" content="([^"]*)"/i);
      const ogImageMatches = data.match(/<meta property="og:image" content="([^"]*)"/gi);
      
      const ogTitle = ogTitleMatch ? ogTitleMatch[1] : 'NOT FOUND';
      const ogDesc = ogDescMatch ? ogDescMatch[1] : 'NOT FOUND';
      
      console.log('\n=== 메타 데이터 ===');
      console.log('OG Title:', ogTitle);
      console.log('OG Description:', ogDesc);
      
      // 이미지 URL 추출
      console.log('\n=== 이미지 URL ===');
      if (ogImageMatches) {
        console.log('발견된 og:image 태그 수:', ogImageMatches.length);
        ogImageMatches.forEach((match, i) => {
          const url = match.match(/content="([^"]*)"/)[1];
          console.log(`이미지 ${i+1}:`, url);
        });
      } else {
        console.log('og:image 태그를 찾을 수 없음');
      }
      
      // img 태그도 확인
      const imgMatches = data.match(/<img[^>]*src="([^"]*)"[^>]*>/gi);
      console.log('\n=== img 태그 ===');
      if (imgMatches) {
        console.log('발견된 img 태그 수:', imgMatches.length);
        const relevantImages = imgMatches.filter(tag => {
          const src = tag.match(/src="([^"]*)"/)[1];
          return src && !src.includes('1x1') && !src.includes('pixel') && !src.includes('icon');
        });
        console.log('광고/아이콘 제외 후:', relevantImages.length);
        relevantImages.slice(0, 5).forEach((tag, i) => {
          const src = tag.match(/src="([^"]*)"/)[1];
          console.log(`이미지 ${i+1}:`, src);
        });
      }
      
      // JSON-LD 확인
      console.log('\n=== JSON-LD 데이터 ===');
      const jsonLdMatch = data.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        try {
          const jsonData = JSON.parse(jsonLdMatch[1]);
          console.log('JSON-LD 데이터 발견');
          if (jsonData.image) {
            console.log('이미지 데이터:', Array.isArray(jsonData.image) ? `${jsonData.image.length}개` : jsonData.image);
          }
        } catch (e) {
          console.log('JSON-LD 파싱 실패');
        }
      } else {
        console.log('JSON-LD 데이터 없음');
      }
      
    });
  }).on('error', (err) => {
    console.error('에러 발생:', err.message);
  });
}

testInstagramParsing();