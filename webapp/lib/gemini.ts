import {
  getProjectPnl,
  getMonthlyPnl,
  getAdminCategoryBreakdown,
  getReviewSummary,
} from "@/lib/aggregate";
import { getCalendarSummary, todayInKorea } from "@/lib/calendar";

// "gemini-2.5-flash" 고정 버전은 신규 사용자에게 404로 막힌 것을 확인함(2026-08 기준).
// 특정 버전에 고정하지 않고 항상 현재 권장되는 flash 모델을 가리키는 별칭을 쓴다.
const DEFAULT_MODEL = "gemini-flash-latest";
const MODEL = process.env.GEMINI_MODEL || DEFAULT_MODEL;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

// workflow.md §7-4 DASHBOARD_DATA 규칙 계승: 화면에 표시한 요약 수준 숫자만 담는다.
// 원본 거래 내역 전체는 넣지 않는다 — 이게 챗봇 프롬프트 컨텍스트 전체이기도 하다.
export async function buildDashboardContext() {
  const [projectRows, monthlyRows, adminRows, reviewSummary, calendar] = await Promise.all([
    getProjectPnl(),
    getMonthlyPnl(),
    getAdminCategoryBreakdown(),
    getReviewSummary(),
    getCalendarSummary(),
  ]);

  return {
    단위: "원",
    기준일: todayInKorea(),
    프로젝트별손익: projectRows,
    월별손익: monthlyRows,
    일반관리비분류: adminRows,
    검수현황: reviewSummary,
    회수캘린더요약: calendar.summary,
  };
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function askGemini(history: ChatMessage[], message: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다");
  }

  const context = await buildDashboardContext();
  const systemInstruction = [
    "너는 ERP 손익 대시보드의 질의응답 챗봇이다.",
    "아래 DASHBOARD_DATA에 있는 내용만으로 답한다.",
    "데이터에 없는 내용은 반드시 '데이터에 없습니다'라고 답하고 추측하지 않는다.",
    "숫자는 원 단위이며, 검수현황.needsReview건은 아직 미확정이니 필요하면 언급한다.",
    "DASHBOARD_DATA:",
    JSON.stringify(context),
  ].join("\n");

  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.2 },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Gemini API 키 인증에 실패했습니다(401/403)");
    }
    if (res.status === 429) {
      throw new Error("Gemini API 사용량 한도를 초과했습니다(429)");
    }
    const body = await res.text();
    throw new Error(`Gemini API 오류(${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) {
    throw new Error("Gemini 응답에서 텍스트를 찾을 수 없습니다");
  }
  return text;
}
