import type { Server as IOServer, Socket } from "socket.io";
import { RoomManager, type Room } from "../game/rooms";
import { correctText, scoreAnswer } from "../game/scoring";
import type { PublicQuestion, Question } from "../game/types";
import { getJoinBaseUrl } from "../net";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./events";

type IO = IOServer<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** 정답 공개 후 다음 문제까지 대기 시간(ms) */
const REVEAL_HOLD_MS = Number(process.env.REVEAL_HOLD_MS ?? 5000);

const manager = new RoomManager();

function toPublicQuestion(
  q: Question,
  index: number,
  total: number,
  deadline: number,
): PublicQuestion {
  const base: PublicQuestion = {
    index,
    total,
    type: q.type,
    text: q.text,
    timeLimit: q.timeLimit,
    deadline,
    image: q.image,
  };
  if (q.type === "choice") {
    base.options = q.options;
    base.multiSelect = q.multiSelect;
  }
  if (q.type === "slider") {
    base.min = q.min;
    base.max = q.max;
    base.step = q.step;
  }
  return base;
}

function connectedPlayers(room: Room) {
  return [...room.players.values()].filter((p) => p.connected);
}

function sendQuestion(io: IO, room: Room, index: number) {
  const q = room.quiz.questions[index];
  if (!q) return finishGame(io, room);

  if (room.revealTimer) clearTimeout(room.revealTimer);
  room.phase = "question";
  room.currentIndex = index;
  room.answers.clear();
  for (const p of room.players.values()) p.gained = 0;

  const now = Date.now();
  room.questionStartedAt = now;
  room.questionDeadline = now + q.timeLimit * 1000;

  const pub = toPublicQuestion(q, index, room.quiz.questions.length, room.questionDeadline);
  // 방장·참가자 모두 같은 방에 있음 — 방장은 이 이벤트로 타이밍/보기를 받고
  // 참가자는 답안 UI를 렌더한다.
  io.to(room.code).emit("player:question", pub);
  io.to(room.hostSocketId).emit("host:answered", {
    answeredCount: 0,
    totalPlayers: connectedPlayers(room).length,
  });

  // 제한시간 종료 시 자동 공개
  room.revealTimer = setTimeout(() => revealQuestion(io, room), q.timeLimit * 1000 + 300);
}

function revealQuestion(io: IO, room: Room) {
  if (room.phase !== "question") return; // 중복 공개 방지
  if (room.revealTimer) clearTimeout(room.revealTimer);
  room.revealTimer = null;
  room.phase = "reveal";

  const q = room.quiz.questions[room.currentIndex];
  const limitMs = q.timeLimit * 1000;

  // 각 참가자 채점 (남은 시간 비율 = (마감 - 제출시각) / 제한시간)
  for (const player of room.players.values()) {
    const entry = room.answers.get(player.id);
    let gained = 0;
    if (entry) {
      const remainingRatio = Math.max(0, room.questionDeadline - entry.at) / limitMs;
      gained = scoreAnswer(q, entry.answer, remainingRatio).points;
    }
    player.gained = gained;
    player.score += gained;
  }

  const leaderboard = manager.leaderboard(room);
  const rankOf = new Map(leaderboard.map((e, i) => [e.playerId, i + 1]));

  // 참가자 개인 결과 + 전체 순위표
  for (const player of room.players.values()) {
    const entry = room.answers.get(player.id);
    let correct = false;
    if (entry) {
      const remainingRatio = Math.max(0, room.questionDeadline - entry.at) / limitMs;
      correct = scoreAnswer(q, entry.answer, remainingRatio).correct;
    }
    io.to(player.id).emit("player:result", {
      correct,
      gained: player.gained,
      totalScore: player.score,
      rank: rankOf.get(player.id) ?? leaderboard.length,
      totalPlayers: room.players.size,
      correctText: correctText(q),
      explanation: q.explanation,
      leaderboard,
    });
  }

  // 방장 집계
  io.to(room.hostSocketId).emit("host:reveal", {
    index: room.currentIndex,
    correctText: correctText(q),
    explanation: q.explanation,
    answeredCount: room.answers.size,
    totalPlayers: connectedPlayers(room).length,
    leaderboard,
  });

  // 5초 뒤 자동으로 다음 문제 (마지막이면 종료)
  room.revealTimer = setTimeout(() => {
    if (room.currentIndex + 1 >= room.quiz.questions.length) {
      finishGame(io, room);
    } else {
      sendQuestion(io, room, room.currentIndex + 1);
    }
  }, REVEAL_HOLD_MS);
}

/**
 * 재접속한 참가자에게 현재 진행 상태를 되돌려준다.
 * 이게 없으면 복귀해도 빈 대기 화면에 머물러 다음 문제까지 아무것도 못 한다.
 */
function restoreState(io: IO, room: Room, socket: IOSocket, alreadyAnswered: boolean) {
  if (room.phase === "question") {
    const q = room.quiz.questions[room.currentIndex];
    if (!q) return;
    // 이미 답을 낸 상태면 문제를 다시 띄우지 않고 대기 화면으로 (중복 제출 시도 방지)
    if (alreadyAnswered) {
      socket.emit("player:waiting", { message: "답변 완료 — 다음 문제를 기다리는 중" });
      return;
    }
    socket.emit(
      "player:question",
      toPublicQuestion(q, room.currentIndex, room.quiz.questions.length, room.questionDeadline),
    );
    return;
  }
  if (room.phase === "reveal") {
    // 공개 화면은 곧 다음 문제로 넘어가므로 대기만 시킨다
    socket.emit("player:waiting", { message: "정답 공개 중 — 다음 문제를 기다리는 중" });
    return;
  }
  if (room.phase === "over") {
    const leaderboard = manager.leaderboard(room);
    const rank = leaderboard.findIndex((e) => e.playerId === socket.id) + 1;
    socket.emit("player:over", {
      rank: rank || leaderboard.length,
      totalPlayers: room.players.size,
      score: room.players.get(socket.id)?.score ?? 0,
    });
  }
}

function finishGame(io: IO, room: Room) {
  if (room.revealTimer) clearTimeout(room.revealTimer);
  room.revealTimer = null;
  room.phase = "over";
  const leaderboard = manager.leaderboard(room);
  const rankOf = new Map(leaderboard.map((e, i) => [e.playerId, i + 1]));
  io.to(room.hostSocketId).emit("host:over", { leaderboard });
  for (const player of room.players.values()) {
    io.to(player.id).emit("player:over", {
      rank: rankOf.get(player.id) ?? leaderboard.length,
      totalPlayers: room.players.size,
      score: player.score,
    });
  }
}

export function registerSocketHandlers(io: IO, port: number) {
  io.on("connection", (socket: IOSocket) => {
    // ── 방장 ──
    socket.on("host:create", (quiz, cb) => {
      if (!quiz?.questions?.length) {
        return cb({ code: "", joinUrl: "" });
      }
      const room = manager.createRoom(socket.id, quiz, getJoinBaseUrl(port));
      socket.join(room.code);
      cb({ code: room.code, joinUrl: room.joinUrl });
    });

    socket.on("host:start", () => {
      const room = manager.getByHost(socket.id);
      if (!room || room.phase !== "lobby") return;
      if (room.players.size === 0) return;
      sendQuestion(io, room, 0);
    });

    socket.on("host:reveal", () => {
      const room = manager.getByHost(socket.id);
      if (room) revealQuestion(io, room);
    });

    // ── 참가자 ──
    socket.on("player:join", (data, cb) => {
      const res = manager.addPlayer(data.code, data.nickname, socket.id, data.token);
      if (!res.ok || !res.room) return cb({ ok: false, error: res.error });
      const room = res.room;
      socket.join(room.code);
      io.to(room.hostSocketId).emit("host:lobby", {
        players: manager.lobbyList(room),
      });

      const alreadyAnswered = room.answers.has(socket.id);
      cb({
        ok: true,
        quizTitle: room.quiz.title,
        reconnected: res.reconnected,
        alreadyAnswered,
        nickname: res.player?.nickname,
      });

      // 진행 중에 복귀한 사람은 지금 화면 상태를 그대로 받아야 이어서 참여할 수 있다
      if (res.reconnected) restoreState(io, room, socket, alreadyAnswered);
    });

    socket.on("player:answer", (data, cb) => {
      const room = manager.getByPlayer(socket.id);
      if (!room || room.phase !== "question") {
        return cb({ received: false, error: "지금은 답을 받을 수 없어요." });
      }
      if (Date.now() > room.questionDeadline) {
        return cb({ received: false, error: "시간이 초과됐어요." });
      }
      if (room.answers.has(socket.id)) {
        return cb({ received: false, error: "이미 제출했어요." });
      }
      room.answers.set(socket.id, { answer: data.answer, at: Date.now() });
      cb({ received: true });

      io.to(room.hostSocketId).emit("host:answered", {
        answeredCount: room.answers.size,
        totalPlayers: connectedPlayers(room).length,
      });
    });

    // ── 연결 종료 ──
    socket.on("disconnect", () => {
      const hosted = manager.getByHost(socket.id);
      if (hosted) {
        io.to(hosted.code).emit("room:closed");
        manager.removeRoom(hosted.code);
        return;
      }
      const room = manager.getByPlayer(socket.id);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player) return;
      if (room.phase === "lobby") {
        room.players.delete(socket.id);
      } else {
        player.connected = false; // 점수는 리더보드에 유지
      }
      io.to(room.hostSocketId).emit("host:lobby", {
        players: manager.lobbyList(room),
      });
    });
  });
}
