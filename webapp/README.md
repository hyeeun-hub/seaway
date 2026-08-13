# ERP Flow 웹앱

저장소 루트의 `SPEC.md`/`state-schema.md`/`role-table.md`/`workflow.md`/`agents.md`/`skills/*/SKILL.md`가
정의한 ERP 손익 분석 파이프라인을, Claude Code 에이전트가 아니라 **실제로 실행되는 Next.js 웹앱**으로
구현한 것이다. 업로드 → 파싱/정규화 → 중복 제거 → 프로젝트/월별 손익 계산 → 일반관리비 분류 →
검수 → 회수 캘린더 → 검증까지 브라우저에서 바로 돌아간다.

## 원본 명세와의 관계

- 열 매핑 / 정규화 규칙 / 중복 판정(`tx_key`+`seq`) / 회수예정일 파싱은 저장소 루트의
  **`state-schema.md`가 여전히 단일 기준**이다. 이 웹앱의 `lib/pipeline/*`가 그 규칙을 코드로 옮긴 것이다.
- 원본 설계는 매 실행마다 정적 HTML(`out/erp-flow-result-*.html`)을 새로 만들고 챗봇 스크립트를
  `localhost:8000`에서 서빙하는 방식이었다. 이 웹앱은 그 대신 **DB에 누적된 데이터를 매번 다시 계산해
  보여주는 실시간 대시보드**로 만든다. 정적 파일을 만들지 않는다.
- 원본 설계는 Gemini API 키를 클라이언트에서 로드하는 `pnl-chat-config.js`를 썼다. 이 웹앱은 키를
  **서버(`app/api/chat`)에만** 두고 클라이언트에 절대 내려주지 않는다.
- 챗봇 컨텍스트 원칙(원 설계 문서의 웹 결과물 HTML 생성 규칙 절에서 계승 — 그 절은 정적 HTML
  산출물과 함께 폐기됐고 지금은 이 문서가 단일 기준이다): 원본 거래 내역 전체는 프롬프트에 넣지
  않고 화면에 표시한 요약 수준 숫자만 넣는다. 데이터에 없는 내용은 "데이터에 없습니다"라고 답하고
  추측하지 않는다. 두 원칙 모두 `lib/gemini.ts`의 `buildDashboardContext()`와
  `askGemini()`의 고정 시스템 지시에 그대로 구현돼 있다.

## 스킬/에이전트 → 코드 매핑

| 원본 명세 | 이 웹앱의 구현 |
|---|---|
| `file-input-skill` / `file-input-agent` | `lib/pipeline/fileHash.ts`, `lib/pipeline/detectKind.ts`, `ProcessedFile` 테이블 |
| `analyze-skill` / `analyze-agent` | `lib/pipeline/{parseSheet,normalize,parseSettle,txKey}.ts`, `lib/pipeline/ingest.ts`, `Transaction` 테이블 |
| `classify-skill` / `classify-agent` | `lib/classify.ts`(규칙) + `AdminCategoryRule` 테이블(사전 등록 목록) + `ReviewDecision` 테이블 |
| `query-export-skill` / `query-export-agent` | `lib/aggregate.ts`(프로젝트별/월별 손익, 일반관리비 분류) |
| `calendar-chatbot-skill` / `calendar-chatbot-agent` | `lib/calendar.ts`(캘린더), `lib/gemini.ts` + `app/api/chat`(챗봇) |
| `verify-skill` / `verify-agent` | `lib/verify.ts` |
| final-assembly(오케스트레이터) | 8개 결과 항목을 한 화면에 모으지 않고 화면별로 분리했다 — `app/page.tsx`(KPI·추이·업로드), `app/projects`, `app/monthly`, `app/admin-costs`, `app/review`, `app/calendar`, `app/settings`(검사 결과 탭), `app/reports` |

규칙으로 딱 맞는 것만 자동 처리하고(`classifyTransaction`), 애매한 건은 `ReviewDecision.status = needs_review`로
남겨 `/review` 화면에서 사람이 확정/제외/수정/보류한다. 간이영수증처럼 규칙 사전에 없는 사용처는
자동 확정하지 않고 검수로 남기는 것이 기본값이다 — `/settings`에서 규칙을 추가해가며 자동 처리 범위를 넓힌다.

## 화면 구성

사이드바 기준 10개 화면. 모두 서버 컴포넌트에서 `lib/aggregate.ts`/`lib/calendar.ts`/`lib/verify.ts`를
직접 호출해 매 요청마다 다시 계산한다(별도 요약 API 없음).

| 경로 | 화면 |
|---|---|
| `/` | 대시보드 — KPI 카드, 최근 6개월 추이, 업로드, 상위/적자 프로젝트, 이번 달 회수 예정 |
| `/projects` | 프로젝트별 손익 전체 표 |
| `/monthly` | 월별 추이 전체 차트 + 표 |
| `/quote` | 수주 판단 — 투찰가 시뮬레이터. `DerivedCost`(파생원가) 기준 월 고정비가 필요하며, 아직 계산 전이면 `/settings`의 재계산 버튼으로 안내한다 |
| `/admin-costs` | 일반관리비 분류 결과 |
| `/calendar` | 회수 캘린더 |
| `/review` | 검수 대상(문제 유형별 필터 + 페이지네이션) |
| `/memo` | 메모 확인 — 위험 키워드가 걸린 메모 확인/해제 |
| `/reports` | 월간 리포트(기준월 선택, 전월 대비, 요약 문구) |
| `/settings` | `AdminCategoryRule` 추가/삭제, 파생원가(인건비·이자·감가상각) 재계산 실행(`/api/derived-cost/recompute`), 검사 결과 |

## 디자인/UI 의존성

Tailwind 위에 다음 3개만 추가했다. Streamlit/NiceGUI 같은 별도 UI 프레임워크는 쓰지 않는다.

- `recharts` — 월별 추이 바 차트
- `lucide-react` — 사이드바/버튼 아이콘
- `pretendard` — 한글 웹폰트(`app/globals.css`에서 `pretendardvariable.css` 임포트)

## 로컬 개발

```bash
npm install
npx create-db@latest --env .env   # DATABASE_URL을 .env에 채워줌(임시 DB, claimUrl로 영구화 가능)
npx prisma migrate dev
npx prisma db seed                 # AdminCategoryRule 시드
npm run dev
```

`.env`에 `GEMINI_API_KEY`를 넣으면 챗봇이 활성화된다. 비워두면 대시보드는 정상 동작하고 챗봇 입력창만
비활성화된다.

## 배포(Vercel)

1. DB를 영구화: 로컬 개발에서 받은 `claimUrl`로 claim하거나, Neon 등에서 별도 Postgres를 만든다.
2. Vercel 프로젝트에 환경변수 `DATABASE_URL`, `GEMINI_API_KEY`(선택)를 설정한다.
3. `postinstall`에 `prisma generate`가 걸려 있어 빌드 시 클라이언트가 자동 생성된다.
4. 첫 배포 전에 마이그레이션을 한 번 적용한다: `DATABASE_URL=... npm run db:migrate` (로컬에서 프로덕션
   DB를 가리키게 실행하거나, Vercel 빌드 파이프라인에 같은 명령을 추가한다).
5. 시드가 필요하면 `DATABASE_URL=... npm run db:seed`.

## 알려진 제약

- 간이영수증 사용처 키워드 사전(`prisma/seed.ts`의 `PLACE_KEYWORD_RULES`)은 시작용 예시만 담겨 있다.
  실사용에서는 `/settings`에서 반복적으로 나오는 사용처를 규칙에 추가해가는 방식으로 자동 처리 범위를 넓힌다.
- 대시보드(`/`)와 월간 리포트(`/reports`)의 "기준 월" 선택은 누적 매출/매입 총계와 6개월 추이 창의
  기준점만 바꾼다. 프로젝트별/일반관리비 화면은 항상 전체 기간 누적 기준이다.
