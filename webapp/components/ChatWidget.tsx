"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";

interface Message {
  role: "user" | "model";
  text: string;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    const nextHistory = [...messages, { role: "user" as const, text: message }];
    setMessages(nextHistory);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: messages, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "응답을 받지 못했습니다");
      setMessages([...nextHistory, { role: "model", text: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-2 w-80 h-96 rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-900 flex justify-between items-center">
            손익 챗봇
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
            {configured === false && (
              <p className="text-amber-600 text-xs bg-amber-50 rounded-lg px-2 py-1.5">
                GEMINI_API_KEY가 설정되지 않아 챗봇을 사용할 수 없습니다. 서버 환경변수를
                확인하세요.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "text-left text-slate-700"}>
                <span
                  className={
                    m.role === "user"
                      ? "inline-block rounded-lg bg-slate-900 text-white px-2.5 py-1.5"
                      : "inline-block rounded-lg bg-slate-100 px-2.5 py-1.5"
                  }
                >
                  {m.text}
                </span>
              </div>
            ))}
            {error && <p className="text-red-600 text-xs">{error}</p>}
            <div ref={bottomRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-1.5 p-2.5 border-t border-slate-100"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={configured === false || busy}
              placeholder={configured === false ? "설정 안내 참고" : "질문을 입력하세요"}
              className="flex-1 text-sm rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={configured === false || busy || !input.trim()}
              className="text-sm rounded-lg bg-slate-900 text-white px-3 disabled:opacity-40"
            >
              전송
            </button>
          </form>
        </div>
      )}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-slate-900 text-white pl-4 pr-5 py-2.5 shadow-lg text-sm font-medium"
        >
          <MessageCircle size={16} />
          챗봇 조회
        </button>
      )}
    </div>
  );
}
