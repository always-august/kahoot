"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getSocket, type GameSocket } from "@/lib/socket/client";
import { useCountdown } from "@/lib/useCountdown";
import type {
  RelayAccepted,
  RelayProgressTeam,
  RelayPublicRound,
  RelayStanding,
  RelayTeamLobby,
} from "@/lib/relay/types";

type Phase = "join" | "team" | "lobby" | "round" | "result" | "over" | "closed";

function PlayInner() {
  const params = useSearchParams();
  const code = (params.get("room") ?? "").toUpperCase();

  const socketRef = useRef<GameSocket | null>(null);
  const [phase, setPhase] = useState<Phase>("join");
  const [nickname, setNickname] = useState("");
  const [teamNo, setTeamNo] = useState("");
  const [email, setEmail] = useState("");
  const [needsEmail, setNeedsEmail] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [title, setTitle] = useState("");

  const [teams, setTeams] = useState<RelayTeamLobby[]>([]);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [autoAssigned, setAutoAssigned] = useState(false);

  const [round, setRound] = useState<RelayPublicRound | null>(null);
  const [accepted, setAccepted] = useState<RelayAccepted[]>([]);
  const [progress, setProgress] = useState<RelayProgressTeam[]>([]);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [standings, setStandings] = useState<RelayStanding[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    socket.on("relay:teams", (d) => setTeams(d.teams));
    socket.on("relay:round", (d) => {
      setRound(d);
      setAccepted([]);
      setInput("");
      setFeedback(null);
      setPhase("round");
    });
    socket.on("relay:teamList", (d) => setAccepted(d.accepted));
    socket.on("relay:progress", (d) => setProgress(d.teams));
    socket.on("relay:judged", (d) =>
      setFeedback({ ok: d.accepted, msg: `${d.text} — ${d.accepted ? "인정!" : "오답"}` }),
    );
    socket.on("relay:roundOver", (d) => {
      setWinnerName(d.winnerName);
      setPhase("result");
    });
    socket.on("relay:over", (d) => {
      setStandings(d.standings);
      setPhase("over");
    });
    socket.on("room:closed", () => setPhase("closed"));
    return () => {
      socket.off("relay:teams");
      socket.off("relay:round");
      socket.off("relay:teamList");
      socket.off("relay:progress");
      socket.off("relay:judged");
      socket.off("relay:roundOver");
      socket.off("relay:over");
      socket.off("room:closed");
    };
  }, []);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return;
    setJoining(true);
    setJoinError("");
    // 사전 배정: 팀 번호를 넣으면 그 팀으로 바로 입장(명단·이메일 절차 생략)
    const no = teamNo.trim() ? Number(teamNo.trim()) : undefined;
    getSocket().emit("relay:join", { code, nickname: name, email: email.trim(), teamNo: no }, (res) => {
      setJoining(false);
      if (res.needsEmail) {
        // 동명이인 → 이메일로 본인 확인
        setNeedsEmail(true);
        setJoinError(res.error ?? "이메일을 입력해주세요.");
        return;
      }
      if (res.ok) {
        if (res.nickname) setNickname(res.nickname);
        setTitle(res.title ?? "");
        setTeams((res.teams ?? []).map((t) => ({ ...t, members: [] })));
        if (res.assignedTeamId) {
          // 명단(CSV)으로 자동 배정 → 팀 선택 생략
          setMyTeamId(res.assignedTeamId);
          setAutoAssigned(true);
          setPhase("lobby");
        } else {
          setPhase("team");
        }
      } else setJoinError(res.error ?? "입장에 실패했어요.");
    });
  };

  const pickTeam = (teamId: string) => {
    getSocket().emit("relay:pickTeam", { teamId }, (res) => {
      if (res.ok) {
        setMyTeamId(teamId);
        setPhase("lobby");
      } else setJoinError(res.error ?? "");
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    getSocket().emit("relay:submit", { text }, (res) => {
      if (res.status === "accepted") {
        setInput("");
        setFeedback({ ok: true, msg: "인정!" });
      } else if (res.status === "pending") {
        setInput("");
        setFeedback({ ok: true, msg: "판정 대기 중…" });
      } else {
        setFeedback({ ok: false, msg: res.reason ?? "제출 실패" });
      }
    });
  };

  const myTeamName = teams.find((t) => t.id === myTeamId)?.name ?? "";
  const myProgress = progress.find((t) => t.id === myTeamId);

  // ── 입장 ──
  if (phase === "join") {
    return (
      <Centered>
        <Link href="/relay" className="mb-6 text-sm text-ink-500 hover:text-ink-700">
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
          {!needsEmail && (
            <input
              className="input mb-2 text-center text-xl"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="팀 번호 (예: 7)"
              value={teamNo}
              onChange={(e) => setTeamNo(e.target.value.replace(/[^0-9]/g, ""))}
            />
          )}
          {needsEmail && (
            <input
              className="input mb-2 text-center"
              type="email"
              placeholder="회사 이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          )}
          {joinError && (
            <p
              className={`mb-2 text-center text-sm ${needsEmail ? "text-ink-500" : "text-tile-red"}`}
            >
              {joinError}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary mt-2 w-full"
            disabled={!nickname.trim() || !code || joining || (needsEmail && !email.trim())}
          >
            {joining ? "입장 중…" : needsEmail ? "이메일로 확인하고 입장" : "입장하기"}
          </button>
        </form>
      </Centered>
    );
  }

  // ── 팀 선택 ──
  if (phase === "team") {
    return (
      <Centered>
        <h1 className="mb-1 text-2xl font-extrabold">팀 선택</h1>
        <p className="mb-6 text-ink-500">함께할 팀을 고르세요.</p>
        <div className="grid w-full gap-3">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => pickTeam(t.id)}
              className="btn-ghost flex items-center justify-between py-4 text-lg"
            >
              <span className="font-bold">{t.name}</span>
              <span className="text-sm text-ink-500">{t.members.length}명</span>
            </button>
          ))}
        </div>
        {joinError && <p className="mt-3 text-sm text-tile-red">{joinError}</p>}
      </Centered>
    );
  }

  // ── 대기 ──
  if (phase === "lobby") {
    return (
      <Centered>
        <h1 className="text-2xl font-extrabold">입장 완료</h1>
        <p className="mt-2 text-ink-500">어드민이 시작하기를 기다리는 중…</p>
        <span className="mt-4 chip border-brand/30 bg-brand/10 text-brand">{myTeamName}</span>
        {autoAssigned && (
          <p className="mt-2 text-xs text-ink-500">명단에 따라 자동 배정되었어요</p>
        )}
        <p className="mt-4 text-sm text-ink-500">닉네임: {nickname}</p>
      </Centered>
    );
  }

  // ── 라운드 ──
  if (phase === "round" && round) {
    return (
      <RoundPlay
        round={round}
        myTeamName={myTeamName}
        accepted={accepted}
        myCount={myProgress?.count ?? accepted.length}
        others={progress.filter((t) => t.id !== myTeamId)}
        input={input}
        setInput={setInput}
        feedback={feedback}
        onSubmit={submit}
      />
    );
  }

  // ── 라운드 결과 ──
  if (phase === "result") {
    const iWon = myTeamName && winnerName === myTeamName;
    return (
      <Centered>
        <h1 className={`text-3xl font-extrabold ${iWon ? "text-brand" : ""}`}>
          {winnerName ? `${winnerName} 승리` : "무승부"}
        </h1>
        <p className="mt-3 text-ink-500">{iWon ? "우리 팀이 이겼어요!" : "다음 라운드를 기다리는 중…"}</p>
        <span className="mt-4 chip border-brand/30 bg-brand/10 text-brand">{myTeamName}</span>
      </Centered>
    );
  }

  // ── 최종 ──
  if (phase === "over") {
    const top = standings[0];
    const iWon = top && top.name === myTeamName;
    return (
      <Centered>
        <h1 className="text-3xl font-extrabold">게임 종료</h1>
        <div className="mt-6 w-full space-y-2 text-left">
          {standings.map((s, i) => (
            <div
              key={s.name}
              className={`flex justify-between rounded-xl border px-4 py-3 ${
                s.name === myTeamName ? "border-brand/50 bg-brand/10" : "border-line bg-surface"
              }`}
            >
              <span className="font-semibold">
                {i + 1}. {s.name}
              </span>
              <span className="font-bold">{s.score}점</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-ink-500">{iWon ? "우승 축하해요!" : ""}</p>
        <Link href="/" className="btn-ghost mt-6">
          홈으로
        </Link>
      </Centered>
    );
  }

  if (phase === "closed") {
    return (
      <Centered>
        <h1 className="text-2xl font-extrabold">게임이 종료되었어요</h1>
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

function RoundPlay({
  round,
  myTeamName,
  accepted,
  myCount,
  others,
  input,
  setInput,
  feedback,
  onSubmit,
}: {
  round: RelayPublicRound;
  myTeamName: string;
  accepted: RelayAccepted[];
  myCount: number;
  others: RelayProgressTeam[];
  input: string;
  setInput: (v: string) => void;
  feedback: { ok: boolean; msg: string } | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const remaining = useCountdown(round.deadline || null);
  const seconds = Math.ceil(remaining / 1000);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-8">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="chip border-brand/30 bg-brand/10 text-brand">{myTeamName}</span>
        {round.timeLimit > 0 && (
          <span className={`text-xl font-bold tabular-nums ${seconds <= 10 ? "text-tile-red" : "text-ink-900"}`}>
            {seconds}
          </span>
        )}
      </div>

      {/* my-auto: 화면이 남으면 세로 중앙, 길면 흐름대로 */}
      <div className="my-auto w-full">
      <h1 className="text-center text-2xl font-extrabold">{round.keyword}</h1>
      <p className="mb-4 mt-1 text-center text-ink-500">
        <span className="text-2xl font-bold text-brand">{myCount}</span> / {round.target}
      </p>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className="input text-lg"
          placeholder="단어 입력 후 제출"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          autoComplete="off"
        />
        <button type="submit" className="btn-primary shrink-0 px-5" disabled={!input.trim()}>
          제출
        </button>
      </form>
      {feedback && (
        <p className={`mt-2 text-center text-sm ${feedback.ok ? "text-brand" : "text-tile-red"}`}>
          {feedback.msg}
        </p>
      )}

      <p className="mb-2 mt-6 text-sm font-semibold text-ink-700">우리 팀 정답</p>
      <div className="flex flex-wrap gap-2">
        {accepted.map((a, i) => (
          <span key={i} className="chip">
            {a.display} <span className="ml-1 text-xs text-ink-500">{a.by}</span>
          </span>
        ))}
        {accepted.length === 0 && <p className="text-sm text-ink-500">아직 없어요. 먼저 외쳐보세요!</p>}
      </div>

      </div>

      {/* 상대 팀 현황: 화면 하단에 고정되어 아래 여백을 채움 */}
      {others.length > 0 && (
        <div className="pt-10">
          <p className="mb-4 text-sm text-ink-500">
            상대 팀{" "}
            {others.length > 5 && (
              <span className="text-xs">상위 5팀 · 전체 {others.length}팀</span>
            )}
          </p>
          <div className="flex items-end justify-center gap-4">
            {[...others]
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
              .map((t) => (
                <BlockTower key={t.id} name={t.name} count={t.count} target={round.target} />
              ))}
          </div>
        </div>
      )}
    </main>
  );
}

/** 팀 점수를 블록으로 쌓아 보여준다. 새로 늘어난 블록만 쌓이는 애니메이션 재생 */
function BlockTower({
  name,
  count,
  target,
}: {
  name: string;
  count: number;
  target: number;
}) {
  const prevRef = useRef(count);
  const prev = prevRef.current;
  useEffect(() => {
    prevRef.current = count;
  }, [count]);

  return (
    <div className="flex w-20 flex-col items-center">
      <span className="mb-2 text-base font-bold tabular-nums text-ink-900">
        {count}
        <span className="text-xs font-normal text-ink-500">/{target}</span>
      </span>
      {/* 아래에서 위로 쌓이도록 역순 배치 */}
      <div className="flex w-full flex-col-reverse items-center gap-1.5">
        {Array.from({ length: count }).map((_, i) => (
          <span
            key={i}
            className={`h-5 w-full rounded-md bg-brand shadow-[0_0_10px_rgba(43,255,102,0.35)] ${
              i >= prev ? "block-stack" : ""
            }`}
          />
        ))}
        {count === 0 && <span className="h-5 w-full rounded-md bg-surface" />}
      </div>
      <span className="mt-3 w-full truncate text-center text-sm text-ink-700">
        {name}
      </span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 py-10 text-center">
      {children}
    </main>
  );
}

export default function RelayPlayPage() {
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
