// 익명 Q&A(슬라이도 형식) 도메인 타입 — 클라이언트/서버 공유

/** 참가자·방장 화면에 내려가는 질문 (작성자 정보는 담지 않는다 — 익명 보장) */
export interface QaQuestion {
  id: string;
  text: string;
  votes: number;
  createdAt: number;
  /** 방장이 "해결"로 처리한 질문 */
  resolved: boolean;
}

export type QaSort = "popular" | "recent";

/** 정렬 적용 — 인기순은 동점일 때 최신 우선 */
export function sortQuestions(list: QaQuestion[], sort: QaSort): QaQuestion[] {
  const copy = [...list];
  if (sort === "recent") return copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy.sort((a, b) => b.votes - a.votes || b.createdAt - a.createdAt);
}

export const QA_MAX_LEN = 300;
