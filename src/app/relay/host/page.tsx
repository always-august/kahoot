"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import QRPanel from "@/components/quiz/QRPanel";
import PresetBar from "@/components/common/PresetBar";
import { getSocket, type GameSocket } from "@/lib/socket/client";
import { useCountdown } from "@/lib/useCountdown";
import type {
  RelayRosterEntry,
  RelayHostTeam,
  RelayPendingItem,
  RelayPublicRound,
  RelayRoundOver,
  RelayStanding,
  RelayTeamLobby,
} from "@/lib/relay/types";

type LivePhase = "lobby" | "round" | "result" | "over";

interface EditRound {
  id: string;
  keyword: string;
  target: number;
  timeLimit: number;
  answersText: string;
}
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r_${Math.random().toString(36).slice(2, 9)}`;
const newRound = (): EditRound => ({
  id: newId(),
  keyword: "",
  target: 5,
  timeLimit: 90,
  answersText: "",
});
const parseAnswers = (text: string): string[][] =>
  text
    .split("\n")
    .map((l) => l.split(",").map((s) => s.trim()).filter(Boolean))
    .filter((g) => g.length > 0);

export default function RelayHostPage() {
  const [stage, setStage] = useState<"build" | "live">("build");

  const [title, setTitle] = useState("");
  const [teamCount, setTeamCount] = useState(2);
  const [teamNames, setTeamNames] = useState<string[]>(["", ""]);
  const [noConsecutive, setNoConsecutive] = useState(true);
  const [rounds, setRounds] = useState<EditRound[]>([newRound()]);
  const [roster, setRoster] = useState<RelayRosterEntry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const rosterFileRef = useRef<HTMLInputElement>(null);

  const socketRef = useRef<GameSocket | null>(null);
  const [room, setRoom] = useState<{ code: string; joinUrl: string } | null>(null);
  const [phase, setPhase] = useState<LivePhase>("lobby");
  const [teams, setTeams] = useState<RelayTeamLobby[]>([]);
  const [round, setRound] = useState<RelayPublicRound | null>(null);
  const [hostTeams, setHostTeams] = useState<RelayHostTeam[]>([]);
  const [pending, setPending] = useState<RelayPendingItem[]>([]);
  const [roundOver, setRoundOver] = useState<RelayRoundOver | null>(null);
  const [standings, setStandings] = useState<RelayStanding[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    socket.on("relay:teams", (d) => setTeams(d.teams));
    socket.on("relay:round", (d) => {
      setRound(d);
      setRoundOver(null);
      setPhase("round");
    });
    socket.on("relay:host", (d) => {
      setHostTeams(d.teams);
      setPending(d.pending);
    });
    socket.on("relay:roundOver", (d) => {
      setRoundOver(d);
      setPhase("result");
    });
    socket.on("relay:over", (d) => {
      setStandings(d.standings);
      setPhase("over");
    });
    return () => {
      socket.off("relay:teams");
      socket.off("relay:round");
      socket.off("relay:host");
      socket.off("relay:roundOver");
      socket.off("relay:over");
    };
  }, []);

  /** CSV(1열 이름, 2열 팀) 업로드 → 명단 저장 + 팀 구성 자동 설정 */
  const onRosterFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data.filter((r) => Array.isArray(r) && r[0]?.trim());
        if (rows[0] && /^(이름|name|성명|참가자|닉네임)$/i.test(rows[0][0].trim()))
          rows.shift();
        const entries = rows
          .map((r) => ({
            name: (r[0] ?? "").trim(),
            team: (r[1] ?? "").trim(),
            email: (r[2] ?? "").trim(),
          }))
          .filter((x) => x.name && x.team);
        if (entries.length === 0) return;
        const distinct = [...new Set(entries.map((x) => x.team))];
        setRoster(entries);
        if (distinct.length >= 2) {
          setTeamCount(distinct.length);
          setTeamNames(distinct);
        }
      },
    });
    if (rosterFileRef.current) rosterFileRef.current.value = "";
  };

  const rosterByTeam = roster.reduce<Record<string, number>>((acc, r) => {
    acc[r.team] = (acc[r.team] ?? 0) + 1;
    return acc;
  }, {});

  // 동명이인인데 이메일이 없으면 본인 확인이 불가 → 경고
  const dupNoEmail = (() => {
    const byName = new Map<string, RelayRosterEntry[]>();
    for (const r of roster) {
      const k = r.name.trim().toLowerCase();
      byName.set(k, [...(byName.get(k) ?? []), r]);
    }
    return [...byName.entries()]
      .filter(([, list]) => list.length > 1 && list.some((x) => !x.email?.trim()))
      .map(([k]) => k);
  })();

  const setCount = (n: number) => {
    setTeamCount(n);
    setTeamNames((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("");
      return next.slice(0, n);
    });
  };

  const open = () => {
    const errs: string[] = [];
    if (!title.trim()) errs.push("제목을 입력해주세요.");
    if (teamCount < 2) errs.push("팀은 2개 이상이어야 해요.");
    rounds.forEach((r, i) => {
      if (!r.keyword.trim()) errs.push(`${i + 1}라운드: 키워드가 비어있어요.`);
      if (r.target < 1) errs.push(`${i + 1}라운드: 목표 개수는 1 이상이어야 해요.`);
    });
    setErrors(errs);
    if (errs.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const quiz = {
      title: title.trim(),
      teamCount,
      teamNames: teamNames.slice(0, teamCount),
      noConsecutive,
      rounds: rounds.map((r) => ({
        id: r.id,
        keyword: r.keyword.trim(),
        target: r.target,
        timeLimit: r.timeLimit,
        answers: parseAnswers(r.answersText),
      })),
      roster,
    };
    getSocket().emit("relay:create", quiz, (res) => {
      if (res.code) {
        setRoom(res);
        setStage("live");
      }
    });
  };

  // ─────────── 빌드 ───────────
  if (stage === "build") {
    return (
      <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10">
        <Link href="/relay" className="text-sm text-ink-500 hover:text-ink-700">
          ← 뒤로
        </Link>
        <h1 className="mb-6 mt-3 text-3xl font-extrabold">키워드 릴레이 만들기</h1>

        {errors.length > 0 && (
          <div className="mb-5 rounded-xl border border-tile-red/40 bg-tile-red/10 p-4 text-sm">
            <ul className="list-inside list-disc text-ink-700">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <PresetBar<{
          title: string;
          teamCount: number;
          teamNames: string[];
          noConsecutive: boolean;
          rounds: EditRound[];
          roster: RelayRosterEntry[];
        }>
          game="relay"
          label="저장된 릴레이"
          getData={() => ({ title, teamCount, teamNames, noConsecutive, rounds, roster })}
          onLoad={(d) => {
            setTitle(d.title ?? "");
            setTeamCount(d.teamCount ?? 2);
            setTeamNames(d.teamNames ?? ["", ""]);
            setNoConsecutive(d.noConsecutive ?? true);
            setRounds(d.rounds?.length ? d.rounds : [newRound()]);
            setRoster(d.roster ?? []);
          }}
        />

        <div className="card mb-6 space-y-4 p-5">
          <div>
            <label className="label">제목</label>
            <input
              className="input text-lg"
              placeholder="예: 사내 순발력 대전"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="mb-1 block text-ink-700">팀 수</span>
              {/* 사전 배정 팀 번호 방식 — 100명/4 = 25팀처럼 많은 팀을 지원 */}
              <input
                type="number"
                min={2}
                max={50}
                className="input w-24"
                value={teamCount}
                onChange={(e) =>
                  setCount(Math.max(2, Math.min(50, Number(e.target.value) || 2)))
                }
              />
              <span className="mt-1 block text-xs text-ink-500">2~50팀</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={noConsecutive}
                onChange={(e) => setNoConsecutive(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              연속 금지 (같은 사람 연속 정답 불가)
            </label>
          </div>
          {/* 명단 CSV 자동 배정 */}
          <div className="rounded-xl border border-line bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => rosterFileRef.current?.click()}
                className="btn-ghost px-4 py-2 text-sm"
              >
                명단 CSV 업로드
              </button>
              <input
                ref={rosterFileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={onRosterFile}
                className="hidden"
              />
              {roster.length > 0 ? (
                <>
                  <span className="chip border-brand/30 bg-brand/10 text-brand">
                    {roster.length}명 자동 배정
                  </span>
                  {Object.entries(rosterByTeam).map(([team, n]) => (
                    <span key={team} className="chip px-2 py-0.5 text-xs">
                      {team} {n}
                    </span>
                  ))}
                  <button
                    onClick={() => setRoster([])}
                    className="text-sm text-ink-500 hover:text-tile-red"
                  >
                    비우기
                  </button>
                </>
              ) : (
                <span className="text-sm text-ink-500">
                  업로드하면 입장 시 닉네임으로 팀이 자동 배정됩니다.
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              형식: <span className="font-mono">1열 이름, 2열 팀, 3열 이메일</span> (예:{" "}
              <span className="font-mono">김민석,레드,minseok@imweb.me</span>) · 팀 구성은 CSV의 팀
              값으로 자동 설정됩니다. <b>동명이인</b>은 입장할 때 이메일로 본인 확인합니다. 명단에
              없는 사람은 직접 팀을 고릅니다. 명단을 올리면 <b>팀 번호로 입장할 때 이름·번호가
              명단과 일치하는지 검증</b>합니다.
            </p>
            {dupNoEmail.length > 0 && (
              <p className="mt-2 rounded-lg border border-tile-gold/40 bg-tile-gold/10 p-2 text-xs text-tile-gold">
                이메일이 비어 있는 동명이인이 있어요: {dupNoEmail.join(", ")} — 3열에 이메일을
                넣어야 본인 확인이 됩니다.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {teamNames.slice(0, teamCount).map((n, i) => (
              <input
                key={i}
                className="input text-sm"
                placeholder={`${i + 1}팀 이름 (선택)`}
                value={n}
                onChange={(e) =>
                  setTeamNames((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))
                }
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {rounds.map((r, i) => (
            <div key={r.id} className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-bold text-black">
                  {i + 1}
                </span>
                {rounds.length > 1 && (
                  <button
                    onClick={() => setRounds((rs) => rs.filter((_, idx) => idx !== i))}
                    className="text-sm text-ink-500 hover:text-tile-red"
                  >
                    삭제
                  </button>
                )}
              </div>
              <input
                className="input mb-3 text-lg"
                placeholder="키워드 (예: 여자 아이돌 그룹)"
                value={r.keyword}
                onChange={(e) =>
                  setRounds((rs) => rs.map((x, idx) => (idx === i ? { ...x, keyword: e.target.value } : x)))
                }
              />
              <div className="mb-3 flex flex-wrap gap-4 text-sm">
                <label>
                  <span className="mb-1 block text-ink-700">목표 개수 N</span>
                  <input
                    type="number"
                    min={1}
                    className="input w-24"
                    value={r.target}
                    onChange={(e) =>
                      setRounds((rs) =>
                        rs.map((x, idx) => (idx === i ? { ...x, target: Math.max(1, Number(e.target.value)) } : x)),
                      )
                    }
                  />
                </label>
                <label>
                  <span className="mb-1 block text-ink-700">제한시간(초, 0=무제한)</span>
                  <input
                    type="number"
                    min={0}
                    className="input w-32"
                    value={r.timeLimit}
                    onChange={(e) =>
                      setRounds((rs) =>
                        rs.map((x, idx) => (idx === i ? { ...x, timeLimit: Math.max(0, Number(e.target.value)) } : x)),
                      )
                    }
                  />
                </label>
              </div>
              <label className="label">정답 목록 (한 줄에 하나, 별칭은 쉼표로)</label>
              <textarea
                className="input h-28 resize-y font-mono text-sm"
                placeholder={"소녀시대, 소시, girls generation\n아일릿\n뉴진스, newjeans"}
                value={r.answersText}
                onChange={(e) =>
                  setRounds((rs) => rs.map((x, idx) => (idx === i ? { ...x, answersText: e.target.value } : x)))
                }
              />
              <p className="mt-1 text-xs text-ink-500">
                비워두거나 목록에 없는 답은 진행 중 어드민이 직접 인정/거절합니다.
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={() => setRounds((rs) => [...rs, newRound()])}
          className="btn-ghost mt-4 w-full"
        >
          + 라운드 추가
        </button>
        <button onClick={open} className="btn-primary btn-lg mt-8 w-full">
          방 개설하기 · QR 만들기
        </button>
      </main>
    );
  }

  // ─────────── 라이브 ───────────
  const emit = socketRef.current;
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 py-10">
      {/* my-auto: 화면이 크면 세로 중앙, 내용이 길면 그냥 흐름대로(잘림 없음) */}
      <div className="my-auto w-full">
      {phase === "lobby" && room && (
        <div className="grid gap-8 md:grid-cols-[auto_1fr]">
          <QRPanel code={room.code} joinUrl={room.joinUrl} />
          <div>
            <h1 className="text-2xl font-extrabold">{title}</h1>
            <p className="mt-1 text-ink-500">QR로 입장 후 팀을 선택하세요.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {teams.map((t) => (
                <div key={t.id} className="rounded-xl border border-line bg-surface p-3">
                  <p className="mb-1 font-semibold text-ink-900">
                    {t.name}{" "}
                    <span className="text-sm font-normal text-ink-500">
                      ({t.members.length})
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {t.members.map((m) => (
                      <span key={m} className="chip px-2 py-0.5 text-xs">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => emit?.emit("relay:autobalance")} className="btn-ghost">
                자동 밸런스
              </button>
              <button
                onClick={() => emit?.emit("relay:start")}
                className="btn-primary flex-1"
                disabled={teams.every((t) => t.members.length === 0)}
              >
                게임 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "round" && round && (
        <RoundLive
          round={round}
          hostTeams={hostTeams}
          pending={pending}
          onApprove={(id) => emit?.emit("relay:approve", { pendingId: id })}
          onReject={(id) => emit?.emit("relay:reject", { pendingId: id })}
        />
      )}

      {phase === "result" && roundOver && (
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-extrabold">
            {roundOver.winnerName ? `${roundOver.winnerName} 승리!` : "라운드 종료 (무승부)"}
          </h1>
          <div className="mx-auto mt-6 max-w-md space-y-2 text-left">
            {roundOver.counts.map((c) => (
              <div key={c.name} className="flex justify-between rounded-lg border border-line bg-surface px-4 py-2">
                <span>{c.name}</span>
                <span className="font-bold">{c.count}개</span>
              </div>
            ))}
          </div>
          <h3 className="mt-8 text-lg font-bold">누적 점수</h3>
          <div className="mx-auto mt-2 max-w-md space-y-2 text-left">
            {[...roundOver.scores]
              .sort((a, b) => b.score - a.score)
              .map((s) => (
                <div key={s.name} className="flex justify-between rounded-lg border border-brand/30 bg-brand/5 px-4 py-2">
                  <span className="font-semibold text-ink-900">{s.name}</span>
                  <span className="font-bold text-brand">{s.score}점</span>
                </div>
              ))}
          </div>
          <button onClick={() => emit?.emit("relay:next")} className="btn-primary btn-lg mt-8">
            {round && round.index + 1 >= round.total ? "최종 결과" : "다음 라운드 →"}
          </button>
        </div>
      )}

      {phase === "over" && (
        <div className="text-center">
          <h1 className="mb-6 text-4xl font-extrabold">최종 결과</h1>
          <div className="mx-auto max-w-md space-y-2">
            {standings.map((s, i) => (
              <div
                key={s.name}
                className={`flex items-center justify-between rounded-xl border px-5 py-4 ${
                  i === 0 ? "border-brand/50 bg-brand/10" : "border-line bg-surface"
                }`}
              >
                <span className="font-bold">
                  {i + 1}. {s.name}
                </span>
                <span className={`font-extrabold ${i === 0 ? "text-brand" : ""}`}>
                  {s.score}점
                </span>
              </div>
            ))}
          </div>
          <Link href="/" className="btn-ghost mt-8 inline-flex">
            홈으로
          </Link>
        </div>
      )}
      </div>
    </main>
  );
}

function RoundLive({
  round,
  hostTeams,
  pending,
  onApprove,
  onReject,
}: {
  round: RelayPublicRound;
  hostTeams: RelayHostTeam[];
  pending: RelayPendingItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const remaining = useCountdown(round.deadline || null);
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-sm text-ink-500">
        <span>
          라운드 {round.index + 1} / {round.total}
        </span>
        {round.timeLimit > 0 && (
          <span className={`text-2xl font-bold tabular-nums ${seconds <= 10 ? "text-tile-red" : "text-ink-900"}`}>
            {seconds}
          </span>
        )}
      </div>
      <h2 className="mb-1 text-center text-3xl font-extrabold">{round.keyword}</h2>
      <p className="mb-8 text-center text-ink-500">목표 {round.target}개</p>

      {/* 판정 대기열 */}
      {pending.length > 0 && (
        <div className="mb-8 rounded-xl border border-tile-gold/40 bg-tile-gold/10 p-4">
          <p className="mb-2 text-sm font-semibold text-tile-gold">판정 대기 {pending.length}건</p>
          <ul className="space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
                <span className="chip px-2 py-0.5 text-xs">{p.teamName}</span>
                <span className="text-xs text-ink-500">{p.nickname}</span>
                <span className="flex-1 font-semibold text-ink-900">{p.text}</span>
                <button onClick={() => onApprove(p.id)} className="rounded-lg bg-brand px-3 py-1 text-sm font-bold text-black">
                  인정
                </button>
                <button onClick={() => onReject(p.id)} className="rounded-lg border border-line px-3 py-1 text-sm text-ink-700">
                  거절
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 팀별 진행 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {hostTeams.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-ink-900">{t.name}</span>
              <span className="chip border-brand/30 bg-brand/10 text-brand">
                {t.count} / {round.target}
              </span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.min(100, (t.count / round.target) * 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {t.accepted.map((a, i) => (
                <span key={i} className="chip px-2 py-0.5 text-xs">
                  {a.display}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
