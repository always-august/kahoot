"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getSocket, type GameSocket } from "@/lib/socket/client";
import { useCountdown } from "@/lib/useCountdown";
import Leaderboard from "@/components/quiz/Leaderboard";
import type { Answer, PersonalResult, PublicQuestion } from "@/lib/game/types";

type Phase =
  | "join"
  | "lobby"
  | "question"
  | "answered"
  | "result"
  | "over"
  | "closed";

const TILE = ["tile-a", "tile-b", "tile-c", "tile-d"];
const SHAPE = ["▲", "◆", "●", "■"];

function PlayInner() {
  const params = useSearchParams();
  const code = (params.get("room") ?? "").toUpperCase();

  const socketRef = useRef<GameSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("join");
  const [nickname, setNickname] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [quizTitle, setQuizTitle] = useState("");

  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [result, setResult] = useState<PersonalResult | null>(null);
  const [finalRank, setFinalRank] = useState<{
    rank: number;
    totalPlayers: number;
    score: number;
  } | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    socket.on("player:question", (q) => {
      setQuestion(q);
      setResult(null);
      setPhase("question");
    });
    socket.on("player:result", (r) => {
      setResult(r);
      setPhase("result");
    });
    socket.on("player:over", (o) => {
      setFinalRank(o);
      setPhase("over");
    });
    socket.on("room:closed", () => setPhase("closed"));
    return () => {
      socket.off("player:question");
      socket.off("player:result");
      socket.off("player:over");
      socket.off("room:closed");
    };
  }, []);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return;
    setJoining(true);
    setJoinError("");
    getSocket().emit("player:join", { code, nickname: name }, (res) => {
      setJoining(false);
      if (res.ok) {
        setQuizTitle(res.quizTitle ?? "");
        setPhase("lobby");
      } else {
        setJoinError(res.error ?? "입장에 실패했어요.");
      }
    });
  };

  const submit = (answer: Answer) => {
    getSocket().emit("player:answer", { answer }, (res) => {
      if (res.received) setPhase("answered");
    });
  };

  // ── 입장 ──
  if (phase === "join") {
    return (
      <Centered>
        <Link href="/quiz" className="mb-6 text-sm text-ink-500 hover:text-ink-700">
          ← 뒤로
        </Link>
        <h1 className="mb-1 text-3xl font-extrabold">닉네임 설정</h1>
        <p className="mb-6 text-ink-500">
          방 <span className="font-bold text-brand">{code || "?"}</span> 에 입장합니다.
        </p>
        <form onSubmit={join} className="card w-full p-6">
          <input
            className="input mb-2 text-center text-xl"
            placeholder="닉네임 (1~16자)"
            maxLength={16}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
          />
          {joinError && (
            <p className="mb-2 text-center text-sm text-tile-red">{joinError}</p>
          )}
          <button
            type="submit"
            className="btn-primary mt-2 w-full"
            disabled={!nickname.trim() || !code || joining}
          >
            {joining ? "입장 중…" : "입장하기"}
          </button>
        </form>
      </Centered>
    );
  }

  // ── 대기 ──
  if (phase === "lobby" || phase === "answered") {
    return (
      <Centered>
        <h1 className="text-2xl font-extrabold">
          {phase === "answered" ? "답변 완료" : "입장 완료"}
        </h1>
        <p className="mt-2 text-ink-500">
          {phase === "answered"
            ? "다른 참가자를 기다리는 중…"
            : "방장이 시작하기를 기다리는 중…"}
        </p>
        {quizTitle && <p className="mt-4 chip">{quizTitle}</p>}
        <p className="mt-6 text-sm text-ink-500">닉네임: {nickname}</p>
      </Centered>
    );
  }

  // ── 문제 풀이 ──
  if (phase === "question" && question) {
    return <AnswerPanel question={question} onSubmit={submit} />;
  }

  // ── 결과 ──
  if (phase === "result" && result) {
    return (
      <Centered>
        <h1
          className={`text-[clamp(1.35rem,5vh,1.875rem)] font-extrabold ${
            result.correct ? "text-tile-green" : "text-tile-red"
          }`}
        >
          {result.correct ? "정답" : "오답"}
        </h1>
        {result.gained > 0 && (
          <p className="mt-[clamp(0.25rem,1vh,0.5rem)] text-[clamp(1rem,3vh,1.25rem)] font-bold text-tile-green">
            +{result.gained}점
          </p>
        )}
        <p className="mt-[clamp(0.5rem,2vh,1rem)] text-sm text-ink-500">정답</p>
        <p className="text-[clamp(1.4rem,5.5vh,1.875rem)] font-extrabold leading-tight text-tile-green">
          {result.correctText}
        </p>
        {result.explanation && (
          <p className="mt-[clamp(0.5rem,2vh,1rem)] text-sm text-ink-700">
            <span className="mr-2 font-semibold text-ink-900">해설</span>
            {result.explanation}
          </p>
        )}
        <div className="mt-[clamp(0.5rem,2.5vh,1.5rem)] flex gap-6">
          <Stat label="현재 점수" value={result.totalScore} />
          <Stat label="순위" value={`${result.rank} / ${result.totalPlayers}`} />
        </div>
        <div className="mt-[clamp(0.5rem,2.5vh,1.5rem)] w-full min-h-0 flex-1 overflow-hidden text-left">
          <Leaderboard
            entries={result.leaderboard}
            limit={5}
            showGained={false}
            meId={socketRef.current?.id}
          />
        </div>
        <p className="mt-[clamp(0.5rem,2.5vh,1.5rem)] text-sm text-ink-500">다음 문제를 기다리는 중…</p>
      </Centered>
    );
  }

  // ── 최종 ──
  if (phase === "over" && finalRank) {
    return (
      <Centered>
        <h1 className="text-3xl font-extrabold">게임 종료</h1>
        <p className="mt-4 text-5xl font-extrabold text-brand">
          {finalRank.rank}
          <span className="text-2xl text-ink-500"> / {finalRank.totalPlayers}위</span>
        </p>
        <p className="mt-3 text-ink-700">최종 점수 {finalRank.score}점</p>
        <Link href="/" className="btn-ghost mt-8">
          홈으로
        </Link>
      </Centered>
    );
  }

  if (phase === "closed") {
    return (
      <Centered>
        <h1 className="text-2xl font-extrabold">게임이 종료되었어요</h1>
        <p className="mt-2 text-ink-500">방장이 방을 닫았습니다.</p>
        <Link href="/" className="btn-ghost mt-6">
          홈으로
        </Link>
      </Centered>
    );
  }

  return (
    <Centered>
      <p className="text-ink-500">연결 중…</p>
    </Centered>
  );
}

function AnswerPanel({
  question,
  onSubmit,
}: {
  question: PublicQuestion;
  onSubmit: (a: Answer) => void;
}) {
  const remaining = useCountdown(question.deadline);
  const seconds = Math.ceil(remaining / 1000);
  const timeUp = remaining <= 0;
  const [shortText, setShortText] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [sliderVal, setSliderVal] = useState(
    question.type === "slider"
      ? Math.round(((question.min ?? 0) + (question.max ?? 100)) / 2)
      : 0,
  );
  const toggle = (i: number) =>
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-[clamp(0.75rem,3vh,2rem)]">
      <div className="mb-[clamp(0.5rem,2vh,1.5rem)] flex items-center justify-between pr-12">
        <span className="chip">
          {question.index + 1} / {question.total}
        </span>
        <span
          className={`text-2xl font-bold tabular-nums ${
            seconds <= 5 ? "text-tile-red" : "text-ink-900"
          }`}
        >
          {seconds}
        </span>
      </div>

      {/* my-auto: 화면이 남으면 세로 중앙, 내용이 길면 그냥 흐름대로(잘림 없음) */}
      <div className="my-auto w-full">
      <h1 className="mb-[clamp(0.5rem,2vh,1rem)] text-center text-[clamp(1.05rem,4.2vh,1.5rem)] font-extrabold leading-snug">{question.text}</h1>
      {question.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={question.image}
          alt=""
          className="mx-auto mb-[clamp(0.5rem,2vh,1.25rem)] max-h-[18vh] rounded-xl border border-line object-contain"
        />
      )}

      {timeUp ? (
        <p className="mt-10 text-center text-ink-500">시간 종료 — 결과를 기다려주세요.</p>
      ) : question.type === "choice" && question.multiSelect ? (
        <div className="flex flex-col gap-3">
          <p className="text-center text-sm text-ink-500">정답을 모두 고르세요</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(question.options ?? []).map((opt, i) => {
              const on = selected.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`${TILE[i]} flex h-[clamp(2.75rem,9vh,4.5rem)] items-center gap-3 rounded-2xl px-5 text-left text-base font-bold leading-tight active:scale-95 ${
                    on ? "ring-4 ring-white" : "opacity-80"
                  }`}
                >
                  <span className="text-2xl opacity-80">{on ? "✓" : SHAPE[i]}</span>
                  {opt}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => onSubmit({ type: "choice", indexes: selected })}
            className="btn-primary btn-lg mt-1"
            disabled={selected.length === 0}
          >
            제출 ({selected.length})
          </button>
        </div>
      ) : question.type === "choice" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(question.options ?? []).map((opt, i) => (
            <button
              key={i}
              onClick={() => onSubmit({ type: "choice", indexes: [i] })}
              className={`${TILE[i]} flex h-[clamp(2.75rem,9vh,4.5rem)] items-center gap-3 rounded-2xl px-5 text-left text-base font-bold leading-tight active:scale-95`}
            >
              <span className="text-2xl opacity-80">{SHAPE[i]}</span>
              {opt}
            </button>
          ))}
        </div>
      ) : question.type === "ox" ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onSubmit({ type: "ox", value: true })}
            className="tile-b flex h-[clamp(5rem,22vh,10rem)] items-center justify-center rounded-2xl text-[clamp(2rem,8vh,3.75rem)] font-extrabold active:scale-95"
          >
            O
          </button>
          <button
            onClick={() => onSubmit({ type: "ox", value: false })}
            className="tile-a flex h-[clamp(5rem,22vh,10rem)] items-center justify-center rounded-2xl text-[clamp(2rem,8vh,3.75rem)] font-extrabold active:scale-95"
          >
            X
          </button>
        </div>
      ) : question.type === "short" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (shortText.trim()) onSubmit({ type: "short", text: shortText });
          }}
          className="flex flex-col gap-3"
        >
          <input
            className="input text-center text-xl"
            placeholder="정답 입력"
            value={shortText}
            onChange={(e) => setShortText(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary btn-lg" disabled={!shortText.trim()}>
            제출
          </button>
        </form>
      ) : (
        // slider
        <div className="flex flex-col gap-6">
          <div className="text-center text-5xl font-extrabold text-brand">
            {sliderVal}
          </div>
          <input
            type="range"
            min={question.min}
            max={question.max}
            step={question.step}
            value={sliderVal}
            onChange={(e) => setSliderVal(Number(e.target.value))}
            className="h-3 w-full cursor-pointer appearance-none rounded-full bg-surface accent-brand"
          />
          <div className="flex justify-between text-sm text-ink-500">
            <span>{question.min}</span>
            <span>{question.max}</span>
          </div>
          <button
            onClick={() => onSubmit({ type: "slider", value: sliderVal })}
            className="btn-primary btn-lg"
          >
            제출
          </button>
        </div>
      )}
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center overflow-hidden px-5 py-[clamp(0.75rem,3vh,2.5rem)] text-center">
      {children}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-sm text-ink-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function PlayPage() {
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
