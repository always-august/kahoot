import { createServer } from "http";
import next from "next";
import { Server as IOServer } from "socket.io";
import { registerSocketHandlers } from "./src/lib/socket/server";
import { getLanIp, getPublicBase } from "./src/lib/net";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./src/lib/socket/events";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: "*" },
  });

  registerSocketHandlers(io, port);

  server.listen(port, () => {
    const lan = getLanIp();
    // eslint-disable-next-line no-console
    console.log(`\n  게임 플랫폼 실행 중`);
    // eslint-disable-next-line no-console
    console.log(`  • 로컬:  http://localhost:${port}`);
    if (lan) {
      // eslint-disable-next-line no-console
      console.log(`  • 같은 와이파이(폰):  http://${lan}:${port}`);
    }
    const pub = getPublicBase();
    if (pub) {
      // eslint-disable-next-line no-console
      console.log(`  • 공개 URL:  ${pub}`);
    }
    // eslint-disable-next-line no-console
    console.log("");
  });
});
