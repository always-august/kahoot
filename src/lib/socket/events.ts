import type {
  Answer,
  HostReveal,
  LeaderboardEntry,
  PersonalResult,
  PublicQuestion,
  Quiz,
} from "../game/types";
import type { QaQuestion } from "../qa/types";

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
  // 방장 대상
  "host:lobby": (data: { players: { id: string; nickname: string }[] }) => void;
  "host:answered": (data: { answeredCount: number; totalPlayers: number }) => void;
  "host:reveal": (data: HostReveal) => void;
  "host:over": (data: { leaderboard: LeaderboardEntry[] }) => void;
  /** 정답 공개 화면의 진행 제어 상태 */
  "host:revealControl": (data: {
    paused: boolean;
    autoAdvance: boolean;
    /** 자동 진행 예정 시각(epoch ms). 정지 중이면 null */
    resumeAt: number | null;
  }) => void;

  // 참가자 대상
  "player:question": (data: PublicQuestion) => void;
  "player:result": (data: PersonalResult) => void;
  "player:waiting": (data: { message: string }) => void;
  "player:over": (data: { rank: number; totalPlayers: number; score: number }) => void;

  // ── 익명 Q&A ──
  /** 질문 목록 전체 (방장·참가자 공통) */
  "qa:list": (data: { questions: QaQuestion[] }) => void;
  /** 이 소켓이 투표했거나 작성한 질문 — 본인에게만 내려간다 */
  "qa:mine": (data: { voted: string[]; authored: string[] }) => void;

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
  "host:pause": () => void; // 정답 공개 화면에서 자동 진행 멈춤 (해설 시간)
  "host:resume": () => void; // 다시 자동 진행 카운트다운 시작
  "host:next": () => void; // 지금 바로 다음 문제로
  "host:autoAdvance": (data: { enabled: boolean }) => void;

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

  // ── 익명 Q&A ──
  "qa:create": (
    data: { title: string },
    cb: (res: { code: string; joinUrl: string }) => void,
  ) => void;
  /** 방장이 새로고침·재접속했을 때 기존 방을 이어받는다 */
  "qa:resume": (
    data: { code: string },
    cb: (res: { ok: boolean; error?: string; title?: string }) => void,
  ) => void;
  /** 참가자 입장 — 익명이라 닉네임은 받지 않는다. token 은 중복투표·본인글 판별용 */
  "qa:join": (
    data: { code: string; token: string },
    cb: (res: { ok: boolean; error?: string; title?: string }) => void,
  ) => void;
  "qa:ask": (
    data: { text: string; token: string },
    cb: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  "qa:vote": (data: { id: string; token: string }) => void;
  /** 방장 전용 — 해결 처리(토글) */
  "qa:resolve": (data: { id: string; resolved: boolean }) => void;
  /** 방장 전용 — 삭제(부적절한 질문 정리) */
  "qa:delete": (data: { id: string }) => void;
}
