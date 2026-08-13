import { NextResponse } from "next/server";
import { askGemini, isGeminiConfigured, type ChatMessage } from "@/lib/gemini";

export async function GET() {
  return NextResponse.json({ configured: isGeminiConfigured() });
}

export async function POST(request: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않아 챗봇을 사용할 수 없습니다" },
      { status: 503 },
    );
  }

  const body = await request.json();
  const { history, message } = body as { history?: ChatMessage[]; message?: string };
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message가 필요합니다" }, { status: 400 });
  }

  try {
    const reply = await askGemini(history ?? [], message);
    return NextResponse.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("네트워크") ? 502 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
