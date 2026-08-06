"use client";

import { useCallback, useEffect, useState } from "react";

interface PresetMeta {
  name: string;
  savedAt: string;
}

type Entry = { data: unknown; savedAt: string };
type Store = Record<string, Entry>; // name -> entry

/** 게임별 저장소 키 — 브라우저 localStorage 안에만 둔다(서버 전송 없음). */
const keyOf = (game: string) => `presets:${game}`;

function readStore(game: string): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(keyOf(game)) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function writeStore(game: string, store: Store) {
  try {
    localStorage.setItem(keyOf(game), JSON.stringify(store));
  } catch {
    /* 용량 초과 등 무시 */
  }
}

/**
 * 이름 붙여 저장/불러오기 하는 공용 바.
 * 데이터는 **이 브라우저의 localStorage 안에만** 저장된다 — 서버로 전송하지 않아
 * 구성원 명단 같은 개인정보가 외부에 노출되지 않는다.
 * getData() 가 반환하는 값이 그대로 저장되고, 불러오면 onLoad 로 되돌려준다.
 */
export default function PresetBar<T>({
  game,
  getData,
  onLoad,
  label = "저장된 데이터",
  hint,
}: {
  game: string;
  getData: () => T;
  onLoad: (data: T) => void;
  label?: string;
  hint?: string;
}) {
  const [presets, setPresets] = useState<PresetMeta[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 2000);
  };

  const refresh = useCallback(() => {
    const store = readStore(game);
    setPresets(
      Object.entries(store)
        .map(([n, v]) => ({ name: n, savedAt: v.savedAt }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    );
  }, [game]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const store = readStore(game);
    store[n] = { data: getData(), savedAt: new Date().toISOString() };
    writeStore(game, store);
    setName("");
    refresh();
    setSelected(n);
    flash(`"${n}" 저장됨`);
  };

  const load = () => {
    if (!selected) return;
    const store = readStore(game);
    const entry = store[selected];
    if (entry) {
      onLoad(entry.data as T);
      flash(`"${selected}" 불러옴`);
    }
  };

  const remove = () => {
    if (!selected) return;
    if (!confirm(`"${selected}" 을(를) 삭제할까요?`)) return;
    const store = readStore(game);
    delete store[selected];
    writeStore(game, store);
    setSelected("");
    refresh();
    flash("삭제됨");
  };

  return (
    <div className="card mb-6 p-4">
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-semibold text-ink-700">{label}</p>
        {msg && <span className="text-sm text-brand">{msg}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-44 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">불러올 항목 선택…</option>
          {presets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={load} className="btn-ghost px-4 py-2 text-sm" disabled={!selected}>
          불러오기
        </button>
        <button onClick={remove} className="btn-ghost px-3 py-2 text-sm" disabled={!selected}>
          삭제
        </button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <input
          className="input w-44 text-sm"
          placeholder="저장할 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button onClick={save} className="btn-primary px-4 py-2 text-sm" disabled={!name.trim()}>
          저장
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-500">
        {hint ?? "이 브라우저에만 저장됩니다 (서버로 전송하지 않음)."}
      </p>
    </div>
  );
}
