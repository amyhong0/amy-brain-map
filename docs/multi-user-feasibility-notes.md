# Amy Brain Map 다중 사용자 전환: 운영 적합성 메모

작성일: 2026-08-15

## 현재 구조의 결론

현재 애플리케이션은 하나의 암호화된 Blob 파일에 모든 방문 기록, 개인정보 정책, 분석 결과를 함께 저장한다. 모든 민감 API는 `BROWSER_HISTORY_INGEST_TOKEN`이라는 단일 공유 비밀값을 검증한다. 따라서 여러 사용자가 같은 저장소와 권한을 공유하게 되며, 다중 사용자 서비스에 사용할 수 없다.

## 보안 전환에 필요한 최소 구조

1. Google OpenID Connect 로그인으로 Google `sub`를 영구 사용자 식별자로 사용한다.
2. 서버가 서명·보호하는 세션 쿠키로 웹 API의 사용자 신원을 확인한다.
3. Chrome 확장 프로그램은 서버 비밀값을 보관하지 않는다. 로그인한 사용자가 발급한 단기·단회 연결 코드를 사용해 사용자별 설치 권한을 만든다.
4. 모든 방문 기록·설정·분석 결과는 사용자 ID로 분리한다. 사용자의 API 요청은 세션 사용자 ID와 확장 설치 권한이 같은지 검증한다.
5. 방문 기록 데이터는 웹 클라이언트에 필요 이상으로 노출하지 않으며, 소유자 확인과 사용자별 암호화 경계를 유지한다.

## Vercel Hobby 운영 판단

Vercel Hobby는 개인·소규모 애플리케이션을 위한 무료 플랜이며 상업적 사용에는 적합하지 않다. 공식 문서상 함수 호출 100만 회, 활성 CPU 4시간, 메모리 360GB-시간이 포함되고, 함수는 호출당 최대 300초로 제한된다. Blob은 Hobby에서 사용량 한도 안에서는 무료이나 초과하면 추가 과금 대신 기능 접근이 중지되며 30일 경과를 기다려야 한다.

현재처럼 동기화마다 하나의 전체 저장소를 읽고 쓰는 Blob 기반 설계는 다중 사용자에는 부적합하다. 사용자를 개별 Blob으로 나누고 동기화 빈도를 제한하면 소수 베타 사용자에게는 가능하지만, 행 단위 저장·조회·원자적 갱신이 필요한 공개 다중 사용자 서비스에는 관리형 PostgreSQL이 더 적합하다.

## 운영 선택지

| 선택지 | 적합한 규모 | 장점 | 한계 |
|---|---:|---|---|
| 사용자별 암호화 Blob | 개인·비공개 베타(약 10~30명) | Vercel만으로 빠르게 구성, 별도 DB 계정 없음 | Blob은 조회용 DB가 아니며 쓰기·동시성·사용량 한계가 빠르게 문제 됨 |
| 사용자별 PostgreSQL | 공개 베타 및 성장 단계 | 사용자·설치·방문·그래프를 행 단위로 격리, 안정적 조회와 고유 제약 | 별도 DB 제공자 계정·환경 변수 설정 필요 |

## 참고 자료

- Vercel Blob Pricing: https://vercel.com/docs/vercel-blob/usage-and-pricing
- Vercel Hobby Plan: https://vercel.com/docs/plans/hobby
- Vercel Functions Limits: https://vercel.com/docs/functions/limitations
- Google OAuth web server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Google OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect

## 구현 전 결정이 필요한 사항

- 서비스가 개인·비상업 베타인지, 공개 또는 상업 서비스인지
- 사용자별 Blob 방식으로 빠르게 시작할지, PostgreSQL을 사용해 확장성 있게 시작할지
- Google Cloud Console의 OAuth 웹 클라이언트 생성 및 Vercel 환경 변수 설정 가능 여부

## Google Cloud Storage 검토

Google Cloud Storage(GCS)는 사용자별 암호화된 원본 방문 기록 스냅샷, 내보내기 파일, 분석 감사 파일의 저장소로는 적합하다. 하지만 객체는 변경 불가능한 단위이며 수정할 때 전체 객체를 다시 써야 하므로, 개별 방문 추가, 사용자별 최근 기록 검색, 관계 후보 필터링처럼 자주 바뀌는 서비스의 주 데이터베이스로는 적합하지 않다.

Google Cloud Always Free는 미국 리전에 한해 월 5GB-월 저장, Class A 작업 5,000회, Class B 작업 50,000회, 북미발 아웃바운드 전송 100GB를 제공한다. 따라서 모든 기록을 매 동기화마다 사용자별 단일 객체로 다시 쓰는 방식은 Class A 작업과 전체 객체 재작성 때문에 소수 사용자 베타를 넘기기 어렵다. 무료 한도 초과 시에는 활성 결제 계정에서 표준 요금이 적용된다.

권장 조합은 다음과 같다.

- PostgreSQL: 사용자, 확장 설치, 방문 메타데이터, 그래프 후보, 분석 실행, 개인정보 정책 등 자주 갱신·조회되는 구조화 데이터
- Google Cloud Storage: 사용자별 암호화 원본 백업, 내보내기, 장기 분석 산출물 등 큰 불변 객체
- Vercel: 웹 앱, Google OAuth 콜백, 인증된 API

이 조합이면 방문 기록을 행 단위로 안전하게 격리하면서, 객체 저장소의 장점은 백업·보관에 활용할 수 있다.

### Google Cloud Storage 참고 자료

- Cloud Storage Always Free limits: https://docs.cloud.google.com/free/docs/free-cloud-features
- Cloud Storage pricing: https://cloud.google.com/storage/pricing
- Cloud Storage overview: https://docs.cloud.google.com/storage/docs/introduction
- Google object storage overview: https://cloud.google.com/learn/what-is-object-storage

### GCS 서버 연동 구현 메모

Vercel에서 실행되는 Node.js 서버는 GCS 클라이언트 라이브러리로 비공개 객체를 올리고 내려받는다. 개발 환경에서는 Application Default Credentials(ADC)를 사용할 수 있지만, 배포 환경에서는 Vercel의 비밀 환경 변수 `GCS_SERVICE_ACCOUNT_JSON`에서 서비스 계정 JSON을 메모리로 파싱해 클라이언트를 초기화한다. 서비스 계정은 프로젝트 전체 권한 대신 해당 버킷에만 객체 생성·읽기·삭제 권한을 부여한다. 백업 객체는 애플리케이션 레벨 AES-256-GCM 암호화와 gzip 압축을 적용하며, GCS 기본 서버 측 암호화와 함께 이중 보호한다.

공식 문서: https://docs.cloud.google.com/storage/docs/authentication , https://docs.cloud.google.com/storage/docs/uploading-objects , https://docs.cloud.google.com/storage/docs/downloading-objects
