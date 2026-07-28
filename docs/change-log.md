# Amy's Brain Office — 변경 내역

> 마지막 업데이트: 2026-07-24

---

## 1. LLM 파싱 안정화 (`app/api/knowledge/route.ts`)

### 문제
- NVIDIA LLM 응답이 `max_tokens` 제한(2048)에 의해 중간에 잘리면서 `JSON.parse()` 실패
- `SyntaxError: Unterminated string in JSON at position 3479` 발생
- 실패 시 정규식 fallback이 회복했지만 topic이 `"ai"` 등 의미 없는 값으로 저장됨

### 수정
1. **(커밋 `1d49378`)** 프롬프트 본문 길이를 12000 → 4000으로 축소해 LLM 부하 감소
2. **(커밋 `1d49378`)** JSON 추출 로직 강화:
   - 코드블록(```json) 감지 외에도 `{...}` 첫/마지막 brace 기준 substring 추출 추가
   - fallback 시 `normalizeKnowledgeTopic` 적용
3. **(커밋 `d8cc128`)** 본문이 잘린 경우 하단에 안내 문구 추가:
   `"... (본문이 너무 길어서 잘렸습니다. 전체 내용은 원문 링크에서 확인하세요.)"`
4. **(커밋 `b788aa6`)** `createdAt` 저장값을 `YYYY-MM-DD` → ISO datetime으로 변경해 정렬 정확도 향상

---

## 2. topic / entity 정규화 (`app/api/knowledge/route.ts`)

### 문제
- 제목이 "제네시스 미션…" 등 프로젝트명일 때 topic이 프로젝트명으로 저장됨
- 회사명(NVIDIA, Samsung 등)이 topic이 되는 현상

### 수정
1. **(커밋 `32efc74`)** LLM systemPrompt에 `"회사명·서비스명·제품명·프로젝트명은 topic으로 사용 금지"` 지시 추가
2. **(커밋 `32efc74`)** `normalizeKnowledgeTopic()` 함수 구현:
   - STOP set: meta, google, apple, openai, nvidia, samsung, 제네시스 등 19개 주요 회사/프로젝트명
   - tech set: ai, 반도체, 자율주행, 로봇, 양자컴퓨팅 등 13개 기술 분야
   - STOP에 걸리면 keywords 중 tech에 포함된 키워드로 fallback
3. **(커밋 `1d49378`)** 정규식 fallback에서도 `normalizeKnowledgeTopic(undefined, keywords)` 호출

---

## 3. 지식그래프 노드 표시 개선 (`components/graph/knowledge-graph.tsx`)

### 문제
- 노드 위에 엔터티(topic) 라벨이 표시되어 그래프가 혼잡
- 툴팁에도 정보 부족

### 수정
1. **(커밋 `ed6fa04`)** 노드 위 라벨을 **핵심 키워드 우선**으로 변경
   - `tags[0]` → title 첫 단어 → 'Untitled' 순서로 fallback
   - 10자 초과시 `slice(0,10) + '…'` 처리
2. **(커밋 `ed6fa04`)** 마우스 오버 툴팁을 `전체 제목 | 생성일` 형식으로 변경
3. **(커밋 `d41692f`)** 노드 위 엔터티 라벨 제거

---

## 4. 지식그래프 엣지 연결 (`app/page.tsx`)

### 문제
- 첫 번째 구현: `exact match`만 연결 → "AI" ↔ "AI 모델" 연결 안 됨
- 두 번째 구현: `substring 포함 관계` 추가 → "ai" ↔ "인공지능" 연결 안 됨
- 세 번째가 필요: **의미 기반 유사도**

### 수정
1. **(커밋 `d41692f`)** 엣지 기준을 `tags 2개 이상 공유` → `keywords 1개 이상 공유`로 완화
2. **(커밋 `8832f86`)** 포함 관계(substring) 추가:
   - `kB.includes(kA) || kA.includes(kB)` → "AI" ↔ "AI 모델" 연결 가능
   - 소문자 정규화 및 중복 쌍 제거
3. **(커밋 `af89f9a`)** **NVIDIA 임베딩 API 기반 코사인 유사도** 도입:
   - POST `/api/knowledge` 호출 시 키워드를 `nvidia/nv-embed-qa-4` 모델로 벡터화
   - 벡터를 `metadata.kwEmbeddings`에 JSON 문자열로 저장
   - 그래프 rebuild 시 두 문서 간 모든 키워드 벡터 쌍의 코사인 유사도 계산
   - `> 0.7`이면 엣지 연결
   - 임베딩이 없는 기존 문서는 substring fallback 유지

### 동작 흐름
```
지식 추가 (URL 입력)
  → LLM이 keywords 추출
  → NVIDIA Embedding API 호출 (keywords → 벡터)
  → 문서 저장 (metadata.kwEmbeddings)
  → 그래프 rebuild
    → 모든 문서 쌍에 대해:
        → 각 키워드 벡터 코사인 유사도 계산
        → 유사도 > 0.7이면 엣지 추가
        → 또는 substring 포함 관계면 엣지 추가
```

---

## 5. 문서 정렬 (`app/page.tsx`, `components/knowledge/knowledge-history.tsx`)

### 문제
- 대시보드에서 지식 추가하면 리스트 맨 아래에 추가됨
- 지식 보관소에서 추가하면 맨 위에 추가됨 → 불일치

### 수정
1. **(커밋 `da82c97`)** 대시보드 fetch/추가 후 `createdAt` 기준 내림차순 정렬
2. **(커밋 `b788aa6`)** `createdAt`을 ISO datetime(`YYYY-MM-DDTHH:mm:ss.sssZ`)으로 저장
3. **(커밋 `b788aa6`)** 지식 보관소 fetch/추가/저장 후에도 동일하게 정렬

---

## 6. cleanTextFallback 버그 수정 (`app/api/knowledge/route.ts`)

### 문제
- `cleanTextFallback()`이 필터된 라인(`lines.join('\n\n')`) 대신 원시 `cleaned`를 content로 반환
- 불필요한 라인(이메일, 저작권, 푸터 등)이 제거되지 않고 본문에 남음

### 수정
- **(커밋 `fafb883`)** content를 `cleaned` → `lines.join('\n\n')`으로 변경

---

## 7. 단위 테스트 (`__tests__/knowledge-utils.test.ts`)

### 설정
- Jest + ts-jest 사용
- Jest config: `jest.config.ts` (신규 생성)

### 테스트 항목 (26개, 모두 통과)

| 카테고리 | 테스트명 | 검증 내용 |
|---|---|---|
| extractKeywordsFromContent (4) | English | "AI"가 가장 빈도 높은 키워드 |
| | Korean | "인공지능"이 가장 빈도 높은 키워드 |
| | Stop words | stop word 필터링 확인 |
| | Empty input | 빈 입력 → 빈 배열 |
| normalizeKnowledgeTopic (5) | Company reject | "nvidia" → tech 키워드 "ai"로 fallback |
| | Project reject | "제네시스" → "ai"로 fallback |
| | Tech domain | "자율주행" 그대로 유지 |
| | Empty topic | 첫 번째 키워드 반환 |
| | Empty both | "web" 반환 |
| cosineSimilarity (4) | Identical | 동일 벡터 = 1 |
| | Orthogonal | 직교 벡터 = 0 |
| | Similar | 유사 벡터 > 0.9 |
| | Length mismatch | 길이 다르면 0 |
| cleanTextFallback (5) | Email | 이메일 제거 확인 |
| | Copyright | 저작권 문구 제거 |
| | Footer | "더보기"/"관련 기사" 제거 |
| | Title extraction | 15자 이상 첫 줄이 title |
| | Default title | 빈 입력 → "웹 문서" |
| graph edge logic (8) | Exact match | 동일 키워드 연결 |
| | Cross-language | "ai" ↔ "인공지능": substring 미연결 (임베딩 필요) |
| | Substring | "ai" ↔ "ai 모델": substring 연결 |
| | Unrelated | "자동차" ↔ "요리": 미연결 |
| | Embedding connect | 코사인 유사도 0.7 초과 → 연결 |
| | Embedding reject | 코사인 유사도 0.01/0.99 → 미연결 |
| | No overlap | 임베딩 없고 키워드 겹침 없음 → 미연결 |
| | Multi pair | 여러 키워드 쌍 모두 유사 → 연결 |

### 실행 결과
```
Test Suites: 1 passed, 1 total
Tests:       26 passed, 26 total
Time:        0.883 s
```

---

## 8. 엔터티 개념 제거 및 그래프 UI 정리 (`components/graph/knowledge-graph.tsx`)

### 문제
- 엣지 연결이 키워드 기반으로 바뀌었지만 여전히 노드/패널에 "entity" 개념이 남아 있음
- 초기 줌이 너무 가까워 노드가 화면에 꽉 차서 보기 불편

### 수정
1. **(커밋 `7c81929`)** 초기 fitView padding 0.4, minZoom 0.3, 노드 배치 반경 동적 확장
2. **(커밋 `886ca3c`)** `EntityNode` → `KnowledgeNode`으로 함수/타입명 변경
3. `entityNode` → `knowledgeNode`, `nodeTypes` 매핑 업데이트
4. SummaryPanel: "ENTITY GRAPH" → "KNOWLEDGE GRAPH", "Entity 분포" → "키워드 분포", 설명 텍스트 한국어화
5. MiniMap에서 `entityType` 참조 제거

---

## 9. .clinerules 규칙 추가

### 수정
- 문서화 규칙 섹션 추가: 모든 변경 완료 시 `docs/change-log.md` 업데이트 의무화
- 문제 → 수정 구조, 관련 커밋 해시 기록 요건 명시
- 디자인 프로세스 번호 조정

---

## 10. 지식 추가 본문 파싱 강화 (`app/api/knowledge/route.ts`)

### 문제
- 뉴스 외에 블로그, SNS 등 다양한 사이트의 본문 파싱이 제대로 동작하지 않음
- 인스타그램은 og:title/description만 있고 본문이 별도 구조, 네이버 블로그는 iframe 내 콘텐츠
- 일반 웹보다 정확도가 낮아 저장된 문서의 품질이 떨어짐

### 수정
1. **(커밋 `49ea47a`)** 플랫폼별 파싱 함수 추가:
   - `fetchInstagramContent()`: og:title에서 캡션 추출, og:description에서 본문 추출, 좋아요/댓글/사용자명 등 노이즈 제거
   - `fetchNaverBlogContent()`: `#mainFrame` iframe src 추출 후 내부 HTML 요청, `#postViewArea`/`.se-main-container`에서 본문 추출
2. `fetchWebContent()` 상단에 Instagram/Naver blog 분기 추가
3. 파싱 성공 시 `keywords`, `topic`도 함께 추출해 저장

---

## 11. 키워드 정규화 (`app/api/knowledge/route.ts`)

### 문제
- 영문 키워드에서 "AI"와 "ai"가 서로 다른 키워드로 저장되어 그래프 연결/검색이 불안정
- 한글 키워드에서 "인공지능"과 "인공 지능"이 띄어쓰기 차이로 서로 다른 키워드로 저장됨

### 수정
1. **(커밋 `d71226b`)** `normalizeKeyword()` 추가:
   - `toLocaleLowerCase('ko-KR')`로 영문 대소문자 무시
   - 한글 문자 사이의 띄어쓰기 제거: `([가-힣])\s+([가-힣])` → 병합
   - 나머지 공백은 단일 space로 정규화
2. `extractKeywordsFromContent()` 내 wordCount key 생성 시 `normalizeKeyword()` 적용
3. topic 정규화, embedding `kwList`, fallback keywords에도 `normalizeKeyword()` 적용

---

## 12. LLM 키워드 추출 품질 개선 (`app/api/knowledge/route.ts`)

### 문제
- 블로그 파싱 결과 키워드에 '것이', '오픈' 등 의미 없는 단어가 포함됨
- '오픈소스'처럼 의미 있는 복합어가 분리되어 추출됨

### 수정
1. **(커밋 `e5ccbba`)** systemPrompt의 keywords 지시를 구체화:
   - 조사/어미/접속사/단독 글자('것이','그것','이것','오픈' 등) 금지 명시
   - 복합어는 전체로 추출하도록 지시 ('오픈소스'는 분리 금지)
   - 한글 2글자 이상, 영문 의미있는 단어만 포함

---

## 13. 이미지 설명 수집 및 Vision 모드 텍스트화 (`app/api/knowledge/route.ts`)

### 문제
- 페이지 내 이미지(인포그래픽, 차트, 스크린샷 등)의 내용이 텍스트로 저장되지 않아 지식으로서 가치가 낮음
- 광고 이미지가 포함될 경우 노이즈로 작용

### 수정
1. **(커밋 `b7b384f`)** `callNvidiaVisionModel()` 추가: `microsoft/phi-3-vision-128k-instruct` 모델로 이미지 URL을 텍스트로 변환
2. `fetchWebContent()` 내 이미지 수집 로직 추가:
   - 광고 키워드(`ad`, `banner`, `promo`, `sponsor`, `광고`)가 포함된 이미지 제외
   - 크기가 50x50 미만인 아이콘 제외
   - `alt`, `figcaption` 텍스트가 있는 이미지만 수집
3. 이미지 설명을 LLM 프롬프트에 `[이미지 설명]` 섹션으로 추가해 텍스트와 함께 분석

---

## 커밋 로그 (최신순)

| 해시 | 설명 |
|---|---|
| `b7b384f` | feat: 이미지 설명 수집 및 Vision 모드 텍스트화 (광고 제외) |
| `e5ccbba` | feat: LLM 키워드 추출 프롬프트 개선 - 의미없는 단어 제거 |
| `d71226b` | feat: 키워드 정규화 - 영문 대소문자 무시, 한글 띄어쓰기 무시 |
| `49ea47a` | feat: 인스타그램/네이버 블로그 본문 파싱 지원 |
| `b05345e` | docs: 인스타그램/네이버 블로그 파싱 변경 내역 추가 |
| `0740453` | fix: 날짜별/주제별 필터 버튼 추가 (기간 선택 + topic 선택) |
| `7f92478` | fix: 지식보관소 주제별 필터를 tags 필터에서 topic별 그룹핑으로 전환 |
| `886ca3c` | fix: 엔터티 개념 제거 KnowledgeNode 리네임, .clinerules 문서화 규칙 추가 |
| `7c81929` | fix: 지식그래프 초기 줌 padding 0.4, minZoom 0.3, 노드 간격 동적 확장 |
| `e83746a` | docs: 변경 내역 및 테스트 결과 문서화 |
| `fafb883` | feat: 단위 테스트 추가 + cleanTextFallback 버그 수정 |
| `af89f9a` | feat: 지식그래프 엣지 → NVIDIA 임베딩 코사인 유사도 |
| `8832f86` | fix: 엣지 연결 포함 관계 확장 (AI ↔ AI 모델) |
| `b788aa6` | fix: 지식 추가 후 목록 최신순 정렬 + createdAt ISO datetime |
| `da82c97` | fix: 대시보드/지식보관소 문서 최신순 정렬 |
| `ed6fa04` | fix: 노드 라벨 키워드 우선 + 툴팁 제목/날짜 |
| `d8cc128` | fix: 본문 잘림 안내 문구 추가 |
| `d41692f` | feat: 지식그래프 키워드 기반 연결 + 노드 라벨 개선 |
| `1d49378` | fix: LLM JSON 파싱 실패 대응 + 프롬프트 최적화 |
| `89cc9c4` | fix: LLM 원시 응답 로깅 추가 |
| `32efc74` | fix: topic → 프로젝트명 대신 기술 분야 선택 |

---

## 파일별 변경 요약

| 파일 | 주요 변경 |
|---|---|
| `app/api/knowledge/route.ts` | LLM 파싱 강화, topic 정규화, 임베딩 저장, 잘림 처리, createdAt ISO, cleanTextFallback 버그 수정, Instagram/Naver blog 파싱, 키워드 정규화, LLM 키워드 품질 개선, 이미지 설명 수집 |
| `app/page.tsx` | 그래프 엣지 로직 재작성 (임베딩 유사도 + substring fallback) |
| `components/graph/knowledge-graph.tsx` | 노드 라벨/툴팁 개선, Entity→Knowledge 리네임, 패널 텍스트 수정, 줌/레이아웃 조정 |
| `components/knowledge/knowledge-history.tsx` | 정렬 통일 (createdAt desc), createdAt ISO, 날짜별/주제별 필터 버튼 추가 |
| `__tests__/knowledge-utils.test.ts` | 26개 단위 테스트 (신규) |
| `jest.config.ts` | Jest 설정 (신규) |
| `.clinerules` | 문서화 규칙 (change-log.md 업데이트 의무) 추가 |
| `docs/change-log.md` | 본 문서 |

---

## 14. A2A 병렬 텍스트+이미지 분석 (`app/api/knowledge/route.ts`)

### 문제
- 이미지 분석을 위해 기존 텍스트 LLM 파이프라인을 변경해야 했음
- 이미지가 많은 페이지의 경우 파싱 시간이 길어짐

### 수정
1. **(커밋 `f6b4b39`)** 텍스트 LLM(`meta/llama-3.1-8b-instruct`)은 그대로 유지
2. NVIDIA 무료 Vision 모델(`microsoft/phi-3-vision-128k-instruct`)을 별도 Agent로 추가
3. `Promise.all`로 텍스트 분석과 이미지 분석을 병렬 실행해 속도 향상
4. 이미지 수집 시 광고 이미지 제외, 50x50 미만 아이콘 제외, `alt`/`figcaption` 텍스트 확인
5. Vision 분석 결과를 content에 `[이미지 분석]` 섹션으로 병합
6. 에러 발생 시 `.catch(() => [null, null])`로 fallback 처리
