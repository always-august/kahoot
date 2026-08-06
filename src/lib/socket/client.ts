"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";

// 클라이언트에서는 listen=Server→Client, emit=Client→Server 로 타입이 뒤바뀐다
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** 같은 오리진의 Socket.io 서버에 연결된 싱글턴 소켓 */
export function getSocket(): GameSocket {
  if (!socket) {
    socket = io({ autoConnect: true, transports: ["websocket", "polling"] });
  }
  return socket;
}
