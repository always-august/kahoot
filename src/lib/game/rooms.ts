import type { Answer, Quiz } from "./types";

export interface RoomPlayer {
  /** = socket.id */
  id: string;
  nickname: string;
  score: number;
  /** 직전 문제 획득 점수 */
  gained: number;
  connected: boolean;
}

export type RoomPhase = "lobby" | "question" | "reveal" | "over";

export interface Room {
  code: string;
  hostSocketId: string;
  quiz: Quiz;
  players: Map<string, RoomPlayer>;
  phase: RoomPhase;
  /** 진행 중 문제 인덱스 (-1 = 시작 전) */
  currentIndex: number;
  questionStartedAt: number;
  questionDeadline: number;
  /** 현재 문제 응답: playerId → { answer, at } */
  answers: Map<string, { answer: Answer; at: number }>;
  revealTimer: NodeJS.Timeout | null;
  joinUrl: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0,O,1,I 제외
const CODE_LEN = 6;

/**
 * 방 목록을 관리하는 인메모리 저장소. (이벤트성 게임이라 DB 불필요 — 서버 재시작 시 초기화)
 */
export class RoomManager {
  private rooms = new Map<string, Room>();

  private genCode(): string {
    let code = "";
    do {
      code = "";
      for (let i = 0; i < CODE_LEN; i++) {
        // Math.random 은 이벤트 코드 용도로 충분
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId: string, quiz: Quiz, joinBaseUrl: string): Room {
    const code = this.genCode();
    const room: Room = {
      code,
      hostSocketId,
      quiz,
      players: new Map(),
      phase: "lobby",
      currentIndex: -1,
      questionStartedAt: 0,
      questionDeadline: 0,
      answers: new Map(),
      revealTimer: null,
      joinUrl: `${joinBaseUrl}/quiz/play?room=${code}`,
    };
    this.rooms.set(code, room);
    return room;
  }

  getByCode(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase().trim());
  }

  getByHost(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.hostSocketId === socketId) return room;
    }
    return undefined;
  }

  getByPlayer(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return undefined;
  }

  /** 닉네임 중복 검증 후 참가자 추가 */
  addPlayer(
    code: string,
    nickname: string,
    socketId: string,
  ): { ok: boolean; error?: string; room?: Room } {
    const room = this.getByCode(code);
    if (!room) return { ok: false, error: "존재하지 않는 방 코드예요." };
    if (room.phase !== "lobby") {
      return { ok: false, error: "이미 시작된 게임이에요." };
    }
    const name = nickname.trim();
    if (name.length < 1 || name.length > 16) {
      return { ok: false, error: "닉네임은 1~16자로 입력해주세요." };
    }
    const taken = [...room.players.values()].some(
      (p) => p.nickname.toLowerCase() === name.toLowerCase(),
    );
    if (taken) return { ok: false, error: "이미 사용 중인 닉네임이에요." };

    room.players.set(socketId, {
      id: socketId,
      nickname: name,
      score: 0,
      gained: 0,
      connected: true,
    });
    return { ok: true, room };
  }

  removeRoom(code: string) {
    const room = this.rooms.get(code);
    if (room?.revealTimer) clearTimeout(room.revealTimer);
    this.rooms.delete(code);
  }

  lobbyList(room: Room) {
    return [...room.players.values()].map((p) => ({
      id: p.id,
      nickname: p.nickname,
    }));
  }

  leaderboard(room: Room) {
    return [...room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        score: p.score,
        gained: p.gained,
      }));
  }
}
