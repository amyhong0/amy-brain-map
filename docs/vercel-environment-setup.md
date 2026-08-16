# Amy Brain Map: Vercel 환경 변수 발급·입력 안내

> **대상**: Amy Brain Map 운영자  
> **현재 운영 도메인**: `https://amy-brain-map.vercel.app`

## 먼저 확인할 점: 다중 사용자 구조가 맞습니다

네. 이 서비스는 **여러 사용자가 각자의 Google 계정으로 로그인하고, 각자의 Chrome 방문 기록만 별도로 저장·분석하는 구조**로 구현되어 있습니다. 운영자만 Vercel·PostgreSQL·GCS의 공용 인프라 비밀값을 등록하며, 일반 사용자는 Google 로그인과 본인 Chrome 확장 프로그램 연결 코드만 사용합니다.

```mermaid
flowchart LR
  U1[사용자 A: Google 계정] --> S[세션 사용자 ID]
  U2[사용자 B: Google 계정] --> S2[다른 세션 사용자 ID]
  S --> E1[사용자 A의 확장 설치 토큰]
  S2 --> E2[사용자 B의 확장 설치 토큰]
  E1 --> D[(PostgreSQL: user_id A)]
  E2 --> D2[(PostgreSQL: user_id B)]
  D --> G[(GCS: 사용자 A 암호화 보관 경로)]
  D2 --> G2[(GCS: 사용자 B 암호화 보관 경로)]
```

| 경계 | 실제 동작 |
|---|---|
| **Google 로그인** | Google OpenID Connect의 고유 `sub` 값을 사용자 영구 식별자로 저장합니다. |
| **Chrome 연결** | 사용자가 발급한 단회·10분 유효 연결 코드가 해당 Chrome 프로필의 설치 토큰으로 교환됩니다. |
| **방문 기록** | 동기화 요청은 설치 토큰의 소유자와 연결된 `user_id`로만 저장됩니다. 다른 사용자의 ID를 요청 본문으로 지정할 수 없습니다. |
| **질의·그래프·정책** | 웹 API는 로그인 세션의 `user_id`를 기준으로만 조회·수정합니다. |
| **백업·내보내기** | GCS 객체 경로와 PostgreSQL 보관 메타데이터가 모두 사용자 범위로 제한됩니다. |

## Vercel에서 변수 넣는 공통 방법

1. [Vercel Dashboard](https://vercel.com/dashboard)에서 **Amy Brain Map 프로젝트**를 엽니다.
2. **Settings → Environment Variables**로 이동합니다.
3. 변수 이름과 값을 입력하고, 우선 **Production**만 선택해 저장합니다.
4. 모든 값이 준비되면 **Deployments → Redeploy**를 실행합니다. Vercel 환경 변수 변경은 이미 완료된 배포에 자동으로 적용되지 않습니다.[1]

> 비밀값에는 `NEXT_PUBLIC_` 접두사를 붙이지 마십시오. 이 접두사가 붙은 변수는 브라우저 코드에 노출될 수 있습니다. `NEXT_PUBLIC_APP_URL`만 공개 가능한 서비스 주소이므로 예외입니다.

## 로그인 오류를 먼저 해결하는 최소 설정

현재 `ERR_CONNECTION_REFUSED`를 해결하려면 다음 다섯 항목이 우선 필요합니다. PostgreSQL 스키마 적용까지 마친 뒤 재배포해야 Google 로그인이 완전히 작동합니다.

| 변수 | 어디에서 값을 찾거나 만드는가 | Vercel에 넣을 값 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | 별도 발급 없음 | `https://amy-brain-map.vercel.app` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Google Auth Platform → Clients → OAuth 2.0 Client ID | 기존 Client ID 전체 |
| `GOOGLE_CLIENT_SECRET` | 위와 같은 OAuth Client 상세 화면 | 기존 Client secret 전체 |
| `AUTH_SESSION_SECRET` | 운영자가 새로 생성 | 아래 방법으로 만든 32자 이상 무작위 문자열 |
| `DATABASE_URL` | Neon Console → Project → **Connect** | PostgreSQL pooled connection string 전체 |

### 1. `NEXT_PUBLIC_APP_URL`

이 값은 Vercel에서 직접 입력합니다. 아래 값을 **그대로** 복사해 Production에 넣으세요.

```text
https://amy-brain-map.vercel.app
```

마지막 `/`는 넣지 않습니다.

### 2. `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`

1. [Google Cloud Console](https://console.cloud.google.com/)에서 OAuth를 만든 프로젝트를 엽니다.
2. **Google Auth Platform → Clients** 또는 **APIs & Services → Credentials**로 이동합니다.
3. Amy Brain Map용 **Web application** OAuth 클라이언트를 선택합니다.
4. 표시되는 **Client ID**를 `GOOGLE_CLIENT_ID`에, **Client secret**을 `GOOGLE_CLIENT_SECRET`에 각각 넣습니다.
5. 해당 클라이언트의 **Authorized redirect URIs**에 아래 주소를 정확히 추가하고 저장합니다.

```text
https://amy-brain-map.vercel.app/api/auth/callback
```

OAuth는 등록된 redirect URI와 실제 요청의 URI가 일치해야 합니다.[2]

### 3. `AUTH_SESSION_SECRET`

이 값은 외부 사이트에서 받는 키가 아닙니다. 운영자가 한 번 생성하는 서비스 전용 비밀값입니다. 신뢰할 수 있는 로컬 터미널에서 다음 명령을 실행합니다.

```bash
openssl rand -base64 48
```

출력된 한 줄 전체를 Vercel의 `AUTH_SESSION_SECRET` 값으로 넣습니다. 이 값은 Google OAuth의 요청 상태를 보호하고, 사용자 로그인 세션을 서명·검증하는 데 사용됩니다.

> 이 값을 바꾸면 기존 로그인 세션은 무효화됩니다. GitHub, 메시지, 스크린샷에는 절대 넣지 마십시오.

### 4. `DATABASE_URL`: Neon PostgreSQL 연결 문자열

1. [Neon Console](https://console.neon.tech/)에서 가입 또는 로그인합니다.
2. **New project**를 누르고 프로젝트를 만듭니다. 예: `amy-brain-map-prod`.
3. 프로젝트 대시보드에서 **Connect**를 누릅니다.
4. 연결 유형으로 **pooled connection**을 선택하고 PostgreSQL connection string 전체를 복사합니다.
5. 그 값 전체를 Vercel의 `DATABASE_URL`에 붙여넣습니다.

대개 다음처럼 시작합니다.

```text
postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require
```

서버리스 환경에서는 연결을 재사용하도록 설계된 pooled 연결 문자열이 적합합니다.[3]

### 5. PostgreSQL 초기 테이블 만들기

`DATABASE_URL`을 넣는 것만으로 테이블이 생기지는 않습니다. 로컬 컴퓨터에서 이 저장소를 연 뒤 아래 명령을 한 번 실행합니다.

```bash
npm ci
npm run db:migrate
```

이 작업은 사용자·세션·Chrome 설치 권한·방문 기록·그래프 후보·개인정보 정책·GCS 보관 메타데이터 테이블을 생성합니다. 이 단계가 완료되지 않으면 Google OAuth가 Google 계정 인증을 마쳐도 사용자 세션을 저장하지 못합니다.

## GCS 백업·내보내기에 필요한 설정

다음 세 변수는 로그인 버튼 자체를 막지는 않지만, 사용자별 암호화 백업과 **내 기록 내보내기** 기능을 사용하려면 필요합니다.

| 변수 | 어디에서 값을 찾거나 만드는가 | Vercel에 넣을 값 |
|---|---|---|
| `GCS_BUCKET_NAME` | Google Cloud Console → Cloud Storage → Buckets | 버킷 이름만 입력 |
| `GCS_SERVICE_ACCOUNT_JSON` | Google Cloud Console → IAM 및 관리자 → 서비스 계정 → JSON 키 생성 | 다운로드한 JSON 파일의 **내용 전체** |
| `HISTORY_BACKUP_ENCRYPTION_KEY` | 운영자가 새로 생성 | 64자리 16진수 무작위 값 |

### 6. `GCS_BUCKET_NAME`

1. Google Cloud Console에서 OAuth 프로젝트와 같은 프로젝트를 열거나, GCS 전용 프로젝트를 선택합니다.
2. **Cloud Storage → Buckets → Create**를 선택합니다.
3. 전 세계에서 고유한 버킷 이름을 입력합니다. 예: `amy-brain-map-prod-your-unique-suffix`.
4. 위치는 소규모 운영 시 `us-central1`, 기본 스토리지 클래스는 `Standard`를 선택합니다.
5. **Public access prevention**을 `Enforced`, **Uniform bucket-level access**를 `Enabled`로 설정합니다.
6. 생성한 버킷 이름만 `GCS_BUCKET_NAME`에 입력합니다. `gs://`는 넣지 않습니다.

### 7. `GCS_SERVICE_ACCOUNT_JSON`

1. Google Cloud Console에서 **IAM 및 관리자 → 서비스 계정**을 엽니다.
2. **서비스 계정 만들기**를 누르고 예: `amy-brain-map-gcs`라는 이름으로 만듭니다.
3. 생성한 버킷의 **Permissions** 탭에서 이 서비스 계정에 `Storage Object Admin` 역할을 부여합니다. 프로젝트 전체 권한이 아니라 **해당 버킷에만** 부여합니다.
4. 서비스 계정 상세 화면에서 **Keys → Add key → Create new key → JSON**을 선택합니다.
5. 내려받은 JSON 파일을 텍스트 편집기로 열고, 처음 `{`부터 마지막 `}`까지 **전체 내용**을 복사합니다.
6. 이 내용을 Vercel의 `GCS_SERVICE_ACCOUNT_JSON` 값에 붙여넣습니다.

Cloud Storage 접근은 서비스 계정 IAM 권한으로 제어해야 하며, 객체 업로드·읽기에 필요한 역할을 버킷 범위로 제한하는 것이 좋습니다.[4] 서비스 계정 JSON 키는 고위험 비밀값이므로 저장소에 커밋하거나 공유하지 마십시오.

### 8. `HISTORY_BACKUP_ENCRYPTION_KEY`

이 값도 외부에서 받지 않고 운영자가 생성합니다. 다음 명령을 실행합니다.

```bash
openssl rand -hex 32
```

정확히 64자리 16진수 문자열이 생성됩니다. 출력값 전체를 `HISTORY_BACKUP_ENCRYPTION_KEY`에 넣습니다.

> `AUTH_SESSION_SECRET`과 **절대 같은 값을 사용하지 마십시오**. 이 키를 잃거나 변경하면 기존 GCS 백업을 복호화할 수 없습니다.

## 선택 변수

| 변수 | 어디에서 찾는가 | 필요한 경우 |
|---|---|---|
| `TAVILY_API_KEY` | [Tavily Dashboard](https://app.tavily.com/)에서 API key 생성 | 사용자가 **웹 검색** 토글을 켰을 때 공개 웹 정보를 보강하려는 경우 |
| `NVIDIA_API_KEY` | [NVIDIA API Catalog](https://build.nvidia.com/)의 API 키 관리 화면 | AI 응답을 자연스럽게 구성하기 위해 필요합니다. 현재 값은 유지합니다. |

`OPENAI_API_KEY`는 일부 범용 보조 코드에서 참조될 수 있으나, Amy Brain Map의 현재 방문 기록 분석·대화형 지도 흐름에는 추가할 필요가 없습니다.

## 최종 Vercel 변수 목록

| 변수 | Production | 값의 출처 |
|---|---:|---|
| `NEXT_PUBLIC_APP_URL` | 필수 | `https://amy-brain-map.vercel.app` 직접 입력 |
| `GOOGLE_CLIENT_ID` | 필수 | Google OAuth Client 화면 |
| `GOOGLE_CLIENT_SECRET` | 필수 | Google OAuth Client 화면 |
| `AUTH_SESSION_SECRET` | 필수 | `openssl rand -base64 48`로 생성 |
| `DATABASE_URL` | 필수 | Neon pooled connection string |
| `NVIDIA_API_KEY` | 필수 | 현재 값 유지 |
| `GCS_BUCKET_NAME` | 필수 | 생성한 GCS 버킷 이름 |
| `GCS_SERVICE_ACCOUNT_JSON` | 필수 | 서비스 계정 JSON 키 전체 내용 |
| `HISTORY_BACKUP_ENCRYPTION_KEY` | 필수 | `openssl rand -hex 32`로 생성 |
| `TAVILY_API_KEY` | 선택 | Tavily API key |

## 설정 순서 요약

1. Vercel의 기존 Blob·공용 토큰 변수 5개를 삭제합니다.
2. `NEXT_PUBLIC_APP_URL`, `AUTH_SESSION_SECRET`, `DATABASE_URL`을 설정합니다.
3. Google OAuth redirect URI를 새 도메인 콜백으로 등록합니다.
4. 로컬에서 `npm run db:migrate`를 한 번 실행합니다.
5. GCS 버킷·서비스 계정·암호화 키를 만들고 관련 변수 3개를 추가합니다.
6. Vercel의 Git 연결이 `amyhong0/amy-brain-map`인지 확인한 뒤 Production을 재배포합니다.
7. Google 계정이 서로 다른 두 브라우저 프로필로 로그인해, 각 계정에서 별도의 Chrome 연결 코드가 발급되는지 확인합니다.

## 참고 자료

[1]: https://vercel.com/docs/environment-variables "Vercel Environment Variables"
[2]: https://developers.google.com/identity/protocols/oauth2/web-server "Google OAuth 2.0 for Web Server Applications"
[3]: https://neon.com/docs/connect/connect-from-any-app "Neon: Connect from any application"
[4]: https://docs.cloud.google.com/storage/docs/authentication "Google Cloud Storage authentication"
