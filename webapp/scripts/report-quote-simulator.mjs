// 작업 4-a 보고용 스크립트. 실제 데이터로 계산해 터미널에 출력한다.
// 실행: npx tsx --env-file=.env scripts/report-quote-simulator.mjs
import {
  computeAllocatedOverhead,
  computeBreakEven,
  evaluateQuote,
  scanBidRange,
  analyzeSensitivity,
  getOverheadBaseline,
  countConcurrentProjects,
} from "../lib/quoteSimulator.ts";

function won(n) {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}
function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

const baseline = await getOverheadBaseline();
console.log("=== getOverheadBaseline() — DB에서 읽은 월 고정비 ===");
console.log(baseline.basis);
console.log({
  monthlyLabor: won(baseline.monthlyLabor),
  monthlyInterest: won(baseline.monthlyInterest),
  monthlyDepreciation: won(baseline.monthlyDepreciation),
  monthlyCommonCost: won(baseline.monthlyCommonCost),
});

console.log("\n=== countConcurrentProjects('2026-09', '2027-01') — 동시 진행 현장 자동 계산(기본값 제안) ===");
const concurrent = await countConcurrentProjects("2026-09", "2027-01");
console.log(concurrent.basis);
console.log("겹치는 프로젝트:", concurrent.projects);

console.log("\n=== 예시 입력: 계약금액 7.5억 / 공사기간 5개월 / 동시 3곳 / 직접원가 6.7억 ===");

const contractAmount = 750_000_000;
const durationMonths = 5;
const concurrentProjects = 3; // countConcurrentProjects의 기본값 제안(위 참고) — 예시이므로 그대로 사용
const directCostEstimate = 670_000_000;
const targetProfitRate = 0.1;

const overheadInput = {
  monthlyLabor: baseline.monthlyLabor,
  monthlyInterest: baseline.monthlyInterest,
  monthlyDepreciation: baseline.monthlyDepreciation,
  monthlyCommonCost: baseline.monthlyCommonCost,
  durationMonths,
  concurrentProjects,
};

const overhead = computeAllocatedOverhead(overheadInput);
const breakEven = computeBreakEven({ contractAmount, allocatedOverhead: overhead.allocatedTotal, targetProfitRate });
const quote = evaluateQuote({ contractAmount, directCostEstimate, allocatedOverhead: overhead.allocatedTotal, targetProfitRate });
const scan = scanBidRange({
  min: 500_000_000,
  max: 1_000_000_000,
  step: 5_000_000,
  directCostEstimate,
  allocatedOverhead: overhead.allocatedTotal,
  targetProfitRate,
});

const laborRow = overhead.breakdown.find((b) => b.label === "인건비");
const interestRow = overhead.breakdown.find((b) => b.label === "이자");
const depreciationRow = overhead.breakdown.find((b) => b.label === "감가상각");
const commonRow = overhead.breakdown.find((b) => b.label === "공통고정비(일반관리비)");

console.log(
  `월 고정비        ${won(overhead.monthlyTotal)}  (인건비 ${won(laborRow.monthly)} + 이자 ${won(interestRow.monthly)} + 감가 ${won(depreciationRow.monthly)} + 공통 ${won(commonRow.monthly)})`,
);
console.log(`배부 고정비      ${won(overhead.allocatedTotal)}`);
console.log(
  `손익분기 직접원가 ${won(breakEven.breakEvenDirectCost)}  (원가율 ${pct(breakEven.breakEvenCostRate)})`,
);
console.log(`겉보기 이익      ${won(quote.contributionMargin)}  (${pct(quote.contributionRate)})`);
console.log(`실제 이익        ${won(quote.actualProfit)}  (${pct(quote.actualProfitRate)})`);
console.log(
  `목표 ${pct(targetProfitRate)} 최소 투찰금액  ${scan.minimumBidForTarget !== null ? won(scan.minimumBidForTarget) : "구간 내에 없음"}`,
);

console.log("\n=== analyzeSensitivity() — 자재비 변동 / 공기 지연 시나리오 ===");
const sensitivity = analyzeSensitivity({
  base: { contractAmount, directCostEstimate, allocatedOverhead: overhead.allocatedTotal, targetProfitRate },
  materialCostRatio: 0.5, // 직접원가 중 자재비 비중 50% 가정
  materialPriceChange: 0.1, // 자재비 +10%
  delayMonths: 2,
  overheadInput,
});
for (const s of sensitivity.scenarios) {
  console.log(`${s.label.padEnd(30, " ")} 실제 이익 ${won(s.actualProfit)} (${pct(s.actualProfitRate)})`);
}

process.exit(0);
