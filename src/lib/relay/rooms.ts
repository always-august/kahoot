import type { RelayQuiz } from "./types";

export interface RRPlayer {
  id: string; // = socket.id
  nickname: string;
  teamId: string | null;
  connected: boolean;
}

export interface RRAccepted {
  canonical: string;
  display: string;
  by: string; // 닉네임
  byId: string;
}

export interface RRTeam {
  id: string;
  name: string;
  accepted: RRAccepted[];
  canonSet: Set<string>;
  /** 직전 정답 인정자(연속금지 판정용) */
  lastById: string | null;
}

export interface RRPending {
  id: string;
  teamId: string;
  playerId: string;
  nickname: string;
  text: string;
  canonical: string;
}

export type RelayPhase = "lobby" | "round" | "result" | "over";

export interface RelayRoom {
  code: string;
  hostSocketId: string;
  quiz: RelayQuiz;
  players: Map<string, RRPlayer>;
  teams: RRTeam[];
  phase: RelayPhase;
  currentIndex: number;
  deadline: number;
  timer: NodeJS.Timeout | null;
  pending: Map<string, RRPending>;
  scores: Map<string, number>; // teamId -> score
  dict: Map<string, string>; // normalizedAlias -> canonical (라운드별)
  display: Map<string, string>; // canonical -> 대표표기
  /** 명단 자동배정: 정규화 이름 -> 후보들(동명이인이면 2개 이상) */
  rosterByName: Map<string, { teamId: string; email: string }[]>;
  /** 명단 자동배정: 정규화 이메일 -> teamId (동명이인 구분용 유일 키) */
  rosterByEmail: Map<string, string>;
  joinUrl: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

let pendingSeq = 0;

export class RelayRoomManager {
  private rooms = new Map<string, RelayRoom>();

  private genCode(): string {
    let code = "";
    do {
      code = "";
      for (let i = 0; i < 6; i++)
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId: string, quiz: RelayQuiz, joinBaseUrl: string): RelayRoom {
    const code = this.genCode();
    const teams: RRTeam[] = [];
    for (let i = 0; i < quiz.teamCount; i++) {
      teams.push({
        id: `t${i}`,
        name: quiz.teamNames[i]?.trim() || `${i + 1}팀`,
        accepted: [],
        canonSet: new Set(),
        lastById: null,
      });
    }
    // 명단(CSV) → 이름/이메일 색인. 팀 이름으로 매칭.
    const byTeamName = new Map(teams.map((t) => [normalize(t.name), t.id]));
    const rosterByName = new Map<string, { teamId: string; email: string }[]>();
    const rosterByEmail = new Map<string, string>();
    for (const entry of quiz.roster ?? []) {
      const teamId = byTeamName.get(normalize(entry.team ?? ""));
      const nameKey = normalize(entry.name ?? "");
      const emailKey = normalize(entry.email ?? "");
      if (!teamId || !nameKey) continue;
      const list = rosterByName.get(nameKey) ?? [];
      list.push({ teamId, email: emailKey });
      rosterByName.set(nameKey, list);
      if (emailKey) rosterByEmail.set(emailKey, teamId);
    }

    const room: RelayRoom = {
      code,
      hostSocketId,
      quiz,
      players: new Map(),
      teams,
      rosterByName,
      rosterByEmail,
      phase: "lobby",
      currentIndex: -1,
      deadline: 0,
      timer: null,
      pending: new Map(),
      scores: new Map(teams.map((t) => [t.id, 0])),
      dict: new Map(),
      display: new Map(),
      joinUrl: `${joinBaseUrl}/relay/play?room=${code}`,
    };
    this.rooms.set(code, room);
    return room;
  }

  getByCode(code: string) {
    return this.rooms.get(code.toUpperCase().trim());
  }
  getByHost(socketId: string) {
    for (const r of this.rooms.values()) if (r.hostSocketId === socketId) return r;
    return undefined;
  }
  getByPlayer(socketId: string) {
    for (const r of this.rooms.values()) if (r.players.has(socketId)) return r;
    return undefined;
  }

  /**
   * 명단에서 소속 팀을 특정한다.
   * - 이메일이 오면 이메일(유일 키) 우선
   * - 이름이 명단에 하나뿐이면 그것으로 배정
   * - 동명이인이면 ambiguous → 이메일을 더 받아야 함
   */
  resolveRoster(
    room: RelayRoom,
    nickname: string,
    email?: string,
  ): { status: "assigned" | "ambiguous" | "none"; teamId?: string } {
    const emailKey = normalize(email ?? "");
    if (emailKey) {
      const teamId = room.rosterByEmail.get(emailKey);
      if (teamId) return { status: "assigned", teamId };
    }
    const matches = room.rosterByName.get(normalize(nickname)) ?? [];
    if (matches.length === 1) return { status: "assigned", teamId: matches[0].teamId };
    if (matches.length > 1) return { status: "ambiguous" };
    return { status: "none" };
  }

  /**
   * 팀 번호 입장 시, 입력한 팀이 명단과 일치하는지 검증한다.
   * - 명단이 없으면 검증 생략(사전배정 번호를 신뢰)
   * - 명단에 없는 이름이면 거부
   * - 이름이 있으나 팀이 다르면 거부(단일 후보면 올바른 팀명을 알려줌)
   */
  verifyRosterTeam(
    room: RelayRoom,
    nickname: string,
    teamId: string,
  ): { ok: boolean; error?: string } {
    if (room.rosterByName.size === 0) return { ok: true };
    const name = nickname.trim();
    const matches = room.rosterByName.get(normalize(name)) ?? [];
    if (matches.length === 0)
      return { ok: false, error: "명단에 없는 이름이에요. 이름과 팀 번호를 확인해주세요." };
    if (matches.some((m) => m.teamId === teamId)) return { ok: true };
    if (matches.length === 1) {
      const correct = room.teams.find((t) => t.id === matches[0].teamId);
      return {
        ok: false,
        error: `명단상 ${name}님은 ${correct?.name ?? "다른 팀"}이에요. 팀 번호를 확인해주세요.`,
      };
    }
    return { ok: false, error: "이름과 팀 번호가 명단과 일치하지 않아요." };
  }

  addPlayer(
    code: string,
    nickname: string,
    socketId: string,
    assignedTeamId: string | null = null,
  ) {
    const room = this.getByCode(code);
    if (!room) return { ok: false as const, error: "존재하지 않는 방 코드예요." };
    if (room.phase !== "lobby")
      return { ok: false as const, error: "이미 시작된 게임이에요." };
    let name = nickname.trim();
    if (name.length < 1 || name.length > 16)
      return { ok: false as const, error: "닉네임은 1~16자로 입력해주세요." };

    const taken = (n: string) =>
      [...room.players.values()].some((p) => p.nickname.toLowerCase() === n.toLowerCase());

    if (taken(name)) {
      // 명단으로 확인된 사람은 동명이인이어도 막지 않고 표시용 이름만 구분해 준다
      if (assignedTeamId) {
        let i = 2;
        while (taken(`${name} ${i}`) && i < 50) i += 1;
        name = `${name} ${i}`;
      } else {
        return { ok: false as const, error: "이미 사용 중인 닉네임이에요." };
      }
    }

    room.players.set(socketId, {
      id: socketId,
      nickname: name,
      teamId: assignedTeamId,
      connected: true,
    });
    return { ok: true as const, room, assignedTeamId, nickname: name };
  }

  teamMemberCount(room: RelayRoom, teamId: string) {
    return [...room.players.values()].filter((p) => p.teamId === teamId).length;
  }

  teamsLobby(room: RelayRoom) {
    return room.teams.map((t) => ({
      id: t.id,
      name: t.name,
      members: [...room.players.values()]
        .filter((p) => p.teamId === t.id)
        .map((p) => p.nickname),
    }));
  }

  newPendingId() {
    pendingSeq += 1;
    return `p${pendingSeq}`;
  }

  removeRoom(code: string) {
    const room = this.rooms.get(code);
    if (room?.timer) clearTimeout(room.timer);
    this.rooms.delete(code);
  }
}
