# 연수온 공개 랜딩페이지

교육기관 연수담당자를 위한 연수온 v3.2.2 안내·다운로드·튜토리얼·경험 설문 페이지입니다. `SPEC.md`를 기준으로 정적 HTML/CSS/JavaScript와 Vercel Node.js 함수만 사용합니다. 외부 폰트, 분석 스크립트, 프런트엔드 프레임워크는 없습니다. 직접 설치하는 npm 의존성은 `@vercel/blob` 하나입니다.

- 공개 페이지: <https://yeonsuon.vercel.app>
- GitHub 저장소: <https://github.com/Obito-AI/yeonsuon>

## 실행과 검증

Node.js 22 이상을 사용하세요.

```sh
npm ci
npm test
npm run check
npm run dev
```

로컬 주소는 `http://127.0.0.1:3000`입니다. `PORT=3001 npm run dev`로 포트를 변경할 수 있습니다. 개발 서버는 loopback에만 바인딩하고 `public/`의 정적 파일과 `/api/feedback`만 제공합니다. MP4 범위 요청을 지원합니다.

토큰 없는 로컬 실행에서는 실제 설문 저장이 **실패(503)** 하며 입력 유지·재시도·응답 복사 동작을 확인할 수 있습니다. 개발 서버는 가짜 성공을 반환하지 않습니다. `npm test`는 저장소 호출을 대체하므로 실제 Blob에 쓰지 않습니다. 테스트용 데이터만 입력하세요.

실제 저장 연결을 로컬에서 확인해야 한다면 별도의 **private** Blob 테스트 저장소 토큰을 서버 환경 변수로 설정하세요. Node의 환경 파일 로딩을 사용할 수 있습니다(파일은 Git에서 제외됩니다).

```sh
cp .env.example .env.local
# .env.local에 테스트 저장소 토큰 설정
node --env-file=.env.local scripts/dev.mjs
```

`npm run check`는 JS 구문, HTML 레이블·ARIA 참조·정적 링크, CSP 호환성, API 로딩, 설정·잠금 파일 일치, 배포 자산의 SHA-256을 확인합니다. `npm test`는 Node 내장 test runner로 콘텐츠, 검증 경계, API, 실제 로컬 HTTP, 폼 상태 전이를 검증합니다.

## 구조

```text
public/index.html              한국어 랜딩페이지
public/styles.css              반응형 스타일, 키보드 포커스, 동작 줄이기
public/feedback.js             설문 제출·실패 복구·동의 제어
public/feedback-model.js       클라이언트/서버 공용 순수 검증
public/favicon.svg             자체 제작 벡터 아이콘
public/tutorial-poster.svg     자체 제작 영상 표지
public/downloads/…html         제공된 배포 파일, 수정 금지
public/video/…mp4              제공된 튜토리얼, 수정 금지
api/feedback.js                Vercel 함수 진입점
lib/feedback.js                요청 제한·Origin 검증·비공개 저장
scripts/dev.mjs                로컬 미리보기/실제 API 어댑터
scripts/check.mjs              의존성 추가 없는 정적 검증
```

## Vercel 연결 설정

1. 프로젝트는 **Other** 프레임워크로 설정합니다. 정적 출력은 `public`이며 `vercel.json`에 명시했습니다. 별도의 빌드 명령은 필요하지 않습니다. Node.js 런타임은 22 이상을 사용합니다.
2. Vercel Storage의 **private Blob store** `yeonsuon-feedback`을 Production/Preview/Development에 OIDC 방식으로 연결했습니다. 정적 클라이언트에는 쓰기 자격 증명이 노출되지 않습니다. public 저장소로 바꾸면 private 업로드가 실패하도록 구성되어 있습니다.
3. 빌드 환경 `NODEJS_HELPERS=0`은 `vercel.json`의 `build.env`에 설정되어 있습니다. Vercel의 자동 body helper를 비활성화해 원본 스트림을 직접 읽고 **32,768바이트**를 제한합니다. 이 설정을 제거하지 마세요.
4. `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`을 통해 현재 Preview/Production HTTPS Origin을 허용합니다. Vercel 프로젝트의 시스템 환경 변수 노출을 활성화해 두세요. 별도 커스텀 도메인/별칭이 있으면 `FEEDBACK_ALLOWED_ORIGINS=https://example.org,https://www.example.org`처럼 정확한 Origin만 추가합니다(경로·끝 슬래시 제외).
5. Preview에서 저장을 검증할 때도 실제 데이터가 private store에 생성됩니다. 테스트 토큰/저장소를 분리하고 테스트 응답은 관리자가 대시보드에서 정리하세요.

제공된 자산은 변경하거나 빌드 과정에서 재생성하지 않습니다. 다운로드 응답은 `Content-Disposition: attachment`와 sandbox CSP를 사용합니다. 이 헤더는 호스팅 URL에서 실행되는 것을 막으며, 내려받아 로컬에서 여는 HTML 파일의 내용을 변경하지 않습니다. 랜딩페이지에는 별도의 same-origin CSP, 모든 응답에는 기본 보안 헤더가 적용됩니다.

## 설문과 API 계약

`POST /api/feedback`, `Content-Type: application/json`. 필수 필드는 다음과 같습니다.

| 필드 | 허용 값 |
|---|---|
| `institution` | `school`, `education-office`, `support-office`, `training-institute`, `other` |
| `stage` | `exploring`, `downloaded`, `testing`, `operating` |
| `satisfaction`, `ease` | 정수 1~5 |
| `recommendation` | 정수 0~10 (0도 유효한 응답) |

선택 필드: `experience` (`""`, `under-1`, `1-3`, `4-9`, `10-plus`), `usefulFeatures` (중복 없는 기능 배열, 최대 8개), `difficulties`/`improvements` (각 2,000자), `interviewConsent` (boolean), `contact` (200자), `website` (빈 문자열 허니팟). 문자열은 앞뒤 공백 제거 후 길이를 검사하며, 전체 요청 원본 바이트 제한은 별도로 적용합니다. `contact`는 `interviewConsent: true`일 때만 비어 있지 않을 수 있습니다. 동의해도 연락처는 선택입니다. 알 수 없는 필드, 잘못된 타입, 범위 밖 점수, 중복 기능, 채워진 허니팟은 거절합니다.

- 저장 성공: `201 {"ok":true}`. UI는 성공을 확인한 후 초기화합니다.
- 잘못된 입력/JSON: `400`; 잘못되거나 누락된 Origin: `403`; POST 이외 메서드: `405` (`Allow: POST`); 32 KB 초과: `413`; JSON 외 타입: `415`; 저장 실패: `503`.
- 허용 Origin은 정확히 일치해야 합니다. `Host`/`X-Forwarded-Host`를 신뢰해 허용 목록을 만들지 않습니다. localhost HTTP Origin은 로컬 개발 환경에서만 허용합니다. 이 검사는 브라우저 교차 출처 제출을 제한하며, 인증이나 봇 방지 속도 제한을 대신하지는 않습니다.
- 파일 경로는 `feedback/YYYY-MM-DD/<서버 타임스탬프>-<UUID>.json`입니다. 사용자 입력을 파일명에 쓰지 않습니다. Blob 업로드는 `access: 'private'`, 덮어쓰기 금지, JSON MIME을 명시합니다.
- 저장 레코드는 정규화한 설문과 서버 `id`, `createdAt`만 포함합니다. 허니팟, IP, User-Agent를 저장하지 않습니다. 응답·로그에 연락처, 응답 내용, Blob URL, 공급자 오류를 출력하지 않습니다.
- **GET 조회·목록·관리자 공개 엔드포인트는 없습니다.** 응답 확인과 삭제는 권한 있는 관리자가 Vercel 대시보드에서 수행합니다. 운영자는 내부 접근 권한·보관 기간·삭제 절차를 기관 기준에 맞춰 정해야 합니다.

## 사용자 경험과 접근성

시맨틱 랜드마크, 한국어 문서 언어, 본문 건너뛰기, 폼 레이블·fieldset·legend, native 라디오/체크박스, 상태 live region, 키보드 포커스, reduced-motion 지원을 제공합니다. 영상은 자동 재생하지 않고 내장 자막이 포함된 원본 MP4와 HTML5 controls를 사용합니다. 모바일에서도 모든 내비게이션을 바로 사용할 수 있습니다. 워크플로 일러스트는 기능 구성 예시로 명시했으며 가짜 후기·기관 로고·성과 수치가 없습니다.

제출 중 버튼과 입력을 잠가 중복 클릭을 방지합니다. 15초 timeout이나 네트워크/저장 실패 시 응답은 폼에 유지되고 재시도 및 복사가 가능합니다. 복사 내용은 연락처·인터뷰 동의·허니팟을 제외하며 Clipboard 미지원 시 선택 가능한 읽기 전용 텍스트를 제공합니다. 자유 의견에 직접 작성한 개인정보는 자동 제거할 수 없다는 안내도 포함합니다. 브라우저 localStorage에 설문을 남기지 않습니다. JavaScript가 없으면 제출은 비활성화되고 안내가 표시됩니다.

네트워크 timeout 뒤에는 이미 저장되었는지 브라우저가 알 수 없으므로 재시도 시 같은 응답이 추가로 저장될 가능성이 있습니다. 현재 중복 방지는 요구된 UI 잠금이며, 서버 간 idempotency나 분산 rate limit은 구현 범위에 포함하지 않았습니다.

## 원본 파일 무결성

- HTML: `cba2455755fe2344b4d020cbe2f0c24b6bce12d3c125bd1265e097a7582ed0df`
- MP4: `ee00b1f860998530f280508f7594d022a5fbdecd9224c81ebb4f2faefcdb751b`

현재 `main` 브랜치가 GitHub와 연결되어 있으며 Vercel Production에 공개 배포되어 있습니다. 출시 검증 중 실제 설문 POST, 비공개 Blob 원문 읽기, 테스트 레코드 삭제와 빈 저장소 재확인까지 수행했습니다. 상세 근거는 `docs/verification.md`에 기록합니다.
