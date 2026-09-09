import { generateRoomCode } from "../roomCode";
import { QA_MAX_LEN, type QaQuestion } from "./types";

/** 서버 내부 표현 — votedBy 는 밖으로 내보내지 않는다(익명 보장) */
interface QaEntry extends QaQuestion {
  /** 중복 투표 방지용. 참가자 브라우저 토큰 집합 */
  votedBy: Set<string>;
  /** 작성자 토큰 — 본인 질문 표시/삭제 판별용. 다른 참가자에게는 노출하지 않는다 */
  authorToken: string;
}

export interface QaRoom {
  code: string;
  hostSocketId: string;
  title: string;
  questions: Map<string, QaEntry>;
  joinUrl: string;
}

let seq = 0;

export class QaRoomManager {
  private rooms = new Map<string, QaRoom>();

  createRoom(hostSocketId: string, title: string, joinBaseUrl: string): QaRoom {
    const code = generateRoomCode((c) => this.rooms.has(c));
    const room: QaRoom = {
      code,
      hostSocketId,
      title: title.trim() || "익명 Q&A",
      questions: new Map(),
      joinUrl: `${joinBaseUrl}/qa/play?room=${code}`,
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

  removeRoom(code: string) {
    this.rooms.delete(code);
  }

  /** 방장이 재접속하면 새 소켓으로 방을 이어받는다 */
  rebindHost(room: QaRoom, socketId: string) {
    room.hostSocketId = socketId;
  }

  addQuestion(room: QaRoom, text: string, authorToken: string): QaQuestion | null {
    const t = text.trim().slice(0, QA_MAX_LEN);
    if (!t) return null;
    seq += 1;
    const entry: QaEntry = {
      id: `q${seq}`,
      text: t,
      votes: 0,
      createdAt: Date.now(),
      resolved: false,
      votedBy: new Set(),
      authorToken,
    };
    room.questions.set(entry.id, entry);
    return this.toPublic(entry);
  }

  /** 투표 토글. 반환값은 변경 후 상태 */
  toggleVote(room: QaRoom, id: string, token: string): boolean {
    const q = room.questions.get(id);
    if (!q) return false;
    if (q.votedBy.has(token)) q.votedBy.delete(token);
    else q.votedBy.add(token);
    q.votes = q.votedBy.size;
    return true;
  }

  setResolved(room: QaRoom, id: string, resolved: boolean): boolean {
    const q = room.questions.get(id);
    if (!q) return false;
    q.resolved = resolved;
    return true;
  }

  remove(room: QaRoom, id: string): boolean {
    return room.questions.delete(id);
  }

  /** 특정 참가자가 투표한 질문 id 목록 */
  votesOf(room: QaRoom, token: string): string[] {
    return [...room.questions.values()].filter((q) => q.votedBy.has(token)).map((q) => q.id);
  }

  /** 특정 참가자가 작성한 질문 id 목록 */
  authoredBy(room: QaRoom, token: string): string[] {
    return [...room.questions.values()].filter((q) => q.authorToken === token).map((q) => q.id);
  }

  private toPublic(q: QaEntry): QaQuestion {
    return { id: q.id, text: q.text, votes: q.votes, createdAt: q.createdAt, resolved: q.resolved };
  }

  list(room: QaRoom): QaQuestion[] {
    return [...room.questions.values()].map((q) => this.toPublic(q));
  }
}
