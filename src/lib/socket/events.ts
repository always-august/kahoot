import type {
  Answer,
  HostReveal,
  LeaderboardEntry,
  PersonalResult,
  PublicQuestion,
  Quiz,
} from "../game/types";
import type {
  RelayAccepted,
  RelayHostTeam,
  RelayPendingItem,
  RelayProgressTeam,
  RelayPublicRound,
  RelayQuiz,
  RelayRoundOver,
  RelayStanding,
  RelayTeamLobby,
  RelaySubmitStatus,
} from "../relay/types";

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

  // ── 키워드 릴레이 ──
  "relay:teams": (data: { teams: RelayTeamLobby[] }) => void;
  "relay:round": (data: RelayPublicRound) => void;
  "relay:teamList": (data: {
    teamId: string;
    accepted: RelayAccepted[];
    target: number;
  }) => void;
  "relay:progress": (data: { teams: RelayProgressTeam[] }) => void;
  "relay:host": (data: {
    teams: RelayHostTeam[];
    pending: RelayPendingItem[];
  }) => void;
  "relay:judged": (data: { text: string; accepted: boolean }) => void;
  "relay:roundOver": (data: RelayRoundOver) => void;
  "relay:over": (data: { standings: RelayStanding[] }) => void;
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

  // ── 키워드 릴레이 ──
  "relay:create": (
    quiz: RelayQuiz,
    cb: (res: { code: string; joinUrl: string }) => void,
  ) => void;
  "relay:join": (
    data: { code: string; nickname: string; email?: string; teamNo?: number },
    cb: (res: {
      ok: boolean;
      error?: string;
      title?: string;
      teams?: { id: string; name: string }[];
      /** 명단(CSV)으로 자동 배정된 경우 */
      assignedTeamId?: string;
      assignedTeamName?: string;
      /** 동명이인이라 이메일로 확인이 필요함 */
      needsEmail?: boolean;
      /** 중복 이름이라 표시명이 조정된 경우 최종 닉네임 */
      nickname?: string;
    }) => void,
  ) => void;
  "relay:pickTeam": (
    data: { teamId: string },
    cb: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  "relay:autobalance": () => void;
  "relay:start": () => void;
  "relay:next": () => void;
  "relay:submit": (
    data: { text: string },
    cb: (res: { status: RelaySubmitStatus; reason?: string }) => void,
  ) => void;
  "relay:approve": (data: { pendingId: string }) => void;
  "relay:reject": (data: { pendingId: string }) => void;
}
