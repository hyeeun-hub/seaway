@AGENTS.md

# 이 프로젝트 고유 규칙

## `problemType` 문자열 계약 — 오타 하나가 손익을 조용히 바꾼다

`ReviewDecision.problemType`은 사실상 enum이지만 타입은 그냥 `string`이다
(`prisma/schema.prisma` 참고). 8개 값은 **`lib/problemTypes.ts`의 `PROBLEM_TYPE` 상수
객체가 유일한 기준이다**(`as const` + union 타입, Prisma enum이 아니다 — DB에 이미 이
한글 문자열로 저장된 레코드가 있어서 값 자체를 바꾸는 건 별도 마이그레이션 없이는 위험하다).
값을 새로 추가하거나 문자열을 바꾸려면 **이 파일 하나만** 고치면 되고, 아래 생산자·소비자는
전부 리터럴이 아니라 `PROBLEM_TYPE.*` 심볼을 참조한다 — 키 이름을 잘못 쓰면 그 자리에서
바로 `tsc` 에러가 난다(직접 문자열을 하드코딩하던 이전 상태와 다르다).

생산자(이 값을 대입하는 곳, 3곳):
- `lib/classify.ts`(53·65·79·92·108·120·143·156·167·175·184·193·201행) — 8개 값 전부 생성
- `app/api/review/route.ts:73` — 사람이 blank-proj 거래를 확정할 때 `GENERAL_ADMIN`을
  직접 대입한다(`classifyTransaction`을 다시 부르지 않음)
- `app/api/memo/route.ts:50` — 사람이 메모를 "문제 있음"으로 표시하면 `MEMO_NEEDS_REVIEW`를
  직접 대입한다(같은 이유로 재분류를 거치지 않음)

소비자(이 값을 비교해 손익 포함/제외, 캘린더 노출, 검사 통과/실패를 결정하는 곳):
- `lib/aggregate.ts:22` — `MEMO_NEEDS_REVIEW`면 `getIncludedTransactions()`에서 통째로 제외
- `lib/aggregate.ts:33-34` (`isGeneralAdmin`) — `GENERAL_ADMIN`이면 프로젝트별 손익에서 빼고
  일반관리비 집계로 보낸다. 여기서 오타가 나면 그 거래는 **양쪽 어디에도 안 잡히고 조용히
  사라진다**
- `lib/aggregate.ts:200` — `getUnclassifiedResidual()`에서 `MEMO_NEEDS_REVIEW` 제외
- `lib/calendar.ts:54,145` — `GENERAL_ADMIN`/`MEMO_NEEDS_REVIEW` 비교로 통과거래·캘린더 노출 판정
- `lib/verify.ts:87,153,288` — 검사 조건 자체가 이 값과 정확히 일치해야 동작한다
- `components/MemoRow.tsx:35`, `components/ReviewRow.tsx:212` — 클라이언트 컴포넌트지만
  `lib/problemTypes.ts`는 순수 상수 파일(서버 의존성 없음)이라 그대로 import해서 쓴다

**실제로 있었던 사고, 지금은 고쳤고 테스트로 막아뒀다**: `lib/verify.ts:100`이 한때
`classify.ts`가 절대 만들지 않는 `"분류 애매(사용처 미매칭)"`라는 값을 검사하고 있었다
(과거 버전의 흔적). 항상 0건이라 절대 실패할 수 없는 죽은 검사였다 — 지금은 원래 의도를
역추적해 실제 조건으로 다시 짰다. `lib/problemTypeContract.test.ts`가 "classify.ts가
만드는 값의 집합 = `PROBLEM_TYPE`에 선언된 8개 값"을 런타임으로 검증하므로, 이 종류의
드리프트(존재하지 않는 값을 검사/비교하는 코드)가 다시 생기면 `npm test`가 잡는다.

**새 `problemType` 값을 추가하거나 기존 값의 문자열을 바꿀 때**:
1. `lib/problemTypes.ts`의 `PROBLEM_TYPE`부터 고친다(단일 기준).
2. `tsc`가 안내하는 대로 생산자·소비자를 따라간다 — 위 목록 + `lib/reclassify.ts`(재분류
   시 이 값들을 다시 계산).
3. `npm test`로 `lib/problemTypeContract.test.ts`/`lib/classify.test.ts`를 반드시 재실행한다.
   값을 바꾸고 이 셋 중 하나를 빠뜨리면, 빌드는 통과해도 손익 숫자가 조용히 달라질 수 있다.

## `Transaction`은 append-only

원본 거래는 절대 수정·삭제하지 않는다(`state-schema.md` §8 원칙 그대로 구현). 파생 계산
(인건비·이자·감가상각)은 `DerivedCost`에 `runId` 단위로 매번 **전량 재생성**한다 —
`lib/derivedCost.ts:240-254`의 `recomputeDerivedCosts()`가 `deleteMany({})` 후 다시
insert한다. 같은 입력이면 항상 같은 결과가 나와야 한다(난수·현재 시각에 의존하지 않음).
`DerivedCost`에 update를 추가하지 말 것 — 재계산은 항상 전량 삭제 후 재생성이다.

## 금액 공백은 `null`로 보존한다

`lib/pipeline/normalize.ts:59-61`의 `normalizeAmount()`는 변환 실패·공백이면 `null`을
반환하고 **0으로 채우지 않는다**(주석에 명시). `classifyTransaction()`이 `amount === null`인
거래를 `"금액 누락"`으로 분리해 검수로 보낸다. 새 파서나 마이그레이션 스크립트에서 금액을
다룰 때 `?? 0` 같은 기본값을 넣지 말 것 — 손익이 과소/과다 계상된다.

## 자동 확정은 값 비교로만

`lib/classify.ts:3-6`의 "자동 처리 허용 조건" 3원칙: (1) 값 비교만으로 판정, (2) 재실행해도
같은 결과, (3) 오판정이면 verify가 잡을 수 있음. 문맥 추론(예: "이 이름은 사람 이름처럼
보인다")은 규칙화하지 않고 `needs_review`로 남긴다. `suggestion` 필드(LLM 제안 텍스트)는
참고용이며 그 자체로 확정 근거가 아니다 — 자동 확정 여부는 항상 규칙(값 비교) 결과다.

## `getIncludedTransactions()` — 무심코 또 부르지 말 것

`lib/aggregate.ts:14`의 `getIncludedTransactions()`는 `where` 없이 `Transaction`
테이블 전체를 메모리로 로드한다. `export`돼 있어 `lib/aggregate.ts` 밖에서도 부를 수
있다 — 현재 `getProjectPnl`/`getProjectTransactions`/`getMonthlyPnl`/
`getAdminCategoryBreakdown`/`getAdminCategoryTransactions`/`getPurchaseKindBreakdown`
6곳(전부 `aggregate.ts` 내부) + `lib/verify.ts`(월별 집계 정합 검사, `aggregate.ts` 밖에서
부르는 유일한 곳) 총 7곳이 이미 각자 호출한다(대시보드 1회 렌더에 여러 번 로드). 새 집계
함수나 검사를 추가할 때 이 함수를 또 부르면 같은 전체 스캔이 한 번 더 늘어난다 — 데이터가
지금은 작아 문제가 안 되지만, 여러 함수가 공유할 수 있는 형태(예: 상위에서 한 번 로드해
넘기기)를 먼저 검토할 것. 이 리팩터링 자체는 이번 범위가 아니다.

## 테스트

`npm test`(`node:test` + `tsx --test`, 별도 러너 없음). DB 연결이 필요 없는 순수 함수만
테스트한다 — `lib/classify.test.ts`(분기별 골든 케이스), `lib/problemTypeContract.test.ts`
(계약 테스트), `lib/pipeline/txKey.test.ts`(`computeTxKey`/`assignSeq`). `classify.ts`나
`problemTypes.ts`를 고치면 반드시 `npm test`를 돌린다.

## 스키마 변경 시

1. `prisma/schema.prisma` 수정
2. `npx prisma migrate dev --name <설명>` (마이그레이션 파일 생성 + 로컬 DB 적용)
3. `generated/prisma`는 커밋하지 않는다(`.gitignore`에 `/generated/prisma` — `postinstall`의
   `prisma generate`가 매번 다시 만든다)
4. 배포 반영은 `npm run db:migrate`(`prisma migrate deploy`)
