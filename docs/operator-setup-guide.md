# Amy Brain Map 운영자 설정 가이드

> **목적**: 이 문서는 Amy Brain Map을 다중 사용자 서비스로 운영하기 위해 운영자가 한 번만 수행할 외부 서비스 설정을 정리합니다. 웹 사용자는 Google 로그인과 Chrome 확장 프로그램 연결만 하면 되며, 아래 계정·비밀값을 알거나 입력할 필요가 없습니다.

## 1. 확정 아키텍처

Amy Brain Map은 Vercel을 애플리케이션 배포와 서버 API 실행에만 사용합니다. 사용자별 방문 기록 메타데이터와 지식 그래프는 관리형 PostgreSQL에 저장하고, 원본 백업·내보내기·장기 분석 산출물은 Google Cloud Storage(GCS)에 보관합니다.

| 구성 요소 | 권장 서비스 | 담당 역할 | 운영자가 해야 할 일 |
|---|---|---|---|
| 웹 앱·API | Vercel | Next.js 배포, Google 로그인 콜백, 인증된 API 실행 | 기존 Vercel 프로젝트에 환경 변수 등록 및 재배포 |
| 주 데이터베이스 | Neon PostgreSQL | 사용자, 세션, 확장 설치, 방문 메타데이터, 그래프 후보, 개인정보 설정 | Neon 계정·프로젝트 생성 후 연결 문자열 등록 |
| 객체 저장소 | Google Cloud Storage | 사용자별 암호화 백업, 내보내기, 장기 분석 파일 | 비공개 버킷·전용 서비스 계정 생성 후 자격 증명 등록 |
| 로그인 | Google Cloud OAuth | Google 계정 로그인 및 영구 사용자 식별 | OAuth 동의 화면과 웹 클라이언트 생성 |

GCS는 변경할 때 객체 전체를 다시 쓰는 객체 저장소이므로, 방문 한 건 단위의 추가·검색·그래프 업데이트가 반복되는 주 데이터베이스 역할에는 적합하지 않습니다. 반대로 원본 백업과 내보내기처럼 큰 파일을 저장하는 역할에는 적합합니다.[1]

## 2. 준비 전 확인할 사항

운영자는 다음 계정에 접근할 수 있어야 합니다. 모든 서비스는 소규모 베타의 경우 무료 구간에서 시작할 수 있지만, 무료 한도는 언제든 변경될 수 있고 초과 사용량은 청구될 수 있습니다.

| 계정 | 필요한 권한 | 용도 |
|---|---|---|
| Vercel | 해당 프로젝트의 환경 변수 수정·배포 권한 | 웹 앱 배포 및 비밀값 등록 |
| Neon | 새 데이터베이스 프로젝트 생성 권한 | 관리형 PostgreSQL 제공 |
| Google Cloud | 프로젝트 생성·결제 계정 연결·IAM 수정 권한 | OAuth와 GCS 설정 |

Google Cloud의 Always Free 구간을 사용하려면 활성 상태의 Cloud Billing 계정이 필요합니다. GCS Always Free는 `us-east1`, `us-west1`, `us-central1`을 합산하여 월 5GB-월 저장, Class A 작업 5,000회, Class B 작업 50,000회, 북미발 외부 전송 100GB를 제공합니다.[2] 초기에는 **암호화 백업을 하루 단위 또는 내보내기 요청 시에만 생성**하도록 구성해 작업 수를 관리합니다.

## 3. PostgreSQL 설정: Neon을 독립적으로 사용하기

Vercel Marketplace를 통해 데이터베이스를 만들지 않아도 됩니다. [Neon](https://neon.com/)에서 계정을 직접 만들고, 발급받은 표준 PostgreSQL 연결 문자열을 Vercel 프로젝트에 환경 변수로 넣는 방식으로 구성합니다. 이렇게 하면 데이터베이스 계정·과금·관리 권한은 Neon에, 배포만 Vercel에 분리됩니다.

### 3.1 Neon 프로젝트 만들기

1. [Neon Console](https://console.neon.tech/)에서 계정을 만들고 로그인합니다.
2. **New project**를 선택하고 프로젝트 이름을 `amy-brain-map-prod`처럼 구분하기 쉽게 정합니다.
3. 리전은 주 사용자와 가장 가까운 사용 가능한 리전을 선택합니다. 백업 파일은 GCS의 `us-central1`에 보관하므로, 두 저장소가 꼭 같은 리전일 필요는 없습니다.
4. 생성이 끝나면 프로젝트 대시보드에서 **Connect**를 누릅니다.
5. 기본으로 표시되는 **pooled connection string**을 복사합니다. Neon의 pooled 연결은 동시 연결 수가 많은 서버리스 실행 환경에 적합하며, 연결 문자열은 일반적으로 `DATABASE_URL` 환경 변수에 그대로 저장합니다.[3]

> **중요**: 연결 문자열에는 데이터베이스 비밀번호가 들어 있습니다. 이 값을 GitHub, 소스 코드, 스크린샷, 공개 문서에 넣지 마십시오.

## 4. Google Cloud 프로젝트와 GCS 설정

### 4.1 Google Cloud 프로젝트 만들기

1. [Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트를 만듭니다. 예: `amy-brain-map-prod`.
2. 해당 프로젝트에 결제 계정을 연결합니다. Always Free 한도 안에 머물면 서비스 사용료는 발생하지 않지만, 예산 알림을 반드시 설정하는 것을 권장합니다.[2]
3. 상단 검색에서 **Cloud Storage**를 열고, 처음 사용하는 경우 Cloud Storage API 사용을 활성화합니다.

### 4.2 비공개 버킷 만들기

Cloud Storage에서 **Create bucket**을 선택한 뒤 아래처럼 구성합니다.

| 항목 | 권장 값 | 이유 |
|---|---|---|
| 버킷 이름 | `amy-brain-map-prod-<임의의-영문숫자>` | 버킷 이름은 전 세계에서 고유해야 합니다. |
| 위치 유형·리전 | Region · `us-central1` | GCS Always Free 대상 미국 리전이며, 백업·내보내기 비용을 최소화하기 좋습니다.[2] |
| 기본 스토리지 클래스 | Standard | 백업 복원·내보내기에서 즉시 읽을 수 있으며 최소 보관 기간이 없습니다.[4] |
| Public access prevention | **Enforced** | 실수로 `allUsers` 또는 `allAuthenticatedUsers`에 공개되는 일을 방지합니다.[5] |
| Uniform bucket-level access | **Enabled** | 개별 객체 ACL 대신 IAM으로만 권한을 통제합니다. |

이 버킷에는 사용자별 원본 방문 기록을 평문으로 올리지 않습니다. 애플리케이션이 사용자 식별자를 해시한 비공개 경로 아래에 AES-256-GCM 암호화·gzip 압축 파일만 저장하며, GCS도 저장 데이터에 서버 측 암호화를 기본 적용합니다.[6]

### 4.3 GCS 전용 서비스 계정 만들기

1. Google Cloud Console에서 **IAM 및 관리자 → 서비스 계정**으로 이동합니다.
2. **서비스 계정 만들기**를 선택하고 이름을 `amy-brain-map-gcs`로 지정합니다.
3. 프로젝트 전체 권한 대신, 방금 만든 **버킷의 권한 탭**에서 이 서비스 계정에 `Storage Object Admin` 역할을 부여합니다. 이 권한은 애플리케이션이 자신의 백업·내보내기 객체를 만들고, 읽고, 삭제하는 데 사용합니다.
4. 서비스 계정의 **키 → 키 추가 → 새 키 만들기 → JSON**을 선택해 JSON 키를 한 번만 내려받습니다. Google은 키 파일을 내려받은 뒤 다시 다운로드할 수 없다고 안내하므로, 안전한 비밀 보관소에 보관합니다.[7]
5. 키 파일의 전체 내용을 다음 단계에서 Vercel 환경 변수 `GCS_SERVICE_ACCOUNT_JSON` 값으로 등록합니다. 파일을 GitHub 저장소에 올리지 마십시오.

> **보안 원칙**: 서비스 계정 키는 외부 서비스에서 Google Cloud 자원에 접근할 때 쓰는 고위험 비밀값입니다. 유출이 의심되면 Google Cloud에서 즉시 키를 삭제하고 새 키를 만든 뒤 Vercel 환경 변수를 교체하십시오. 장기적으로는 키 대신 단기 자격 증명을 쓰는 방식이 더 안전하지만, 이 프로젝트에서는 Vercel 배포 환경과의 단순한 연동을 위해 최소 권한의 전용 키를 사용합니다.[7]

## 5. Google 로그인(OAuth) 설정

Amy Brain Map의 로그인은 `openid`, `email`, `profile` 범위만 요청합니다. **Chrome 방문 기록은 Google 계정에서 가져오지 않으며**, 사용자가 설치·연결한 Chrome 확장 프로그램에서만 URL·제목·방문 시각·방문 횟수를 수집합니다.

### 5.1 OAuth 동의 화면 준비

1. Google Cloud Console의 **Google Auth Platform** 또는 **APIs & Services → OAuth consent screen**을 엽니다.
2. 외부 사용자가 로그인할 서비스이므로 Audience를 **External**로 선택합니다.
3. 앱 이름을 `Amy Brain Map`으로 입력하고, 사용자 지원 이메일과 개발자 연락처 이메일을 입력합니다.
4. 공개 배포 전에 개인정보처리방침 URL과 서비스 홈페이지 URL을 등록합니다. 개인정보처리방침에는 수집 항목이 URL·제목·시각·횟수이며 페이지 본문을 수집하지 않는다는 원칙을 명시합니다.
5. 테스트 모드에서는 실제 테스트에 사용할 Google 계정만 Test users에 추가합니다. 일반 사용자가 로그인할 시점에는 Publishing status를 Production으로 전환합니다.

### 5.2 OAuth 웹 클라이언트 만들기

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**로 이동합니다.
2. Application type은 **Web application**을 선택하고 이름을 `Amy Brain Map Production`으로 지정합니다.
3. **Authorized redirect URI**에 아래 주소를 정확히 등록합니다. `YOUR_DOMAIN`만 실제 Vercel 배포 도메인 또는 연결한 사용자 도메인으로 바꿉니다.

```text
https://YOUR_DOMAIN/api/auth/callback
```

4. 생성 직후 보이는 Client ID와 Client secret을 복사해 안전하게 보관합니다. OAuth 리디렉션 URI는 스킴, 대소문자, 마지막 슬래시까지 등록한 값과 정확히 일치해야 하며, 다르면 `redirect_uri_mismatch` 오류가 발생합니다.[8]

> Vercel Preview 주소는 배포마다 달라질 수 있으므로 운영 OAuth 클라이언트의 Redirect URI로 사용하지 않습니다. 운영 도메인 하나를 기준으로 로그인 흐름을 확인하십시오.

## 6. Vercel 환경 변수 등록

Vercel 프로젝트에서 **Settings → Environment Variables**로 이동하여 다음 값을 등록합니다. Vercel의 환경 변수는 소스 코드 밖에 저장되며, 변경 뒤에는 새 배포에만 적용됩니다.[9]

| 이름 | 값 | 필수 | 등록 환경 | 비고 |
|---|---|---:|---|---|
| `DATABASE_URL` | Neon의 pooled PostgreSQL 연결 문자열 전체 | 예 | Production | `postgresql://...-pooler...` 형태 |
| `GCS_BUCKET_NAME` | 생성한 버킷 이름 | 예 | Production | `gs://`를 붙이지 않습니다. |
| `GCS_SERVICE_ACCOUNT_JSON` | 서비스 계정 JSON 키 **전체 내용** | 예 | Production | 한 줄로 압축하지 말고 유효한 JSON 그대로 붙여넣습니다. |
| `GOOGLE_CLIENT_ID` | OAuth 웹 클라이언트 ID | 예 | Production | 공개 키 성격이지만 환경 변수로 함께 관리합니다. |
| `GOOGLE_CLIENT_SECRET` | OAuth 웹 클라이언트 secret | 예 | Production | 절대 클라이언트 코드에 노출하지 않습니다. |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR_DOMAIN` | 예 | Production | 마지막 `/` 없이 입력합니다. |
| `AUTH_SESSION_SECRET` | 32자 이상의 고유 무작위 문자열 | 예 | Production | OAuth 상태와 세션 보호에 사용합니다. 비밀번호 관리자 생성기를 권장합니다. |
| `HISTORY_BACKUP_ENCRYPTION_KEY` | 64자리 16진수 무작위 값 | 예 | Production | GCS에 올리기 전 방문 기록 백업을 AES-256-GCM으로 암호화합니다. |
| `NVIDIA_API_KEY` | 기존 NVIDIA API 키 | 예 | Production | 기존 AI 대화 기능 유지용 |
| `TAVILY_API_KEY` | 기존 Tavily API 키 | 선택 | Production | 웹 검색 토글을 켤 경우에만 필요 |

`AUTH_SESSION_SECRET`와 `HISTORY_BACKUP_ENCRYPTION_KEY`는 서로 다른 값이어야 합니다. 서비스 운영 중 이 값을 바꾸면 기존 로그인 세션이 무효화되거나 이전 GCS 백업을 복호화하지 못할 수 있으므로, 별도의 비밀 보관소에 백업하고 교체 절차를 문서화하십시오.

### 6.1 PostgreSQL 초기 스키마 적용

`DATABASE_URL`을 개발 컴퓨터의 환경 변수 또는 `.env.local`에 설정한 뒤, 이 저장소에서 아래 명령을 **한 번만** 실행합니다. 이 명령은 사용자·세션·확장 설치·방문 기록·정책·그래프 후보·GCS 보관 메타데이터 테이블을 만듭니다.

```bash
npm ci
npm run db:migrate
```

이 단계가 끝난 뒤 Vercel에서 새 Production 배포를 실행합니다. Vercel은 배포와 API 실행만 담당하며, 데이터베이스를 대신 생성하지 않습니다.

다중 사용자 전환이 완료되면 기존 단일 사용자용 `BROWSER_HISTORY_INGEST_TOKEN`과 `BROWSER_HISTORY_ENCRYPTION_KEY`는 더 이상 사용하지 않습니다. 이전 Blob 데이터가 있다면 삭제 전에 별도 백업을 확인하십시오.

## 7. 설정 완료 점검표

| 확인 항목 | 완료 기준 |
|---|---|
| Neon | `DATABASE_URL`을 안전하게 보관했고 Vercel Production에 등록했습니다. |
| GCS | 비공개 버킷, Public Access Prevention, 전용 서비스 계정, 버킷 수준 최소 권한을 구성했습니다. |
| Google OAuth | 운영 도메인의 `/api/auth/callback`을 정확히 등록했고 Client ID/Secret을 Vercel에 넣었습니다. |
| PostgreSQL 스키마 | `DATABASE_URL`을 설정한 환경에서 `npm run db:migrate`를 한 번 실행했습니다. |
| Vercel | 표의 필수 환경 변수를 Production에 등록했고, 비밀값을 소스 코드에 넣지 않았습니다. |
| 비용 보호 | Google Cloud Billing 예산 알림을 활성화했고 Neon 사용량 화면을 확인할 수 있습니다. |
| 배포 | 환경 변수 등록 뒤 Vercel에서 새 Production 배포를 실행합니다.[9] |

## 참고 자료

[1]: https://cloud.google.com/learn/what-is-object-storage "Google Cloud: Object storage"
[2]: https://docs.cloud.google.com/free/docs/free-cloud-features "Google Cloud Free Tier"
[3]: https://neon.com/docs/connect/connect-from-any-app "Neon: Connect from any application"
[4]: https://cloud.google.com/storage/pricing "Cloud Storage pricing"
[5]: https://docs.cloud.google.com/storage/docs/public-access-prevention "Cloud Storage: Public access prevention"
[6]: https://docs.cloud.google.com/storage/docs/introduction "Cloud Storage overview"
[7]: https://docs.cloud.google.com/iam/docs/keys-create-delete "Google Cloud: Create and delete service account keys"
[8]: https://developers.google.com/identity/protocols/oauth2/web-server "Google OAuth 2.0 for Web Server Applications"
[9]: https://vercel.com/docs/environment-variables "Vercel: Environment variables"
