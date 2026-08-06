import type { Answer, Question } from "./types";

/** 단답 정규화: 앞뒤 공백 제거 + 소문자 + 내부 공백 축약 */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

/**
 * 정답 여부와 획득 점수를 계산한다.
 * 채점식(woowagame 동일):
 *  - 단일 선택/OX/주관식: 정답이면 배점 × (남은시간 / 제한시간)
 *  - 복수 정답: 완전 일치면 만점, 부분 일치면 (맞은 수 - 틀린 수)/정답수 × 배점 × 0.5
 *  - 슬라이더: 정확도(1 - 오차/범위) × 배점, 정확도 0.9 초과면 정답 처리
 * @param remainingRatio 남은 시간 비율 (0~1)
 */
export function scoreAnswer(
  q: Question,
  answer: Answer | undefined,
  remainingRatio: number,
): { correct: boolean; points: number } {
  const tf = Math.max(0, Math.min(1, remainingRatio));
  const base = q.points;
  if (!answer || answer.type !== q.type) return { correct: false, points: 0 };

  switch (q.type) {
    case "choice": {
      const idx = (answer as Extract<Answer, { type: "choice" }>).indexes ?? [];
      if (q.multiSelect) {
        if (sameSet(idx, q.correct)) {
          return { correct: true, points: Math.round(base * tf) };
        }
        const correctCount = idx.filter((i) => q.correct.includes(i)).length;
        const wrongCount = idx.filter((i) => !q.correct.includes(i)).length;
        const partial = Math.max(
          0,
          (correctCount - wrongCount) / q.correct.length,
        );
        return { correct: false, points: Math.round(partial * base * 0.5 * tf) };
      }
      const correct = idx[0] === q.correct[0];
      return { correct, points: correct ? Math.round(base * tf) : 0 };
    }
    case "ox": {
      const v = (answer as Extract<Answer, { type: "ox" }>).value;
      const correct = v === q.correct;
      return { correct, points: correct ? Math.round(base * tf) : 0 };
    }
    case "short": {
      const given = normalize((answer as Extract<Answer, { type: "short" }>).text);
      const correct = q.answers.some((a) => normalize(a) === given);
      return { correct, points: correct ? Math.round(base * tf) : 0 };
    }
    case "slider": {
      const v = (answer as Extract<Answer, { type: "slider" }>).value;
      const range = Math.max(1, q.max - q.min);
      const accuracy = Math.max(0, 1 - Math.abs(v - q.correct) / range);
      return { correct: accuracy > 0.9, points: Math.round(accuracy * base * tf) };
    }
  }
}

/** 화면 표시용 정답 텍스트 */
export function correctText(q: Question): string {
  switch (q.type) {
    case "choice":
      return q.correct.map((i) => q.options[i]).filter(Boolean).join(", ");
    case "ox":
      return q.correct ? "O" : "X";
    case "short":
      return q.answers.filter(Boolean).join(" / ");
    case "slider":
      return String(q.correct);
  }
}
