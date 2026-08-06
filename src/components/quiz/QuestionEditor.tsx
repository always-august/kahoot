"use client";

import { useRef, useState } from "react";
import type {
  ChoiceQuestion,
  OxQuestion,
  Question,
  ShortQuestion,
  SliderQuestion,
} from "@/lib/game/types";
import { QUESTION_TYPE_LABEL } from "@/lib/game/factory";

interface Props {
  question: Question;
  index: number;
  onChange: (q: Question) => void;
  onRemove: () => void;
}

export default function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: Props) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm font-bold text-black">
            {index + 1}
          </span>
          <span className="chip">{QUESTION_TYPE_LABEL[question.type]}</span>
        </div>
        <button
          onClick={onRemove}
          className="text-sm text-ink-500 hover:text-tile-red"
        >
          삭제
        </button>
      </div>

      <input
        className="input mb-3 text-lg"
        placeholder="문제를 입력하세요"
        value={question.text}
        onChange={(e) => onChange({ ...question, text: e.target.value })}
      />

      <ImageField
        image={question.image}
        onChange={(image) => onChange({ ...question, image })}
      />

      {question.type === "choice" && (
        <ChoiceFields q={question} onChange={onChange} />
      )}
      {question.type === "ox" && <OxFields q={question} onChange={onChange} />}
      {question.type === "short" && (
        <ShortFields q={question} onChange={onChange} />
      )}
      {question.type === "slider" && (
        <SliderFields q={question} onChange={onChange} />
      )}

      <div className="mt-4">
        <input
          className="input text-sm"
          placeholder="해설 (선택 — 정답 공개 시 표시)"
          value={question.explanation ?? ""}
          onChange={(e) => onChange({ ...question, explanation: e.target.value })}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-4 text-sm">
        <NumField
          label="제한시간(초)"
          value={question.timeLimit}
          min={5}
          max={120}
          onChange={(v) => onChange({ ...question, timeLimit: v })}
        />
        <NumField
          label="배점"
          value={question.points}
          min={100}
          max={5000}
          step={100}
          onChange={(v) => onChange({ ...question, points: v })}
        />
      </div>
    </div>
  );
}

function ImageField({
  image,
  onChange,
}: {
  image?: string;
  onChange: (image: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) onChange(json.url);
      else setError(json.error ?? "업로드 실패");
    } catch {
      setError("업로드 실패");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mb-4">
      {image ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="문제 이미지"
            className="max-h-28 rounded-lg border border-line object-contain"
          />
          <button
            onClick={() => onChange(undefined)}
            className="text-sm text-ink-500 hover:text-tile-red"
          >
            이미지 제거
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-ghost px-4 py-2 text-sm"
        >
          {busy ? "업로드 중…" : "+ 이미지 추가"}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={upload}
        className="hidden"
      />
      {error && <p className="mt-1 text-xs text-tile-red">{error}</p>}
    </div>
  );
}

const TILE = ["tile-a", "tile-b", "tile-c", "tile-d"];

function ChoiceFields({
  q,
  onChange,
}: {
  q: ChoiceQuestion;
  onChange: (q: Question) => void;
}) {
  const setOption = (i: number, val: string) => {
    const options = [...q.options];
    options[i] = val;
    onChange({ ...q, options });
  };
  const addOption = () =>
    q.options.length < 4 && onChange({ ...q, options: [...q.options, ""] });
  const removeOption = (i: number) => {
    if (q.options.length <= 2) return;
    const options = q.options.filter((_, idx) => idx !== i);
    // 정답 인덱스 재매핑
    const correct = q.correct
      .filter((c) => c !== i)
      .map((c) => (c > i ? c - 1 : c));
    onChange({ ...q, options, correct: correct.length ? correct : [0] });
  };

  const toggleCorrect = (i: number) => {
    if (q.multiSelect) {
      const has = q.correct.includes(i);
      const correct = has ? q.correct.filter((c) => c !== i) : [...q.correct, i];
      onChange({ ...q, correct });
    } else {
      onChange({ ...q, correct: [i] });
    }
  };

  const toggleMulti = () => {
    const multiSelect = !q.multiSelect;
    // 단일 모드로 돌아갈 때 정답 1개만 유지
    const correct = multiSelect ? q.correct : q.correct.slice(0, 1);
    onChange({ ...q, multiSelect, correct: correct.length ? correct : [0] });
  };

  return (
    <div className="space-y-2">
      <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          checked={q.multiSelect}
          onChange={toggleMulti}
          className="h-4 w-4 accent-brand"
        />
        복수 정답 허용
      </label>
      {q.options.map((opt, i) => {
        const isCorrect = q.correct.includes(i);
        return (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              title="정답으로 지정"
              onClick={() => toggleCorrect(i)}
              className={`h-9 w-9 shrink-0 rounded-lg ${TILE[i]} flex items-center justify-center ${
                isCorrect ? "ring-2 ring-white" : "opacity-70"
              }`}
            >
              {isCorrect ? "✓" : ""}
            </button>
            <input
              className="input"
              placeholder={`보기 ${i + 1}`}
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
            />
            {q.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="px-2 text-ink-500 hover:text-tile-red"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {q.options.length < 4 && (
        <button
          type="button"
          onClick={addOption}
          className="text-sm text-brand hover:underline"
        >
          + 보기 추가
        </button>
      )}
      <p className="text-xs text-ink-500">
        색 버튼을 눌러 정답을 지정하세요.
        {q.multiSelect && " (여러 개 지정 가능)"}
      </p>
    </div>
  );
}

function OxFields({
  q,
  onChange,
}: {
  q: OxQuestion;
  onChange: (q: Question) => void;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => onChange({ ...q, correct: true })}
        className={`flex-1 rounded-xl py-4 text-2xl font-bold ${
          q.correct ? "bg-tile-blue ring-2 ring-white" : "bg-surface"
        }`}
      >
        O
      </button>
      <button
        type="button"
        onClick={() => onChange({ ...q, correct: false })}
        className={`flex-1 rounded-xl py-4 text-2xl font-bold ${
          !q.correct ? "bg-tile-red ring-2 ring-white" : "bg-surface"
        }`}
      >
        X
      </button>
    </div>
  );
}

function ShortFields({
  q,
  onChange,
}: {
  q: ShortQuestion;
  onChange: (q: Question) => void;
}) {
  const setAnswer = (i: number, val: string) => {
    const answers = [...q.answers];
    answers[i] = val;
    onChange({ ...q, answers });
  };
  return (
    <div className="space-y-2">
      {q.answers.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="input"
            placeholder={i === 0 ? "정답" : "추가 허용 정답"}
            value={a}
            onChange={(e) => setAnswer(i, e.target.value)}
          />
          {q.answers.length > 1 && (
            <button
              type="button"
              onClick={() =>
                onChange({ ...q, answers: q.answers.filter((_, x) => x !== i) })
              }
              className="px-2 text-ink-500 hover:text-tile-red"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...q, answers: [...q.answers, ""] })}
        className="text-sm text-brand hover:underline"
      >
        + 허용 정답 추가
      </button>
      <p className="text-xs text-ink-500">
        대소문자·앞뒤 공백은 무시하고 채점해요.
      </p>
    </div>
  );
}

function SliderFields({
  q,
  onChange,
}: {
  q: SliderQuestion;
  onChange: (q: Question) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      <NumField label="최솟값" value={q.min} onChange={(v) => onChange({ ...q, min: v })} />
      <NumField label="최댓값" value={q.max} onChange={(v) => onChange({ ...q, max: v })} />
      <NumField
        label="정답"
        value={q.correct}
        onChange={(v) => onChange({ ...q, correct: v })}
      />
      <NumField
        label="단위(step)"
        value={q.step}
        min={1}
        onChange={(v) => onChange({ ...q, step: v })}
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-ink-500">{label}</span>
      <input
        type="number"
        className="input w-28"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
