"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import QRPanel from "@/components/quiz/QRPanel";
import { getSocket, type GameSocket } from "@/lib/socket/client";
import SortTabs from "@/components/qa/SortTabs";
import { sortQuestions, type QaQuestion, type QaSort } from "@/lib/qa/types";

const ROOM_KEY = "qa:hostRoom";

export default function QaHostPage() {
  const socketRef = useRef<GameSocket | null>(null);
  const [stage, setStage] = useState<"build" | "live">("build");
  const [title, setTitle] = useState("");
  const [room, setRoom] = useState<{ code: string; joinUrl: string } | null>(null);

  const [questions, setQuestions] = useState<QaQuestion[]>([]);
  const [sort, setSort] = useState<QaSort>("popular");
  const [showResolved, setShowResolved] = useState(false);
  const [presenter, setPresenter] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    socket.on("qa:list", (d) => setQuestions(d.questions));

    // 새로고침·절전으로 끊겨도 방을 이어받는다 (발표 중 질문이 날아가지 않도록)
    const resume = () => {
      let saved: { code: string; joinUrl: string } | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(ROOM_KEY) ?? "null");
      } catch {
        /* ignore */
      }
      if (!saved?.code) return;
      socket.emit("qa:resume", { code: saved.code }, (res) => {
        if (res.ok) {
          setRoom(saved);
          setTitle(res.title ?? "");
          setStage("live");
        } else {
          localStorage.removeItem(ROOM_KEY);
        }
      });
    };
    if (socket.connected) resume();
    socket.on("connect", resume);

    return () => {
      socket.off("qa:list");
      socket.off("connect", resume);
    };
  }, []);

  const open = () => {
    getSocket().emit("qa:create", { title: title.trim() }, (res) => {
      if (!res.code) return;
      const r = { code: res.code, joinUrl: res.joinUrl };
      setRoom(r);
      try {
        localStorage.setItem(ROOM_KEY, JSON.stringify(r));
      } catch {
        /* ignore */
      }
      setStage("live");
    });
  };

  const resolve = (id: string, resolved: boolean) =>
    socketRef.current?.emit("qa:resolve", { id, resolved });
  const remove = (id: string) => {
    if (confirm("이 질문을 삭제할까요?")) socketRef.current?.emit("qa:delete", { id });
  };

  const openList = useMemo(
    () => sortQuestions(questions.filter((q) => !q.resolved), sort),
    [questions, sort],
  );
  const resolvedList = useMemo(
    () => sortQuestions(questions.filter((q) => q.resolved), "recent"),
    [questions],
  );

  // ─────────────── 개설 화면 ───────────────
  if (stage === "build" || !room) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
        <Link href="/qa" className="mb-8 text-sm text-ink-500 hover:text-ink-900">
          ← 뒤로
        </Link>
        <h1 className="mb-1 text-3xl font-extrabold">Q&A 열기</h1>
        <p className="mb-8 text-ink-700">참가자는 QR을 찍고 익명으로 질문합니다.</p>
        <div className="card p-6">
          <label className="label" htmlFor="qa-title">
            세션 제목
          </label>
          <input
            id="qa-title"
            className="input mb-4 text-lg"
            placeholder="예: 2분기 전사 공유회 Q&A"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button onClick={open} className="btn-primary btn-lg w-full">
            Q&A 개설하기 · QR 만들기
          </button>
        </div>
      </main>
    );
  }

  // ─────────────── 발표자 보기 (프로젝터용 큰 글씨) ───────────────
  if (presenter) {
    return (
      <main className="flex h-dvh flex-col px-6 py-6">
        <div className="flex shrink-0 items-center gap-3">
          <h1 className="truncate text-xl font-bold text-ink-900">{title}</h1>
          <span className="chip">코드 {room.code}</span>
          <SortTabs sort={sort} onChange={setSort} />
          <button onClick={() => setPresenter(false)} className="btn-ghost ml-auto px-4 py-2 text-sm">
            발표자 보기 끄기
          </button>
        </div>

        <ul className="no-scrollbar mt-5 flex-1 space-y-4 overflow-y-auto">
          {openList.map((q) => (
            <li key={q.id} className="card flex items-start gap-5 p-6">
              <div className="flex w-20 shrink-0 flex-col items-center rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-brand">
                <span className="text-lg leading-none">▲</span>
                <span className="mt-1 text-3xl font-extrabold leading-none">{q.votes}</span>
              </div>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-3xl font-semibold leading-snug text-ink-900">
                {q.text}
              </p>
              <button
                onClick={() => resolve(q.id, true)}
                className="btn-ghost shrink-0 px-4 py-2 text-sm"
              >
                해결 ✓
              </button>
            </li>
          ))}
          {openList.length === 0 && (
            <li className="py-20 text-center text-2xl text-ink-500">
              아직 질문이 없어요
            </li>
          )}
        </ul>
      </main>
    );
  }

  // ─────────────── 관리 화면 ───────────────
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-5 py-8">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
        ← 게임 선택
      </Link>
      <h1 className="mb-6 mt-3 text-3xl font-extrabold">{title}</h1>

      <div className="grid gap-8 md:grid-cols-[auto_1fr]">
        <div>
          <QRPanel code={room.code} joinUrl={room.joinUrl} />
          <button
            onClick={() => setPresenter(true)}
            className="btn-primary mt-4 w-full py-2.5 text-sm"
          >
            발표자 보기
          </button>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SortTabs sort={sort} onChange={setSort} />
            <span className="chip">질문 {openList.length}개</span>
            {resolvedList.length > 0 && (
              <button
                onClick={() => setShowResolved((v) => !v)}
                className="text-sm text-ink-500 hover:text-ink-900"
              >
                해결됨 {resolvedList.length}개 {showResolved ? "숨기기" : "보기"}
              </button>
            )}
          </div>

          <ul className="space-y-2">
            {openList.map((q) => (
              <li key={q.id} className="card flex items-start gap-3 p-4">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-line px-2 py-1.5 text-ink-700">
                  <span className="text-sm leading-none">▲</span>
                  <span className="mt-1 text-sm font-bold leading-none">{q.votes}</span>
                </div>
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900">
                  {q.text}
                </p>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => resolve(q.id, true)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    해결 ✓
                  </button>
                  <button
                    onClick={() => remove(q.id)}
                    className="px-2 py-1.5 text-xs text-ink-500 hover:text-tile-red"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
            {openList.length === 0 && (
              <li className="card py-12 text-center text-sm text-ink-500">
                아직 질문이 없어요. QR을 공유해주세요.
              </li>
            )}
          </ul>

          {showResolved && resolvedList.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-bold text-ink-700">해결된 질문</h2>
              <ul className="space-y-2">
                {resolvedList.map((q) => (
                  <li
                    key={q.id}
                    className="card flex items-start gap-3 p-4 opacity-50"
                  >
                    <span className="shrink-0 text-xs text-ink-500">▲ {q.votes}</span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm line-through">
                      {q.text}
                    </p>
                    <button
                      onClick={() => resolve(q.id, false)}
                      className="shrink-0 text-xs text-ink-500 hover:text-ink-900"
                    >
                      되돌리기
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
