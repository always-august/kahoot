"use client";

import Link from "next/link";
import Papa from "papaparse";
import PresetBar from "@/components/common/PresetBar";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const STORAGE_KEY = "luckydraw:participants";

interface Participant {
  name: string;
  affiliation: string;
}

const HEADER_RE = /^(이름|name|성명|참가자|nickname)$/i;

/**
 * 공정한 무작위 추첨 — Fisher–Yates 부분 셔플.
 * `sort(() => Math.random() - 0.5)` 는 비교 함수가 일관되지 않아 결과가 균등하지 않다
 * (등록 순서에 따라 당첨 확률이 최대 3배 이상 벌어진다). 추첨기에서는 치명적이므로 쓰지 않는다.
 * 앞의 count 개만 필요하므로 전체를 섞지 않고 그만큼만 교환한다.
 */
function pickRandom<T>(pool: T[], count: number): T[] {
  const a = [...pool];
  const n = Math.min(count, a.length);
  for (let i = 0; i < n; i++) {
    // i 이상 구간에서 균등하게 하나를 골라 앞으로 보낸다
    const j = i + Math.floor(Math.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * 복권 긁기(스크래치) 카드 — 코팅을 긁으면 아래 children(당첨자)이 드러난다.
 * 일정 비율 이상 긁으면 나머지 코팅이 자동으로 사라진다.
 */
function ScratchCard({
  height = 260,
  children,
  hint = "긁어서 확인",
  onReveal,
}: {
  height?: number;
  children: React.ReactNode;
  hint?: string;
  onReveal?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const moveCountRef = useRef(0);
  const firedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);

  // 공개되는 순간 1회만 콜백 (당첨 기록은 이때 반영)
  useEffect(() => {
    if (revealed && !firedRef.current) {
      firedRef.current = true;
      onReveal?.();
    }
  }, [revealed, onReveal]);

  // 실제 렌더 크기(가로는 부모 폭)를 측정해 코팅을 그린다. 페인트 전에(useLayoutEffect) 그려 깜빡임 방지.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#39404c");
    g.addColorStop(0.5, "#525a68");
    g.addColorStop(1, "#39404c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 2;
    for (let x = -h; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "bold 18px Pretendard, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(hint, w / 2, h / 2);

    ctx.globalCompositeOperation = "destination-out";
  }, [height, hint]);

  const posFromEvent = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // 가장자리가 부드러운 방사형 브러시 한 점
  const stamp = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const r = 32;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.55, "rgba(0,0,0,0.6)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // 이전 지점~현재 지점 사이를 촘촘히 보간해 끊김 없이 부드럽게 지운다
  const scratchTo = (x: number, y: number) => {
    const ctx = canvasRef.current!.getContext("2d")!;
    const last = lastRef.current;
    if (!last) {
      stamp(ctx, x, y);
      lastRef.current = { x, y };
      return;
    }
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.round(dist / 5));
    for (let i = 1; i <= steps; i++) {
      stamp(ctx, last.x + (dx * i) / steps, last.y + (dy * i) / steps);
    }
    lastRef.current = { x, y };
  };

  const clearedRatio = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let cleared = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 24) {
      total += 1;
      if (data[i] < 40) cleared += 1; // 부드러운 브러시 → 거의 투명이면 지운 것으로 간주
    }
    return total ? cleared / total : 0;
  };

  const onDown = (e: React.PointerEvent) => {
    if (revealed) return;
    drawingRef.current = true;
    lastRef.current = null;
    const { x, y } = posFromEvent(e);
    scratchTo(x, y);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || revealed) return;
    const { x, y } = posFromEvent(e);
    scratchTo(x, y);
    moveCountRef.current += 1;
    // 긁는 도중에도 주기적으로 확인 → 절반 이상 긁으면 자동 공개
    if (moveCountRef.current % 20 === 0 && clearedRatio() > 0.55) {
      setRevealed(true);
    }
  };
  const onUp = () => {
    if (revealed) return;
    drawingRef.current = false;
    lastRef.current = null;
    if (clearedRatio() > 0.5) setRevealed(true);
  };

  return (
    <div
      ref={wrapRef}
      className="relative animate-pop w-full overflow-hidden rounded-2xl border border-brand/40 bg-black/70 shadow-[0_0_40px_rgba(43,255,102,0.3)]"
      style={{ height }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-white">
        {children}
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        className="absolute inset-0 h-full w-full touch-none"
        style={{
          cursor: revealed ? "default" : "grab",
          opacity: revealed ? 0 : 1,
          pointerEvents: revealed ? "none" : "auto",
          transition: "opacity 0.6s ease",
        }}
      />
    </div>
  );
}

export default function LuckyDrawPage() {
  const [people, setPeople] = useState<Participant[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [affInput, setAffInput] = useState("");
  const [winners, setWinners] = useState<Participant[]>([]);
  const [drawCount, setDrawCount] = useState(1);
  const [removeAfter, setRemoveAfter] = useState(true);
  const [slots, setSlots] = useState<Participant[]>([]);
  const [drawId, setDrawId] = useState(0); // 추첨마다 증가 → 스크래치 카드 리셋
  const fileRef = useRef<HTMLInputElement>(null);

  // 로드/저장
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setPeople(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
    } catch {
      /* ignore */
    }
  }, [people]);

  const addPeople = (rows: Participant[]) => {
    const cleaned = rows
      .map((r) => ({ name: r.name.trim(), affiliation: (r.affiliation ?? "").trim() }))
      .filter((r) => r.name);
    setPeople((prev) => {
      const names = new Set(prev.map((p) => p.name));
      const merged = [...prev];
      for (const r of cleaned)
        if (!names.has(r.name)) {
          names.add(r.name);
          merged.push(r);
        }
      return merged;
    });
  };

  const addOne = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    addPeople([{ name: nameInput, affiliation: affInput }]);
    setNameInput("");
    setAffInput("");
  };

  const remove = (name: string) =>
    setPeople((prev) => prev.filter((p) => p.name !== name));

  const clearAll = () => {
    if (confirm("명단을 모두 비울까요?")) {
      setPeople([]);
      setWinners([]);
      setSlots([]);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data.filter((r) => Array.isArray(r) && r[0]?.trim());
        // 첫 행이 헤더처럼 보이면 제외 (1열=이름, 2열=소속)
        if (rows[0] && HEADER_RE.test(rows[0][0].trim())) rows.shift();
        addPeople(rows.map((r) => ({ name: r[0], affiliation: r[1] ?? "" })));
      },
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const draw = () => {
    // 이미 당첨된 사람 + 현재 긁는 중(대기) 슬롯은 제외
    const pool = people.filter(
      (p) =>
        !winners.some((w) => w.name === p.name) &&
        !slots.some((s) => s.name === p.name),
    );
    const count = Math.min(drawCount, pool.length);
    if (count <= 0) return;

    // 당첨자만 몰래 선정해 스크래치 카드로 덮어 둔다.
    // 당첨 확정(기록·명단 반영)은 카드를 긁어 공개한 뒤 commitWinner 에서.
    const picked = pickRandom(pool, count);
    setDrawId((d) => d + 1);
    setSlots(picked);
  };

  const commitWinner = (p: Participant) => {
    setWinners((prev) =>
      prev.some((w) => w.name === p.name) ? prev : [...prev, p],
    );
    if (removeAfter) {
      setPeople((prev) => prev.filter((x) => x.name !== p.name));
    }
  };

  const resetWinners = () => {
    setWinners([]);
    setSlots([]);
  };

  const remaining = people.filter(
    (p) =>
      !winners.some((w) => w.name === p.name) &&
      !slots.some((s) => s.name === p.name),
  ).length;

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-5 py-10">
      <Link href="/" className="text-sm text-ink-500 hover:text-ink-700">
        ← 게임 선택
      </Link>
      <h1 className="mb-1 mt-3 text-3xl font-extrabold">럭키드로우</h1>
      <p className="mb-6 text-ink-500">명단을 올리고 당첨자를 추첨하세요.</p>

      <PresetBar<Participant[]>
        game="luckydraw"
        label="저장된 명단"
        getData={() => people}
        onLoad={(d) => {
          setPeople(Array.isArray(d) ? d : []);
          setWinners([]);
          setSlots([]);
        }}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* 추첨 머신 */}
        <section className="order-1">
          {slots.length > 0 ? (
            <div className="space-y-4">
              {slots.map((s, i) => (
                <ScratchCard
                  key={`${drawId}-${i}`}
                  height={280}
                  onReveal={() => s && commitWinner(s)}
                >
                  <div className="text-5xl font-extrabold sm:text-6xl">
                    {s?.name}
                  </div>
                  {s?.affiliation && (
                    <div className="mt-3 text-lg text-white/70">
                      {s.affiliation}
                    </div>
                  )}
                </ScratchCard>
              ))}
            </div>
          ) : (
            <div className="card flex min-h-[280px] items-center justify-center p-8 text-ink-500">
              버튼을 눌러 추첨을 시작하세요.
            </div>
          )}

          <div className="mt-5 card p-5">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                뽑을 인원
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, remaining)}
                  value={drawCount}
                  onChange={(e) => setDrawCount(Math.max(1, Number(e.target.value)))}
                  className="input w-20"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={removeAfter}
                  onChange={(e) => setRemoveAfter(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                당첨자 명단에서 제외
              </label>
              <span className="chip ml-auto">남은 인원 {remaining}명</span>
            </div>
            <button
              onClick={draw}
              disabled={remaining === 0}
              className="btn-primary btn-lg mt-4 w-full"
            >
              {winners.length > 0 ? "다시 추첨" : "추첨하기"}
            </button>
          </div>

          {winners.length > 0 && (
            <div className="mt-5 card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">당첨 기록 ({winners.length})</h2>
                <button
                  onClick={resetWinners}
                  className="text-sm text-ink-500 hover:text-tile-red"
                >
                  초기화
                </button>
              </div>
              <ol className="flex flex-wrap gap-2">
                {winners.map((w, i) => (
                  <li key={i} className="chip bg-tile-gold/15">
                    {i + 1}. {w.name}
                    {w.affiliation && (
                      <span className="ml-1 text-ink-500">· {w.affiliation}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* 명단 관리 */}
        <section className="order-2">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">명단 ({people.length})</h2>
              {people.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-sm text-ink-500 hover:text-tile-red"
                >
                  전체 삭제
                </button>
              )}
            </div>

            <form onSubmit={addOne} className="mb-3 space-y-2">
              <input
                className="input"
                placeholder="이름"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="소속 (선택)"
                  value={affInput}
                  onChange={(e) => setAffInput(e.target.value)}
                />
                <button type="submit" className="btn-ghost shrink-0 px-4">
                  추가
                </button>
              </div>
            </form>

            <button
              onClick={() => fileRef.current?.click()}
              className="btn-ghost mb-4 w-full text-sm"
            >
              CSV 업로드
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFile}
              className="hidden"
            />

            <ul className="no-scrollbar max-h-[360px] space-y-1.5 overflow-y-auto">
              {people.map((p) => {
                const won = winners.some((w) => w.name === p.name);
                return (
                  <li
                    key={p.name}
                    className={`flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm ${
                      won ? "opacity-40" : "bg-surface"
                    }`}
                  >
                    <span className={won ? "line-through" : ""}>
                      {p.name}
                      {p.affiliation && (
                        <span className="ml-1.5 text-ink-500">{p.affiliation}</span>
                      )}
                    </span>
                    <button
                      onClick={() => remove(p.name)}
                      className="text-ink-500 hover:text-tile-red"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
              {people.length === 0 && (
                <li className="py-8 text-center text-sm text-ink-500">
                  명단이 비어있어요.
                  <br />
                  이름을 추가하거나 CSV를 올려주세요.
                </li>
              )}
            </ul>
          </div>

          <p className="mt-3 px-1 text-xs text-ink-500">
            CSV는 1열(이름), 2열(소속) 형식으로 읽어옵니다. (이름/name 헤더는 자동 제외)
          </p>
        </section>
      </div>
    </main>
  );
}
