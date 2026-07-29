# Amy's Brain Office

개인용 AI 지식 관리 시스템으로, 마법 테마의 인터페이스를 통해 문서를 수집, 분석, 시각화합니다.

## 주요 기능

- **AI 채팅 인터페이스** - 자연어로 지식을 검색하고 질문
- **지식 그래프 시각화** - 문서 간 연관관계를 인터랙티브 그래프로 표현 (대소문자/띄어쓰기 정규화 지원)
- **파일 및 이미지 업로드** - PDF, Word(.docx), Markdown(.md) 문서 및 이미지(.jpg, .png)를 업로드하여 고정밀 텍스트 추출 및 자동 파싱
- **웹 스크래핑 및 SNS 파싱** - URL 입력 시 일반 웹페이지 뿐만 아니라 인스타그램 캐러셀 게시물 이미지 내 텍스트까지 완벽하게 추출
- **지식 보관소 및 편집** - 수집된 문서의 히스토리 관리 및 내용 직접 수정 기능 (제목, 본문, 키워드)
- **에이전트 대시보드** - 마법사 테마의 작업 현황 모니터링 (파일 종류에 따른 동적 태스크 표시)

## 기술 스택

- **Frontend**: Next.js 16, React 18, TypeScript
- **Styling**: Tailwind CSS 3.4
- **Animation**: Framer Motion
- **Graph**: React Flow
- **AI**: NVIDIA API, OpenAI 호환
- **Protocol**: MCP (Model Context Protocol)

## 시작하기

### 사전 요구사항

- Node.js 18+
- npm 또는 yarn
- NVIDIA API Key

### 설치

1. 저장소를 클론하고 프로젝트 폴더로 이동:
```bash
cd amys-brain-office
```

2. 의존성 설치:
```bash
npm install
```

3. 환경 변수 설정:
```bash
cp .env.example .env
```

`.env` 파일을 열어 API 키를 입력:
```env
NVIDIA_API_KEY=your_nvidia_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

4. 개발 서버 실행:
```bash
npm run dev
```

5. 브라우저에서 [http://localhost:3000](http://localhost:3000) 열기

## 프로젝트 구조

```
amys-brain-office/
├── app/
│   ├── globals.css            # 전역 스타일 (Tailwind + 커스텀 CSS)
│   ├── layout.tsx             # 루트 레이아웃
│   └── page.tsx               # 메인 애플리케이션 페이지
├── components/
│   ├── agents/
│   │   └── wizard-tower.tsx   # 마법사 타워 대시보드
│   ├── chat/
│   │   └── chat-interface.tsx # AI 채팅 인터페이스
│   ├── graph/
│   │   └── knowledge-graph.tsx # 지식 그래프 시각화
│   └── knowledge/
│       └── knowledge-history.tsx # 지식 보관소
├── lib/
│   └── agents/
│       └── types.ts           # 에이전트 타입 정의
├── .env                       # 환경 변수
├── .env.example               # 환경 변수 템플릿
├── next.config.mjs            # Next.js 설정
├── package.json               # 의존성 및 스크립트
├── tailwind.config.ts         # Tailwind CSS 설정
├── tsconfig.json              # TypeScript 설정
└── README.md                  # 프로젝트 문서
```

## 주요 컴포넌트

### Wizard Tower (`wizard-tower.tsx`)
마법사 타워는 4개의 존으로 구성된 등각 투영 뷰 대시보드입니다:
- **대마법사 (Cauldron)** - 중앙 오케스트레이션 및 작업 분배
- **룬 마스터 (Desk)** - 문서, 텍스트 분석 및 정보 추출
- **일루셔니스트 (Library)** - 이미지, 시각 데이터 및 비전 분석
- **기록가 (Archive)** - 지식 저장 및 관리

### Chat Interface (`chat-interface.tsx`)
AI와의 자연어 채팅 인터페이스로, 메시지 히스토리를 유지하며 지식 검색을 지원합니다.

### Knowledge Graph (`knowledge-graph.tsx`)
React Flow를 활용한 인터랙티브 지식 그래프로, 문서 간 연관관계를 노드와 엣지로 표현합니다.

## 스크립트

```bash
npm run dev      # 개발 서버 시작
npm run build    # 프로덕션 빌드
npm run lint     # ESLint 실행
```

## 특징

- **테마**: 다크 모 기반의 마법/판타지 테마
- **반응형**: 모바일, 태블릿, 데스크톱 지원
- **애니메이션**: Framer Motion을 활용한 부드러운 UI 전환
- **접근성**: WCAG AAA 준수

## 라이선스

MIT

## 기여

이슈 및 풀 리퀘스트는 언제나 환영입니다!