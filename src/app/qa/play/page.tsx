"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { getSocket, type GameSocket } from "@/lib/socket/client";
import { browserToken } from "@/lib/browserToken";
import SortTabs from "@/components/qa/SortTabs";
import { QA_MAX_LEN, sortQuestions, type QaQuestion, type QaSort } from "@/lib/qa/types";

function PlayInner() {
  const params = useSearchParams();
  const code = (params.get("room") ?? "").toUpperCase();

  const socketRef = useRef<GameSocket | null>(null);
  const tokenRef = useRef("");
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");

  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [voted, setVoted] = useState<string[]>([]);
  const [authored, setAuthored] = useState<string[]>([]);
  const [sort, setSort] = useState<QaSort>("popular");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    if (!code) {
      setError("방 코드가 없어요.");
      setPhase("error");
      return;
    }
    const socket = getSocket();
    socketRef.current = socket;
    tokenRef.current = browserToken(`qa:token:${code}`);

    socket.on("qa:list", (d) => setQuestions(d.questions));
    socket.on("qa:mine", (d) => {
      setVoted(d.voted);
      setAuthored(d.authored);
    });
    socket.on("room:closed", () => {
      setError("발표자가 Q&A를 종료했어요.");
      setPhase("error");
    });

    // 연결될 때마다(최초 + 재접속) 입장 — 소켓이 끊겨도 알아서 복귀한다
    const join = () => {
      socket.emit("qa:join", { code, token: tokenRef.current }, (res) => {
        if (res.ok) {
          setTitle(res.title ?? "");
          setPhase("ready");
        } else {
          setError(res.error ?? "입장에 실패했어요.");
          setPhase("error");
        }
      });
    };
    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.off("qa:list");
      socket.off("qa:mine");
      socket.off("room:closed");
      socket.off("connect", join);
    };
  }, [code]);

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    socketRef.current?.emit("qa:ask", { text: t, token: tokenRef.current }, (res) => {
      setSending(false);
      if (res.ok) {
        setText("");
        setFlash("질문이 등록됐어요");
        setTimeout(() => setFlash(""), 2000);
      } else {
        setFlash(res.error ?? "등록에 실패했어요");
        setTimeout(() => setFlash(""), 2000);
      }
    });
  };

  const toggleVote = (id: string) =>
    socketRef.current?.emit("qa:vote", { id, token: tokenRef.current });

  // 해결된 질문은 목록에서 내린다 (발표자가 이미 답한 것)
  const open = useMemo(
    () => sortQuestions(questions.filter((q) => !q.resolved), sort),
    [questions, sort],
  );
  const resolvedCount = questions.length - open.length;

  if (phase === "loading") {
    return (
      <Centered>
        <p className="text-ink-500">불러오는 중…</p>
      </Centered>
    );
  }
  if (phase === "error") {
    return (
      <Centered>
        <h1 className="text-2xl font-extrabold">{error}</h1>
        <Link href="/qa" className="btn-ghost mt-6">
          돌아가기
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col px-5 py-4">
      <header className="shrink-0 text-center">
        <h1 className="truncate text-lg font-bold text-ink-900">{title}</h1>
        <p className="mt-0.5 text-xs text-ink-500">익명으로 등록됩니다 · 이름은 남지 않아요</p>
      </header>

      {/* 질문 입력 */}
      <form onSubmit={ask} className="mt-3 shrink-0">
        <textarea
          className="input min-h-[76px] resize-none text-base"
          placeholder="궁금한 점을 남겨주세요"
          maxLength={QA_MAX_LEN}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-ink-500">
            {text.length}/{QA_MAX_LEN}
          </span>
          {flash && <span className="text-xs text-brand">{flash}</span>}
          <button
            type="submit"
            className="btn-primary ml-auto px-5 py-2 text-sm"
            disabled={!text.trim() || sending}
          >
            {sending ? "등록 중…" : "질문 보내기"}
          </button>
        </div>
      </form>

      {/* 정렬 */}
      <div className="mt-4 flex shrink-0 items-center gap-2">
        <SortTabs sort={sort} onChange={setSort} />
        <span className="ml-auto text-xs text-ink-500">질문 {open.length}개</span>
      </div>

      {/* 목록 */}
      <ul className="no-scrollbar mt-2 flex-1 space-y-2 overflow-y-auto pb-2">
        {open.map((q) => (
          <li key={q.id} className="card flex items-start gap-3 p-3">
            <button
              onClick={() => toggleVote(q.id)}
              aria-label="공감"
              className={`flex w-12 shrink-0 flex-col items-center rounded-xl border px-2 py-1.5 transition ${
                voted.includes(q.id)
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line text-ink-500 hover:border-brand/40"
              }`}
            >
              <span className="text-sm leading-none">▲</span>
              <span className="mt-1 text-sm font-bold leading-none">{q.votes}</span>
            </button>
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900">
              {q.text}
              {authored.includes(q.id) && (
                <span className="ml-1.5 align-middle text-xs text-brand">(내 질문)</span>
              )}
            </p>
          </li>
        ))}
        {open.length === 0 && (
          <li className="py-10 text-center text-sm text-ink-500">
            아직 질문이 없어요.
            <br />첫 질문을 남겨보세요.
          </li>
        )}
      </ul>

      {resolvedCount > 0 && (
        <p className="shrink-0 pb-1 text-center text-xs text-ink-500">
          해결된 질문 {resolvedCount}개는 목록에서 내려갔어요
        </p>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      {children}
    </main>
  );
}

export default function QaPlayPage() {
  return (
    <Suspense
      fallback={
        <Centered>
          <p className="text-ink-500">불러오는 중…</p>
        </Centered>
      }
    >
      <PlayInner />
    </Suspense>
  );
}
