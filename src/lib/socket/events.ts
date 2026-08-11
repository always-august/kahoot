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
    /** token: 브라우저에 저장되는 안정적 식별자 — 소켓이 끊겨도 이걸로 본인을 되찾는다 */
    data: { code: string; nickname: string; token?: string },
    cb: (res: {
      ok: boolean;
      error?: string;
      quizTitle?: string;
      /** 기존 참가자로 복귀한 경우 */
      reconnected?: boolean;
      /** 복귀 시점에 이미 이번 문제 답을 낸 상태인지 */
      alreadyAnswered?: boolean;
      /** 서버가 기억하고 있던 닉네임(복귀 시) */
      nickname?: string;
    }) => void,
  ) => void;
  "player:answer": (
    data: { answer: Answer },
    cb: (res: { received: boolean; error?: string }) => void,
  ) => void;
}
