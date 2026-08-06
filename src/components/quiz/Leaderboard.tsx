"use client";

import type { LeaderboardEntry } from "@/lib/game/types";

export default function Leaderboard({
  entries,
  limit = 8,
  showGained = true,
  meId,
}: {
  entries: LeaderboardEntry[];
  limit?: number;
  showGained?: boolean;
  /** 참가자 화면에서 본인 행을 강조하기 위한 playerId */
  meId?: string;
}) {
  const list = entries.slice(0, limit);
  return (
    <ul className="mx-auto w-full max-w-sm space-y-[clamp(0.25rem,0.8vh,0.5rem)]">
      {list.map((e, i) => {
        const isMe = !!meId && e.playerId === meId;
        return (
          <li
            key={e.playerId}
            className={`flex animate-pop items-center gap-3 rounded-xl border px-4 py-[clamp(0.35rem,1.2vh,0.75rem)] ${
              isMe
                ? "border-brand bg-brand/10 shadow-[0_0_16px_rgba(43,255,102,0.25)]"
                : "border-line bg-surface"
            }`}
          >
            <span
              className={`w-6 text-center text-[clamp(0.9rem,2.4vh,1.125rem)] font-bold ${
                isMe ? "text-brand" : i < 3 ? "text-brand" : "text-ink-500"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`flex-1 truncate font-semibold ${
                isMe ? "text-brand" : "text-ink-900"
              }`}
            >
              {e.nickname}
              {isMe && <span className="ml-1.5 text-xs font-normal">(나)</span>}
            </span>
            {showGained && e.gained > 0 && (
              <span className="text-sm font-semibold text-tile-green">+{e.gained}</span>
            )}
            <span
              className={`w-14 text-right font-bold tabular-nums ${
                isMe ? "text-brand" : "text-ink-900"
              }`}
            >
              {e.score}
            </span>
          </li>
        );
      })}
      {list.length === 0 && (
        <li className="py-6 text-center text-ink-500">아직 점수가 없어요.</li>
      )}
    </ul>
  );
}
