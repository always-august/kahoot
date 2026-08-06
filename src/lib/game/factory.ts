import type { Question, QuestionType, Quiz } from "./types";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export function newQuestion(type: QuestionType): Question {
  const base = { id: newId(), text: "", timeLimit: 20, points: 1000, explanation: "" };
  switch (type) {
    case "choice":
      return { ...base, type, options: ["", ""], multiSelect: false, correct: [0] };
    case "ox":
      return { ...base, type, correct: true };
    case "short":
      return { ...base, type, timeLimit: 30, answers: [""] };
    case "slider":
      return {
        ...base,
        type,
        timeLimit: 30,
        min: 0,
        max: 100,
        step: 1,
        correct: 50,
      };
  }
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  choice: "객관식",
  ox: "OX",
  short: "주관식",
  slider: "슬라이더",
};

/** 발행 전 유효성 검사 — 문제가 있으면 사람이 읽을 오류 메시지 배열 반환 */
export function validateQuiz(quiz: Quiz): string[] {
  const errors: string[] = [];
  if (!quiz.title.trim()) errors.push("퀴즈 제목을 입력해주세요.");
  if (quiz.questions.length === 0) errors.push("문제를 1개 이상 추가해주세요.");
  quiz.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text.trim()) errors.push(`${n}번: 문제 내용이 비어있어요.`);
    if (q.type === "choice") {
      const filled = q.options.filter((o) => o.trim());
      if (filled.length < 2) errors.push(`${n}번: 보기를 2개 이상 채워주세요.`);
      if (q.correct.length === 0)
        errors.push(`${n}번: 정답을 1개 이상 지정해주세요.`);
      if (q.correct.some((i) => !q.options[i]?.trim()))
        errors.push(`${n}번: 정답으로 지정한 보기가 비어있어요.`);
    }
    if (q.type === "short" && !q.answers.some((a) => a.trim()))
      errors.push(`${n}번: 정답을 1개 이상 입력해주세요.`);
    if (q.type === "slider") {
      if (q.min >= q.max) errors.push(`${n}번: 최솟값이 최댓값보다 작아야 해요.`);
      if (q.correct < q.min || q.correct > q.max)
        errors.push(`${n}번: 정답이 범위를 벗어났어요.`);
    }
  });
  return errors;
}
