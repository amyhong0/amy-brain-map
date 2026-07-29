// Instagram fetch 테스트 (Next.js API 경로 테스트용)
const testUrl = 'https://www.instagram.com/p/Da2HgwNEldz/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==';

async function testKnowledgeAPI() {
  try {
    console.log('지식 추가 API 테스트 시작...');
    console.log('URL:', testUrl);
    
    const response = await fetch('http://localhost:3000/api/knowledge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: testUrl,
        topic: 'test'
      })
    });
    
    console.log('응답 상태:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('성공:', data);
    } else {
      const error = await response.text();
      console.log('에러:', error);
    }
  } catch (error) {
    console.error('테스트 실패:', error);
  }
}

// 브라우저 콘솔에서 실행하거나 서버가 시작된 후 실행
console.log('이 스크립트는 Next.js dev 서버가 실행된 후에 실행해야 합니다.');
console.log('서버 시작 후: node test-instagram-fetch.js 또는 브라우저 콘솔에서 실행');