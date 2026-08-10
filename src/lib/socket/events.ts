import type {
  Answer,
  HostReveal,
  LeaderboardEntry,
  PersonalResult,
  PublicQuestion,
  Quiz,
} from "../game/types";
/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
  // 방장 대상
  "host:lobby": (data: { players: { id: string; nickname: string }[] }) => void;
  "host:answered": (data: { answeredCount: number; totalPlayers: number }) => void;
  "host:reveal": (data: HostReveal) => void;
  "host:over": (data: { leaderboard: LeaderboardEntry[] }) => void;

  // 참가자 대상
  "player:question": (data: PublicQuestion) => void;
  "player:result": (data: PersonalResult) => void;
  "player:waiting": (data: { message: string }) => void;
  "player:over": (data: { rank: number; totalPlayers: number; score: number }) => void;

  // 공통
  "room:closed": () => void;
}

/** 클라이언트 → 서버 이벤트 */
export interface ClientToServerEvents {
  "host:create": (
    quiz: Quiz,
    cb: (res: { code: string; joinUrl: string }) => void,
  ) => void;
  "host:start": () => void;
  "host:reveal": () => void; // 현재 문제 즉시 마감·집계 (이후 5초 뒤 자동 다음)

  "player:join": (
    data: { code: string; nickname: string },
    cb: (res: { ok: boolean; error?: string; quizTitle?: string }) => void,
  ) => void;
  "player:answer": (
    data: { answer: Answer },
    cb: (res: { received: boolean; error?: string }) => void,
  ) => void;
}
