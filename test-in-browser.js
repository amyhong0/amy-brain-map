// 브라우저 콘솔에서 실행하세요
const testUrl = 'https://www.instagram.com/p/Da2HgwNEldz/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==';

console.log('Instagram 파싱 테스트 시작...');
console.log('URL:', testUrl);

fetch('http://localhost:3000/api/knowledge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: testUrl,
    topic: 'test'
  })
})
.then(response => {
  console.log('응답 상태:', response.status);
  return response.json();
})
.then(data => {
  console.log('=== 성공 ===');
  console.log('결과:', data);
  
  if (data.success) {
    console.log('제목:', data.title);
    console.log('내용:', data.content);
    console.log('키워드:', data.keywords);
    console.log('토픽:', data.topic);
  } else {
    console.log('에러:', data.error);
  }
})
.catch(error => {
  console.error('=== 실패 ===');
  console.error('에러:', error);
});

console.log('서버 콘솔에서 다음 로그를 확인하세요:');
console.log('- [Instagram] Fetching content from: ...');
console.log('- [Instagram] HTML length: ...');
console.log('- [Instagram] Total unique images collected: ...');
console.log('- [instagram.com] Starting vision analysis for ... images');
console.log('- [instagram.com] Vision title result: ...');
console.log('- [instagram.com] Vision desc result: ...');