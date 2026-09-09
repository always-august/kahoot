import { generateRoomCode } from "../roomCode";
import type { Answer, Quiz } from "./types";

export interface RoomPlayer {
  /** = socket.id — 재접속하면 새 소켓 id 로 갱신된다 */
  id: string;
  /**
   * 브라우저에 저장되는 안정적 식별자.
   * 소켓 id 는 재접속마다 바뀌므로, 끊긴 참가자를 되찾는 기준은 이 토큰이다.
   */
  token: string;
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
  /** 정답 공개 후 자동으로 다음 문제로 넘어갈지 (진행자 해설 시간을 위해 끌 수 있음) */
  autoAdvance: boolean;
  /** 정답 공개 화면에서 진행이 멈춰 있는지 */
  paused: boolean;
  joinUrl: string;
}

/**
 * 방 목록을 관리하는 인메모리 저장소. (이벤트성 게임이라 DB 불필요 — 서버 재시작 시 초기화)
 */
export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(hostSocketId: string, quiz: Quiz, joinBaseUrl: string): Room {
    const code = generateRoomCode((c) => this.rooms.has(c));
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
      autoAdvance: true,
      paused: false,
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

  /**
   * 끊겼던 참가자를 새 소켓으로 되살린다.
   * players/answers 는 소켓 id 로 키를 잡으므로 둘 다 새 id 로 옮겨야 한다.
   */
  private rekeyPlayer(room: Room, player: RoomPlayer, newSocketId: string) {
    const oldId = player.id;
    if (oldId === newSocketId) {
      player.connected = true;
      return;
    }
    room.players.delete(oldId);
    // 끊기기 전에 제출해 둔 답안도 함께 이관 (중복 제출·점수 누락 방지)
    const answer = room.answers.get(oldId);
    if (answer) {
      room.answers.delete(oldId);
      room.answers.set(newSocketId, answer);
    }
    player.id = newSocketId;
    player.connected = true;
    room.players.set(newSocketId, player);
  }

  /**
   * 참가자 추가. 토큰이 기존 참가자와 일치하면 **게임 진행 중이어도 복귀**시킨다.
   * (폰 잠금·앱 전환·네트워크 끊김으로 이탈한 사람이 점수를 유지한 채 돌아올 수 있게)
   */
  addPlayer(
    code: string,
    nickname: string,
    socketId: string,
    token?: string,
  ): {
    ok: boolean;
    error?: string;
    room?: Room;
    reconnected?: boolean;
    player?: RoomPlayer;
  } {
    const room = this.getByCode(code);
    if (!room) return { ok: false, error: "존재하지 않는 방 코드예요." };

    // 1) 재접속 — 토큰이 맞으면 phase 와 무관하게 복귀
    if (token) {
      const existing = [...room.players.values()].find((p) => p.token === token);
      if (existing) {
        this.rekeyPlayer(room, existing, socketId);
        return { ok: true, room, reconnected: true, player: existing };
      }
    }

    // 2) 신규 입장은 로비에서만
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

    const player: RoomPlayer = {
      id: socketId,
      token: token || socketId, // 토큰을 안 보낸 구버전 클라이언트도 동작하게
      nickname: name,
      score: 0,
      gained: 0,
      connected: true,
    };
    room.players.set(socketId, player);
    return { ok: true, room, player };
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
