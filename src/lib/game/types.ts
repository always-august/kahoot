// 클라이언트/서버가 공유하는 게임 도메인 타입

export type QuestionType = "choice" | "ox" | "short" | "slider";

interface BaseQuestion {
  id: string;
  type: QuestionType;
  text: string;
  /** 제한시간(초) */
  timeLimit: number;
  /** 기본 배점 */
  points: number;
  /** 정답 공개 시 보여줄 해설 (선택) */
  explanation?: string;
  /** 문제에 함께 보여줄 이미지 URL (업로드 시 /uploads/... ) */
  image?: string;
}

/** 객관식 (2~4지선다, 복수 정답 지원) */
export interface ChoiceQuestion extends BaseQuestion {
  type: "choice";
  options: string[];
  /** 복수 정답 여부 */
  multiSelect: boolean;
  /** 정답 보기 인덱스들 (단일 선택이면 길이 1) */
  correct: number[];
}

/** OX */
export interface OxQuestion extends BaseQuestion {
  type: "ox";
  /** O=true, X=false */
  correct: boolean;
}

/** 주관식 (단답형) */
export interface ShortQuestion extends BaseQuestion {
  type: "short";
  /** 허용 정답들 (대소문자·공백 무시 비교) */
  answers: string[];
}

/** 슬라이더 (숫자 추정) */
export interface SliderQuestion extends BaseQuestion {
  type: "slider";
  min: number;
  max: number;
  step: number;
  correct: number;
}

export type Question =
  | ChoiceQuestion
  | OxQuestion
  | ShortQuestion
  | SliderQuestion;

export interface Quiz {
  title: string;
  questions: Question[];
}

/** 참가자가 제출하는 답 */
export type Answer =
  | { type: "choice"; indexes: number[] }
  | { type: "ox"; value: boolean }
  | { type: "short"; text: string }
  | { type: "slider"; value: number };

/** 서버가 참가자에게 보내는(정답이 제거된) 문제 뷰 */
export interface PublicQuestion {
  index: number;
  total: number;
  type: QuestionType;
  text: string;
  timeLimit: number;
  /** 마감 시각 (epoch ms) */
  deadline: number;
  /** 문제 이미지 URL (선택) */
  image?: string;
  // choice
  options?: string[];
  multiSelect?: boolean;
  // slider
  min?: number;
  max?: number;
  step?: number;
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  /** 직전 문제에서 얻은 점수 (연출용) */
  gained: number;
}

/** 참가자 개인에게 보내는 채점 결과 */
export interface PersonalResult {
  correct: boolean;
  gained: number;
  totalScore: number;
  rank: number;
  totalPlayers: number;
  /** 화면에 보여줄 정답 텍스트 */
  correctText: string;
  explanation?: string;
  /** 현재 순위표 (전원 공개) */
  leaderboard: LeaderboardEntry[];
}

/** 방장 화면에 보내는 문제 리뷰 */
export interface HostReveal {
  index: number;
  correctText: string;
  explanation?: string;
  answeredCount: number;
  totalPlayers: number;
  leaderboard: LeaderboardEntry[];
}
