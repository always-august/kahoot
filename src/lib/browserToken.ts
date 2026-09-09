"use client";

/**
 * 브라우저에 남는 익명 식별자.
 * 소켓 id 는 재접속마다 바뀌므로, 중복 투표 방지·본인 글 판별처럼
 * "같은 사람인가"를 알아야 할 때 이 값을 쓴다. 서버에는 토큰만 가고 신원은 담기지 않는다.
 * (http LAN 접속은 보안 컨텍스트가 아니라 randomUUID 가 없을 수 있어 폴백을 둔다)
 */
export function browserToken(key: string): string {
  const gen = () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  try {
    let t = localStorage.getItem(key);
    if (!t) {
      t = gen();
      localStorage.setItem(key, t);
    }
    return t;
  } catch {
    return gen();
  }
}
