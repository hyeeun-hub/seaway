import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// 일반관리비 사전 등록 목록(proj 완전일치). 실데이터 검증을 거친 최종 계정과목명을 쓴다.
// "차내윤"/"송인석"은 사람 이름이지만 반복 확인을 거쳐 이미 성격이 확정된 값이라
// classify-skill의 "자동 처리 3원칙"(값 비교, 재현성, 검증 가능)을 만족해 여기로 옮긴다.
const ADMIN_PROJ_RULES: { pattern: string; category: string }[] = [
  { pattern: "사무실운영", category: "일반관리비" },
  { pattern: "사무실복리후생", category: "복리후생비" },
  { pattern: "공장운영", category: "일반관리비" },
  { pattern: "공장전기", category: "수도광열비" },
  { pattern: "숙소전기", category: "수도광열비" },
  { pattern: "연구전담부서", category: "연구개발비" },
  { pattern: "연구롤링피치저감", category: "연구개발비" },
  { pattern: "연구해상부유구조물", category: "연구개발비" },
  { pattern: "차내윤", category: "복리후생비" }, // (주)대성 LPG 가스비, 원본 용도=복리후생비
  { pattern: "송인석", category: "인별경비(미배부)" }, // 현장소장 출장경비, 현장 미확정으로 별도 관리
];

// 매입-간이영수증은 용도/내용이 거의 항상 공백이라 사용처(place) 문자열로만 판정한다(state-schema.md §3).
// 실데이터 검증을 거쳐 확정된 37개 목록. 여기 없는 사용처는 자동 확정하지 않고 검수로 남긴다.
const PLACE_KEYWORD_RULES: { pattern: string; category: string }[] = [
  // 복리후생비
  { pattern: "컴포즈커피", category: "복리후생비" },
  { pattern: "에스씨케이컴퍼니", category: "복리후생비" },
  { pattern: "제주담다", category: "복리후생비" },
  { pattern: "씨제이푸드빌", category: "복리후생비" },
  { pattern: "으뜸복어", category: "복리후생비" },
  { pattern: "동강", category: "복리후생비" },
  { pattern: "도남정", category: "복리후생비" },
  { pattern: "만배식당", category: "복리후생비" },
  { pattern: "이마트", category: "복리후생비" },
  { pattern: "쿠팡", category: "복리후생비" },
  { pattern: "홈플러스", category: "복리후생비" },
  { pattern: "씨유", category: "복리후생비" },
  // 차량유지비
  { pattern: "삼남석유", category: "차량유지비" },
  { pattern: "도남주유소", category: "차량유지비" },
  { pattern: "애월농협주유소", category: "차량유지비" },
  { pattern: "합동청사주유소", category: "차량유지비" },
  { pattern: "삼일주유소", category: "차량유지비" },
  { pattern: "대명디젤", category: "차량유지비" },
  { pattern: "세방전지", category: "차량유지비" },
  // 운반비
  { pattern: "대신화물", category: "운반비" },
  { pattern: "한국해운조합", category: "운반비" },
  { pattern: "경둉택배", category: "운반비" },
  // 여비교통비
  { pattern: "아시아나항공", category: "여비교통비" },
  { pattern: "제주 이호이 1369", category: "여비교통비" },
  // 지급수수료
  { pattern: "기술보증기금", category: "지급수수료" },
  { pattern: "금융결제원", category: "지급수수료" },
  { pattern: "한국평가정보", category: "지급수수료" },
  { pattern: "네이버파이낸셜", category: "지급수수료" },
  { pattern: "한국중소벤처기업유통원", category: "지급수수료" },
  // 보험료
  { pattern: "한화손해보험", category: "보험료" },
  // 보증수수료 — 계약보증이라 각 건의 프로젝트/현장이 이미 지정돼 있어 검수 불필요(자동 분류)
  { pattern: "서울보증보험", category: "보증수수료" },
  // 세금과공과
  { pattern: "지방세입금", category: "세금과공과" },
  // 소모품비
  { pattern: "아성다이소", category: "소모품비" },
  { pattern: "네오툴", category: "소모품비" },
  // 자재비
  { pattern: "고려상사", category: "자재비" },
  { pattern: "정도공업사", category: "자재비" },
  { pattern: "길명선구", category: "자재비" },
];

// 상호명 기반 규칙이 같은 업종의 다른 가게를 못 잡는 문제를 보완하는 업종 키워드.
// pattern이 짧고 일반적이라(예: "커피") ingest.ts/reclassify.ts에서 pattern 길이
// 내림차순으로 정렬해 조회해야 위의 구체적 상호명 규칙이 먼저 매칭된다.
const INDUSTRY_KEYWORD_RULES: { pattern: string; category: string }[] = [
  { pattern: "주유소", category: "차량유지비" },
  { pattern: "충전소", category: "차량유지비" },
  { pattern: "정유", category: "차량유지비" },
  { pattern: "석유", category: "차량유지비" },
  { pattern: "커피", category: "복리후생비" },
  { pattern: "식당", category: "복리후생비" },
  { pattern: "휴게소", category: "복리후생비" },
  { pattern: "마트", category: "복리후생비" },
  { pattern: "편의점", category: "복리후생비" },
  { pattern: "항공", category: "여비교통비" },
  { pattern: "택배", category: "운반비" },
  { pattern: "화물", category: "운반비" },
  { pattern: "보험", category: "보험료" },
  { pattern: "가스", category: "수도광열비" },
];

// 메모 중 손익 왜곡 위험(중복 계상, 타사 대납 등)이 있는 표현. 표본 12건에서 뽑은 초기값이고,
// /memo 화면에서 사람이 [문제 있음]을 누를 때 새 표현을 추가로 등록할 수 있다.
// category는 이 matchOn에서 쓰이지 않지만 스키마상 필수라 안내용 값만 넣는다.
const MEMO_RISK_KEYWORD_RULES: { pattern: string }[] = [
  { pattern: "중복" },
  { pattern: "이중" },
  { pattern: "대납" },
  { pattern: "취소" },
  { pattern: "환불" },
  { pattern: "반품" },
  { pattern: "오류" },
];

async function main() {
  // 차내윤/송인석을 flag_review(항상 검수)에서 proj(자동 확정)로 옮기므로,
  // 기존 flag_review 등록이 남아있으면 classify.ts에서 flag_review 체크가 먼저 걸려
  // proj 규칙까지 도달하지 못한다. 완전히 비운다(현재 다른 flag_review 대상 없음).
  await prisma.adminCategoryRule.deleteMany({ where: { matchOn: "flag_review" } });

  for (const rule of ADMIN_PROJ_RULES) {
    await prisma.adminCategoryRule.upsert({
      where: { matchOn_pattern: { matchOn: "proj", pattern: rule.pattern } },
      update: { category: rule.category },
      create: { matchOn: "proj", pattern: rule.pattern, category: rule.category },
    });
  }

  for (const rule of [...PLACE_KEYWORD_RULES, ...INDUSTRY_KEYWORD_RULES]) {
    await prisma.adminCategoryRule.upsert({
      where: { matchOn_pattern: { matchOn: "place_keyword", pattern: rule.pattern } },
      update: { category: rule.category },
      create: { matchOn: "place_keyword", pattern: rule.pattern, category: rule.category },
    });
  }

  for (const rule of MEMO_RISK_KEYWORD_RULES) {
    await prisma.adminCategoryRule.upsert({
      where: { matchOn_pattern: { matchOn: "memo_keyword", pattern: rule.pattern } },
      update: {},
      create: { matchOn: "memo_keyword", pattern: rule.pattern, category: "위험 키워드" },
    });
  }

  console.log(
    `시드 완료: proj ${ADMIN_PROJ_RULES.length}개, place_keyword ${PLACE_KEYWORD_RULES.length + INDUSTRY_KEYWORD_RULES.length}개(상호명 ${PLACE_KEYWORD_RULES.length} + 업종 ${INDUSTRY_KEYWORD_RULES.length}), memo_keyword ${MEMO_RISK_KEYWORD_RULES.length}개`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
