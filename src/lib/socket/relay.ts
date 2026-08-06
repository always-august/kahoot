import type { Server as IOServer, Socket } from "socket.io";
import { RelayRoomManager, normalize, type RelayRoom, type RRPlayer, type RRTeam } from "../relay/rooms";
import { getJoinBaseUrl } from "../net";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";

type IO = IOServer<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const manager = new RelayRoomManager();
const sub = (code: string, teamId: string) => `${code}::${teamId}`;
const targetOf = (room: RelayRoom) =>
  room.currentIndex >= 0 ? room.quiz.rounds[room.currentIndex].target : 0;

/**
 * 브로드캐스트 합치기(throttle).
 * 정답 1건마다 전원에게 쏘면 100명 규모에서 참가자 폰이 초당 수백 번 리렌더된다.
 * 최신 상태는 항상 도착하도록 leading + trailing 으로 최대 1회/200ms 로 합친다.
 */
const THROTTLE_MS = 200;
type Timers = { progressPending?: boolean; progressLast?: number; hostPending?: boolean; hostLast?: number };
const timers = new Map<string, Timers>();
const timersOf = (room: RelayRoom) => {
  let t = timers.get(room.code);
  if (!t) {
    t = {};
    timers.set(room.code, t);
  }
  return t;
};
export function clearRelayTimers(code: string) {
  timers.delete(code);
}

function scheduleProgress(io: IO, room: RelayRoom) {
  const t = timersOf(room);
  if (t.progressPending) return;
  t.progressPending = true;
  const waitMs = Math.max(0, THROTTLE_MS - (Date.now() - (t.progressLast ?? 0)));
  setTimeout(() => {
    t.progressPending = false;
    t.progressLast = Date.now();
    emitProgress(io, room);
  }, waitMs);
}

function scheduleHost(io: IO, room: RelayRoom) {
  const t = timersOf(room);
  if (t.hostPending) return;
  t.hostPending = true;
  const waitMs = Math.max(0, THROTTLE_MS - (Date.now() - (t.hostLast ?? 0)));
  setTimeout(() => {
    t.hostPending = false;
    t.hostLast = Date.now();
    emitHost(io, room);
  }, waitMs);
}

function emitProgress(io: IO, room: RelayRoom) {
  const target = targetOf(room);
  io.to(room.code).emit("relay:progress", {
    teams: room.teams.map((t) => ({
      id: t.id,
      name: t.name,
      count: t.accepted.length,
      target,
    })),
  });
}

function emitHost(io: IO, room: RelayRoom) {
  io.to(room.hostSocketId).emit("relay:host", {
    teams: room.teams.map((t) => ({
      id: t.id,
      name: t.name,
      count: t.accepted.length,
      accepted: t.accepted.map((a) => ({ display: a.display, by: a.by })),
    })),
    pending: [...room.pending.values()].map((p) => ({
      id: p.id,
      teamId: p.teamId,
      teamName: room.teams.find((t) => t.id === p.teamId)?.name ?? "",
      nickname: p.nickname,
      text: p.text,
    })),
  });
}

function emitTeamList(io: IO, room: RelayRoom, team: RRTeam) {
  io.to(sub(room.code, team.id)).emit("relay:teamList", {
    teamId: team.id,
    accepted: team.accepted.map((a) => ({ display: a.display, by: a.by })),
    target: targetOf(room),
  });
}

function startRound(io: IO, room: RelayRoom, index: number) {
  const round = room.quiz.rounds[index];
  if (!round) return finish(io, room);
  if (room.timer) clearTimeout(room.timer);

  room.phase = "round";
  room.currentIndex = index;
  room.pending.clear();
  room.dict.clear();
  room.display.clear();
  for (const group of round.answers) {
    const canon = normalize(group[0] ?? "");
    if (!canon) continue;
    room.display.set(canon, group[0]);
    for (const alias of group) {
      const n = normalize(alias);
      if (n) room.dict.set(n, canon);
    }
  }
  for (const t of room.teams) {
    t.accepted = [];
    t.canonSet = new Set();
    t.lastById = null;
  }

  const now = Date.now();
  room.deadline = round.timeLimit > 0 ? now + round.timeLimit * 1000 : 0;

  io.to(room.code).emit("relay:round", {
    index,
    total: room.quiz.rounds.length,
    keyword: round.keyword,
    target: round.target,
    timeLimit: round.timeLimit,
    deadline: room.deadline,
  });
  for (const t of room.teams) emitTeamList(io, room, t);
  emitProgress(io, room);
  emitHost(io, room);

  if (round.timeLimit > 0) {
    room.timer = setTimeout(() => endRound(io, room, null), round.timeLimit * 1000 + 300);
  }
}

function accept(io: IO, room: RelayRoom, team: RRTeam, canonical: string, display: string, player: RRPlayer) {
  team.accepted.push({ canonical, display, by: player.nickname, byId: player.id });
  team.canonSet.add(canonical);
  team.lastById = player.id;
  emitTeamList(io, room, team); // 팀 목록은 중복 방지에 직결 → 즉시
  scheduleProgress(io, room); // 상대 팀 점수판 등은 합쳐서
  scheduleHost(io, room);
  if (team.accepted.length >= targetOf(room)) endRound(io, room, team);
}

function endRound(io: IO, room: RelayRoom, winner: RRTeam | null) {
  if (room.phase !== "round") return;
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
  room.phase = "result";

  let winnerTeam = winner;
  if (!winnerTeam) {
    const max = Math.max(...room.teams.map((t) => t.accepted.length));
    const tops = room.teams.filter((t) => t.accepted.length === max && max > 0);
    if (tops.length === 1) winnerTeam = tops[0];
    for (const t of tops) room.scores.set(t.id, (room.scores.get(t.id) ?? 0) + 1);
  } else {
    room.scores.set(winnerTeam.id, (room.scores.get(winnerTeam.id) ?? 0) + 1);
  }

  io.to(room.code).emit("relay:roundOver", {
    winnerTeamId: winnerTeam ? winnerTeam.id : null,
    winnerName: winnerTeam ? winnerTeam.name : null,
    counts: room.teams.map((t) => ({ name: t.name, count: t.accepted.length })),
    scores: room.teams.map((t) => ({ name: t.name, score: room.scores.get(t.id) ?? 0 })),
  });
}

function finish(io: IO, room: RelayRoom) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
  room.phase = "over";
  const standings = room.teams
    .map((t) => ({ name: t.name, score: room.scores.get(t.id) ?? 0 }))
    .sort((a, b) => b.score - a.score);
  io.to(room.code).emit("relay:over", { standings });
}

export function registerRelayHandlers(io: IO, port: number) {
  io.on("connection", (socket: IOSocket) => {
    socket.on("relay:create", (quiz, cb) => {
      if (!quiz?.rounds?.length || !quiz.teamCount) return cb({ code: "", joinUrl: "" });
      const room = manager.createRoom(socket.id, quiz, getJoinBaseUrl(port));
      socket.join(room.code);
      cb({ code: room.code, joinUrl: room.joinUrl });
    });

    socket.on("relay:join", (data, cb) => {
      const target = manager.getByCode(data.code);
      let preassigned: string | null = null;
      if (target && target.phase === "lobby" && data.teamNo != null) {
        // 사전 배정: 팀 번호(1-based)로 바로 배정 — 명단·이메일 확인 불필요
        const idx = data.teamNo - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= target.teams.length)
          return cb({ ok: false, error: `팀 번호는 1~${target.teams.length} 사이여야 해요.` });
        preassigned = target.teams[idx].id;
        // 명단이 올라와 있으면 이름과 팀 번호가 일치하는지 대조
        const v = manager.verifyRosterTeam(target, data.nickname, preassigned);
        if (!v.ok) return cb({ ok: false, error: v.error });
      } else if (target && target.phase === "lobby") {
        // 명단 대조 → 동명이인이면 이메일을 더 받는다(입장은 아직 시키지 않음)
        const r = manager.resolveRoster(target, data.nickname, data.email);
        if (r.status === "ambiguous")
          return cb({
            ok: false,
            needsEmail: true,
            error: "같은 이름이 여러 명이에요. 회사 이메일을 입력해주세요.",
          });
        if (r.status === "assigned") preassigned = r.teamId ?? null;
      }

      const res = manager.addPlayer(data.code, data.nickname, socket.id, preassigned);
      if (!res.ok || !res.room) return cb({ ok: false, error: res.error });
      const room = res.room;
      socket.join(room.code);
      // 명단(CSV)으로 자동 배정된 경우 팀 서브룸까지 바로 합류
      const assigned = res.assignedTeamId
        ? room.teams.find((t) => t.id === res.assignedTeamId)
        : undefined;
      if (assigned) socket.join(sub(room.code, assigned.id));
      io.to(room.code).emit("relay:teams", { teams: manager.teamsLobby(room) });
      cb({
        ok: true,
        title: room.quiz.title,
        teams: room.teams.map((t) => ({ id: t.id, name: t.name })),
        assignedTeamId: assigned?.id,
        assignedTeamName: assigned?.name,
        nickname: res.nickname,
      });
    });

    socket.on("relay:pickTeam", ({ teamId }, cb) => {
      const room = manager.getByPlayer(socket.id);
      if (!room) return cb({ ok: false, error: "방을 찾을 수 없어요." });
      if (room.phase !== "lobby") return cb({ ok: false, error: "이미 시작됐어요." });
      const team = room.teams.find((t) => t.id === teamId);
      if (!team) return cb({ ok: false, error: "없는 팀이에요." });
      const player = room.players.get(socket.id);
      if (!player) return cb({ ok: false });
      if (player.teamId) socket.leave(sub(room.code, player.teamId));
      player.teamId = teamId;
      socket.join(sub(room.code, teamId));
      io.to(room.code).emit("relay:teams", { teams: manager.teamsLobby(room) });
      cb({ ok: true });
    });

    socket.on("relay:autobalance", () => {
      const room = manager.getByHost(socket.id);
      if (!room || room.phase !== "lobby") return;
      [...room.players.values()].forEach((p, i) => {
        const teamId = room.teams[i % room.teams.length].id;
        const old = p.teamId;
        p.teamId = teamId;
        const s = io.sockets.sockets.get(p.id);
        if (s) {
          if (old) s.leave(sub(room.code, old));
          s.join(sub(room.code, teamId));
        }
      });
      io.to(room.code).emit("relay:teams", { teams: manager.teamsLobby(room) });
    });

    socket.on("relay:start", () => {
      const room = manager.getByHost(socket.id);
      if (!room || room.phase !== "lobby" || room.players.size === 0) return;
      // 미배정 참가자 자동 배정
      let i = 0;
      for (const p of room.players.values()) {
        if (!p.teamId) {
          const teamId = room.teams[i % room.teams.length].id;
          p.teamId = teamId;
          io.sockets.sockets.get(p.id)?.join(sub(room.code, teamId));
          i++;
        }
      }
      startRound(io, room, 0);
    });

    socket.on("relay:next", () => {
      const room = manager.getByHost(socket.id);
      if (!room || room.phase !== "result") return;
      if (room.currentIndex + 1 >= room.quiz.rounds.length) finish(io, room);
      else startRound(io, room, room.currentIndex + 1);
    });

    socket.on("relay:submit", (data, cb) => {
      const room = manager.getByPlayer(socket.id);
      if (!room || room.phase !== "round")
        return cb({ status: "error", reason: "지금은 제출할 수 없어요." });
      const player = room.players.get(socket.id);
      if (!player || !player.teamId)
        return cb({ status: "error", reason: "팀을 먼저 선택하세요." });
      const team = room.teams.find((t) => t.id === player.teamId);
      if (!team) return cb({ status: "error" });
      const text = data.text.trim();
      if (!text) return cb({ status: "error", reason: "답을 입력하세요." });

      const norm = normalize(text);
      const known = room.dict.get(norm);
      const canonical = known ?? norm;

      // 중복 먼저 (누구 차례든 이미 나온 답은 중복)
      if (team.canonSet.has(canonical))
        return cb({ status: "duplicate", reason: "이미 나온 답이에요." });
      for (const p of room.pending.values())
        if (p.teamId === team.id && p.canonical === canonical)
          return cb({ status: "duplicate", reason: "이미 제출되어 판정 중이에요." });

      // 연속금지 (새 정답을 연속으로 득점하지 못하게, 팀원 2명 이상일 때만)
      if (
        room.quiz.noConsecutive &&
        manager.teamMemberCount(room, team.id) >= 2 &&
        team.lastById === player.id
      ) {
        return cb({ status: "blocked", reason: "이어말하기 — 다른 팀원이 먼저 답해야 해요." });
      }

      if (known) {
        accept(io, room, team, canonical, room.display.get(canonical) ?? text, player);
        return cb({ status: "accepted" });
      }
      // 미매칭 → 어드민 판정 대기
      const id = manager.newPendingId();
      room.pending.set(id, {
        id,
        teamId: team.id,
        playerId: player.id,
        nickname: player.nickname,
        text,
        canonical,
      });
      scheduleHost(io, room);
      cb({ status: "pending", reason: "어드민 판정 대기 중" });
    });

    socket.on("relay:approve", ({ pendingId }) => {
      const room = manager.getByHost(socket.id);
      if (!room) return;
      const p = room.pending.get(pendingId);
      if (!p) return;
      room.pending.delete(pendingId);
      const team = room.teams.find((t) => t.id === p.teamId);
      if (!team) return scheduleHost(io, room);
      if (team.canonSet.has(p.canonical)) return scheduleHost(io, room);
      const player = room.players.get(p.playerId);
      // 학습: 이후 자동 인정
      room.dict.set(p.canonical, p.canonical);
      room.display.set(p.canonical, p.text);
      io.to(p.playerId).emit("relay:judged", { text: p.text, accepted: true });
      if (player) accept(io, room, team, p.canonical, p.text, player);
      else {
        team.accepted.push({ canonical: p.canonical, display: p.text, by: p.nickname, byId: p.playerId });
        team.canonSet.add(p.canonical);
        emitTeamList(io, room, team);
        scheduleProgress(io, room);
        scheduleHost(io, room);
        if (team.accepted.length >= targetOf(room)) endRound(io, room, team);
      }
    });

    socket.on("relay:reject", ({ pendingId }) => {
      const room = manager.getByHost(socket.id);
      if (!room) return;
      const p = room.pending.get(pendingId);
      if (!p) return;
      room.pending.delete(pendingId);
      io.to(p.playerId).emit("relay:judged", { text: p.text, accepted: false });
      scheduleHost(io, room);
    });

    socket.on("disconnect", () => {
      const hosted = manager.getByHost(socket.id);
      if (hosted) {
        io.to(hosted.code).emit("room:closed");
        clearRelayTimers(hosted.code);
        manager.removeRoom(hosted.code);
        return;
      }
      const room = manager.getByPlayer(socket.id);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player) return;
      if (room.phase === "lobby") room.players.delete(socket.id);
      else player.connected = false;
      io.to(room.code).emit("relay:teams", { teams: manager.teamsLobby(room) });
    });
  });
}
