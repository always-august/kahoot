import type { Server as IOServer, Socket } from "socket.io";
import { QaRoomManager, type QaRoom } from "../qa/rooms";
import { getJoinBaseUrl } from "../net";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";

type IO = IOServer<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const manager = new QaRoomManager();

/** 질문 목록을 방 전체에 브로드캐스트 */
function emitList(io: IO, room: QaRoom) {
  io.to(room.code).emit("qa:list", { questions: manager.list(room) });
}

/** 본인 투표·작성 내역은 해당 소켓에만 (익명 유지) */
function emitMine(socket: IOSocket, room: QaRoom, token: string) {
  socket.emit("qa:mine", {
    voted: manager.votesOf(room, token),
    authored: manager.authoredBy(room, token),
  });
}

export function registerQaHandlers(io: IO, port: number) {
  io.on("connection", (socket: IOSocket) => {
    // ── 방장 ──
    socket.on("qa:create", ({ title }, cb) => {
      const room = manager.createRoom(socket.id, title, getJoinBaseUrl(port));
      socket.join(room.code);
      cb({ code: room.code, joinUrl: room.joinUrl });
      emitList(io, room);
    });

    /**
     * 방장 재접속 — 새로고침하거나 노트북이 절전에서 깨어나도 방을 잃지 않는다.
     * (방장 연결이 끊겨도 방을 지우지 않고 남겨두기 때문에 가능)
     */
    socket.on("qa:resume", ({ code }, cb) => {
      const room = manager.getByCode(code);
      if (!room) return cb({ ok: false, error: "방을 찾을 수 없어요." });
      manager.rebindHost(room, socket.id);
      socket.join(room.code);
      cb({ ok: true, title: room.title });
      socket.emit("qa:list", { questions: manager.list(room) });
    });

    socket.on("qa:resolve", ({ id, resolved }) => {
      const room = manager.getByHost(socket.id);
      if (!room) return;
      if (manager.setResolved(room, id, resolved)) emitList(io, room);
    });

    socket.on("qa:delete", ({ id }) => {
      const room = manager.getByHost(socket.id);
      if (!room) return;
      if (manager.remove(room, id)) emitList(io, room);
    });

    // ── 참가자 ──
    socket.on("qa:join", ({ code, token }, cb) => {
      const room = manager.getByCode(code);
      if (!room) return cb({ ok: false, error: "존재하지 않는 방 코드예요." });
      socket.join(room.code);
      cb({ ok: true, title: room.title });
      socket.emit("qa:list", { questions: manager.list(room) });
      emitMine(socket, room, token);
    });

    socket.on("qa:ask", ({ text, token }, cb) => {
      const room = manager.getByCode(roomCodeOf(socket) ?? "");
      if (!room) return cb({ ok: false, error: "방에 참여하지 않았어요." });
      const q = manager.addQuestion(room, text, token);
      if (!q) return cb({ ok: false, error: "질문을 입력해주세요." });
      cb({ ok: true });
      emitList(io, room);
      emitMine(socket, room, token);
    });

    socket.on("qa:vote", ({ id, token }) => {
      const room = manager.getByCode(roomCodeOf(socket) ?? "");
      if (!room) return;
      if (manager.toggleVote(room, id, token)) {
        emitList(io, room);
        emitMine(socket, room, token);
      }
    });

    // 방장이 끊겨도 방은 유지한다 — 발표 중 새로고침·절전으로 질문이 날아가지 않도록.
    // 방은 서버가 살아 있는 동안 남고, 재시작 시 초기화된다.
  });
}

/** 이 소켓이 들어가 있는 방 코드 (socket.io 는 자기 자신 id 도 방으로 갖는다) */
function roomCodeOf(socket: IOSocket): string | undefined {
  for (const r of socket.rooms) if (r !== socket.id) return r;
  return undefined;
}
