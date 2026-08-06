"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QuestionEditor from "@/components/quiz/QuestionEditor";
import PresetBar from "@/components/common/PresetBar";
import QRPanel from "@/components/quiz/QRPanel";
import Leaderboard from "@/components/quiz/Leaderboard";
import { getSocket, type GameSocket } from "@/lib/socket/client";
import { newQuestion, validateQuiz } from "@/lib/game/factory";
import { useCountdown } from "@/lib/useCountdown";
import type {
  HostReveal,
  LeaderboardEntry,
  Question,
  QuestionType,
} from "@/lib/game/types";

type LivePhase = "lobby" | "question" | "reveal" | "over";
const TILE = ["tile-a", "tile-b", "tile-c", "tile-d"];

export default function HostPage() {
  const [stage, setStage] = useState<"build" | "live">("build");

  // 빌드 상태
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // 라이브 상태
  const socketRef = useRef<GameSocket | null>(null);
  const [room, setRoom] = useState<{ code: string; joinUrl: string } | null>(null);
  const [players, setPlayers] = useState<{ id: string; nickname: string }[]>([]);
  const [phase, setPhase] = useState<LivePhase>("lobby");
  const [qIndex, setQIndex] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [answered, setAnswered] = useState({ answeredCount: 0, totalPlayers: 0 });
  const [reveal, setReveal] = useState<HostReveal | null>(null);
  const [finalBoard, setFinalBoard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    socket.on("host:lobby", (d) => setPlayers(d.players));
    socket.on("player:question", (d) => {
      setQIndex(d.index);
      setDeadline(d.deadline);
      setReveal(null);
      setAnswered({ answeredCount: 0, totalPlayers: answered.totalPlayers });
      setPhase("question");
    });
    socket.on("host:answered", (d) => setAnswered(d));
    socket.on("host:reveal", (d) => {
      setReveal(d);
      setPhase("reveal");
    });
    socket.on("host:over", (d) => {
      setFinalBoard(d.leaderboard);
      setPhase("over");
    });
    return () => {
      socket.off("host:lobby");
      socket.off("player:question");
      socket.off("host:answered");
      socket.off("host:reveal");
      socket.off("host:over");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addQuestion = (type: QuestionType) =>
    setQuestions((qs) => [...qs, newQuestion(type)]);
  const updateQuestion = (i: number, q: Question) =>
    setQuestions((qs) => qs.map((x, idx) => (idx === i ? q : x)));
  const removeQuestion = (i: number) =>
    setQuestions((qs) => qs.filter((_, idx) => idx !== i));

  const openRoom = () => {
    const quiz = { title: title.trim(), questions };
    const errs = validateQuiz(quiz);
    setErrors(errs);
    if (errs.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const socket = getSocket();
    socket.emit("host:create", quiz, (res) => {
      if (res.code) {
        setRoom(res);
        setStage("live");
      }
    });
  };

  const currentQ = questions[qIndex];

  // ─────────────────────────── 빌드 화면 ───────────────────────────
  if (stage === "build") {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10">
        <Link href="/quiz" className="text-sm text-ink-500 hover:text-ink-700">
          ← 뒤로
        </Link>
        <h1 className="mb-6 mt-3 text-3xl font-extrabold">퀴즈 만들기</h1>

        {errors.length > 0 && (
          <div className="mb-5 rounded-xl border border-tile-red/40 bg-tile-red/10 p-4 text-sm">
            <p className="mb-1 font-semibold text-tile-red">확인이 필요해요</p>
            <ul className="list-inside list-disc text-ink-700">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <PresetBar<{ title: string; questions: Question[] }>
          game="quiz"
          label="저장된 퀴즈"
          getData={() => ({ title, questions })}
          onLoad={(d) => {
            setTitle(d.title ?? "");
            setQuestions(d.questions ?? []);
          }}
        />

        <div className="card mb-6 p-5">
          <label className="label" htmlFor="title">
            퀴즈 제목
          </label>
          <input
            id="title"
            className="input text-lg"
            placeholder="예: 아임웹 상식 퀴즈"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              question={q}
              index={i}
              onChange={(nq) => updateQuestion(i, nq)}
              onRemove={() => removeQuestion(i)}
            />
          ))}
        </div>

        <div className="mt-6 card p-5">
          <p className="label">문제 추가</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <AddBtn onClick={() => addQuestion("choice")} label="객관식" />
            <AddBtn onClick={() => addQuestion("ox")} label="OX" />
            <AddBtn onClick={() => addQuestion("short")} label="주관식" />
            <AddBtn onClick={() => addQuestion("slider")} label="슬라이더" />
          </div>
        </div>

        <button
          onClick={openRoom}
          className="btn-primary btn-lg mt-8 w-full"
          disabled={questions.length === 0}
        >
          방 개설하기 · QR 만들기
        </button>
      </main>
    );
  }

  // ─────────────────────────── 라이브 화면 ───────────────────────────
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 py-10">
      {/* my-auto: 화면이 크면 세로 중앙, 내용이 길면 그냥 흐름대로(잘림 없음) */}
      <div className="my-auto w-full">
      {/* 로비 */}
      {phase === "lobby" && room && (
        <div className="grid gap-8 md:grid-cols-[auto_1fr]">
          <QRPanel code={room.code} joinUrl={room.joinUrl} />
          <div>
            <h1 className="text-2xl font-extrabold">{title}</h1>
            <p className="mt-1 text-ink-500">
              QR을 찍거나 코드를 입력해 입장하세요.
            </p>
            <div className="mt-5 flex items-center justify-between">
              <span className="chip">참가자 {players.length}명</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {players.map((p) => (
                <span
                  key={p.id}
                  className="chip animate-pop border-brand/20 bg-brand/10 text-brand"
                >
                  {p.nickname}
                </span>
              ))}
              {players.length === 0 && (
                <p className="text-ink-500">참가자를 기다리는 중…</p>
              )}
            </div>
            <button
              onClick={() => socketRef.current?.emit("host:start")}
              className="btn-primary btn-lg mt-8 w-full"
              disabled={players.length === 0}
            >
              게임 시작 ({players.length}명)
            </button>
          </div>
        </div>
      )}

      {/* 문제 진행 */}
      {phase === "question" && currentQ && (
        <QuestionLive
          question={currentQ}
          index={qIndex}
          total={questions.length}
          deadline={deadline}
          answered={answered}
          onReveal={() => socketRef.current?.emit("host:reveal")}
        />
      )}

      {/* 정답 공개 */}
      {phase === "reveal" && reveal && currentQ && (
        <RevealLive question={currentQ} reveal={reveal} />
      )}

      {/* 최종 결과 */}
      {phase === "over" && (
        <div className="text-center">
          <h1 className="mb-2 text-4xl font-extrabold">최종 결과</h1>
          <p className="mb-8 text-ink-500">{title}</p>
          <Podium entries={finalBoard} />
          <div className="mx-auto mt-8 max-w-lg">
            <Leaderboard entries={finalBoard} limit={5} showGained={false} />
          </div>
          <Link href="/" className="btn-ghost mt-8 inline-flex">
            홈으로
          </Link>
        </div>
      )}
      </div>
    </main>
  );

  // closed 처리용 리스너는 아래에서 등록 (JSX 밖 불가하므로 effect로 이동 필요)
}

function AddBtn({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button onClick={onClick} className="btn-ghost py-4 text-sm" type="button">
      {label}
    </button>
  );
}

function QuestionLive({
  question,
  index,
  total,
  deadline,
  answered,
  onReveal,
}: {
  question: Question;
  index: number;
  total: number;
  deadline: number | null;
  answered: { answeredCount: number; totalPlayers: number };
  onReveal: () => void;
}) {
  const remaining = useCountdown(deadline);
  const seconds = Math.ceil(remaining / 1000);
  const pct =
    deadline && question.timeLimit
      ? Math.max(0, Math.min(1, remaining / (question.timeLimit * 1000)))
      : 0;

  return (
    <div>
      <div className="mb-4 text-sm text-ink-500">
        문제 {index + 1} / {total}
      </div>
      <div className="mb-6 flex items-center justify-between">
        <span className="chip">
          {answered.answeredCount} / {answered.totalPlayers} 응답
        </span>
        <TimerRing seconds={seconds} pct={pct} />
      </div>

      <h2 className="mb-5 text-center text-3xl font-extrabold sm:text-4xl">
        {question.text}
      </h2>
      {question.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={question.image}
          alt=""
          className="mx-auto mb-6 max-h-64 rounded-xl border border-line object-contain"
        />
      )}

      <QuestionPreview question={question} />

      <button onClick={onReveal} className="btn-primary btn-lg mt-8 w-full">
        정답 공개
      </button>
    </div>
  );
}

function TimerRing({ seconds, pct }: { seconds: number; pct: number }) {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="absolute h-16 w-16 -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke={pct > 0.3 ? "#2bff66" : "#ea4c5f"}
          strokeWidth="3"
          strokeDasharray={`${pct * 100.5} 100.5`}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-xl font-bold tabular-nums text-ink-900">{seconds}</span>
    </div>
  );
}

function QuestionPreview({ question }: { question: Question }) {
  if (question.type === "choice") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {question.options.map((opt, i) => (
          <div
            key={i}
            className={`${TILE[i]} flex items-center gap-3 rounded-xl px-5 py-5 text-lg font-semibold`}
          >
            <span className="opacity-80">{["▲", "◆", "●", "■"][i]}</span>
            {opt}
          </div>
        ))}
      </div>
    );
  }
  if (question.type === "ox") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="tile-b flex items-center justify-center rounded-xl py-10 text-5xl font-extrabold">
          O
        </div>
        <div className="tile-a flex items-center justify-center rounded-xl py-10 text-5xl font-extrabold">
          X
        </div>
      </div>
    );
  }
  if (question.type === "slider") {
    return (
      <p className="text-center text-ink-500">
        참가자가 {question.min} ~ {question.max} 사이 값을 맞추는 중…
      </p>
    );
  }
  return (
    <p className="text-center text-ink-500">참가자가 답을 입력하는 중…</p>
  );
}

function RevealLive({
  question,
  reveal,
}: {
  question: Question;
  reveal: HostReveal;
}) {
  return (
    <div>
      <h2 className="mb-4 text-center text-xl font-bold text-ink-700">{question.text}</h2>
      <p className="text-center text-sm text-ink-500">정답</p>
      <p className="text-center text-5xl font-extrabold leading-tight text-tile-green sm:text-6xl">
        {reveal.correctText}
      </p>
      {reveal.explanation && (
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-ink-700">
          <span className="mr-2 font-semibold text-ink-900">해설</span>
          {reveal.explanation}
        </p>
      )}
      <p className="mt-4 text-center text-sm text-ink-500">
        응답 {reveal.answeredCount} / {reveal.totalPlayers} · 잠시 후 다음 문제로 넘어갑니다…
      </p>

      <h3 className="mb-3 mt-8 text-lg font-bold">
        순위 <span className="text-sm font-normal text-ink-500">TOP 5</span>
      </h3>
      <Leaderboard entries={reveal.leaderboard} limit={5} />
    </div>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  const order = [1, 0, 2]; // 2등, 1등, 3등 배치
  const heights = ["h-24", "h-36", "h-16"];
  return (
    <div className="flex items-end justify-center gap-3">
      {order.map((rank) => {
        const e = top[rank];
        if (!e) return <div key={rank} className="w-24" />;
        return (
          <div key={rank} className="flex w-24 flex-col items-center">
            <div className="mb-2 text-lg font-bold text-brand">{rank + 1}위</div>
            <div className="mb-1 max-w-full truncate text-sm font-semibold text-ink-900">
              {e.nickname}
            </div>
            <div
              className={`flex w-full ${heights[rank]} items-start justify-center rounded-t-xl bg-gradient-to-b from-brand to-brand-dark pt-2 font-bold text-black`}
            >
              {e.score}
            </div>
          </div>
        );
      })}
    </div>
  );
}
