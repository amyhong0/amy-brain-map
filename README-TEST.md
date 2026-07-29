# Instagram 파싱 기능 테스트 방법

## 1. 개발 서버 시작
```bash
cd amys-brain-office
npm run dev
```

## 2. 브라우저에서 테스트
서버가 시작된 후 (http://localhost:3000), 브라우저 콘솔에서 다음 코드 실행:

```javascript
const testUrl = 'https://www.instagram.com/p/Da2HgwNEldz/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==';

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
.then(response => response.json())
.then(data => console.log('결과:', data))
.catch(error => console.error('에러:', error));
```

## 3. 로그 확인
서버 콘솔에서 다음 로그를 확인하세요:
- `[Instagram] Fetching content from: ...`
- `[Instagram] HTML length: ...`
- `[Instagram] OG Title: ...`
- `[Instagram] OG Description: ...`
- `[Instagram] Found og:image: ...`
- `[Instagram] Total unique images collected: ...`
- `[instagram.com] Starting vision analysis for ... images`
- `[instagram.com] Vision title result: ...`
- `[instagram.com] Vision desc result: ...`

## 4. 수정된 기능
1. **디버깅 로그 강화**: 파싱 과정 상세 로깅
2. **이미지 수집 개선**: 헤더 강화, 작은 이미지 필터링
3. **Vision API 로깅**: 결과 미리보기 추가

## 5. 예상 결과
- Instagram URL에서 이미지 URL들이 성공적으로 수집되어야 함
- Vision API가 호출되어 이미지 텍스트가 추출되어야 함
- 최종 지식 문서에 이미지 분석 결과가 포함되어야 함