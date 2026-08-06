// 키워드 릴레이(순발력) 도메인 타입 — 클라이언트/서버 공유

export interface RelayRound {
  id: string;
  keyword: string;
  target: number; // 목표 개수 N
  timeLimit: number; // 백업 제한시간(초). 0 = 무제한
  /** 정답 별칭 그룹: 각 그룹의 [0]이 대표 표기, 나머지는 별칭 */
  answers: string[][];
}

/** CSV 명단: 이름 → 소속 팀(팀 이름). 동명이인 구분용 이메일(선택) */
export interface RelayRosterEntry {
  name: string;
  team: string;
  email?: string;
}

export interface RelayQuiz {
  title: string;
  teamCount: number;
  teamNames: string[];
  /** 같은 사람이 연속으로 정답 인정받지 못하게(릴레이 규칙) */
  noConsecutive: boolean;
  rounds: RelayRound[];
  /** 업로드된 명단 — 입장 시 닉네임으로 자동 팀 배정 */
  roster?: RelayRosterEntry[];
}

export interface RelayTeamLobby {
  id: string;
  name: string;
  members: string[]; // 닉네임
}

export interface RelayPublicRound {
  index: number;
  total: number;
  keyword: string;
  target: number;
  timeLimit: number;
  deadline: number; // epoch ms (0 = 무제한)
}

export interface RelayAccepted {
  display: string;
  by: string; // 닉네임
}

export interface RelayProgressTeam {
  id: string;
  name: string;
  count: number;
  target: number;
}

export interface RelayPendingItem {
  id: string;
  teamId: string;
  teamName: string;
  nickname: string;
  text: string;
}

export interface RelayHostTeam {
  id: string;
  name: string;
  count: number;
  accepted: RelayAccepted[];
}

export interface RelayRoundOver {
  winnerTeamId: string | null;
  winnerName: string | null;
  counts: { name: string; count: number }[];
  scores: { name: string; score: number }[];
}

export interface RelayStanding {
  name: string;
  score: number;
}

export type RelaySubmitStatus =
  | "accepted"
  | "duplicate"
  | "pending"
  | "blocked" // 연속금지
  | "error";
