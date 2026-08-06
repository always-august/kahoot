import os from "os";

/** 로컬 네트워크(LAN) IPv4 주소를 찾는다. 없으면 null. */
export function getLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  const candidates: string[] = [];
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) {
        candidates.push(info.address);
      }
    }
  }
  // 사설망 대역(192.168.x / 10.x / 172.16~31.x)을 우선한다
  const priv = candidates.find(
    (ip) =>
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip),
  );
  return priv ?? candidates[0] ?? null;
}

/**
 * 참가자 접속 기준 URL을 정한다.
 * 우선순위: PUBLIC_URL(수동 지정) → RENDER_EXTERNAL_URL(Render 자동 주입) → LAN IP:port(로컬).
 * Render 에 올리면 URL 을 따로 설정하지 않아도 참가 링크/QR 이 공개 주소로 생성된다.
 */
export function getPublicBase(): string | null {
  const pub = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL)?.replace(/\/$/, "");
  return pub || null;
}

export function getJoinBaseUrl(port: number): string {
  const pub = getPublicBase();
  if (pub) return pub;
  const lan = getLanIp();
  return lan ? `http://${lan}:${port}` : `http://localhost:${port}`;
}
