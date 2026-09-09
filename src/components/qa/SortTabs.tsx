"use client";

import type { QaSort } from "@/lib/qa/types";

export default function SortTabs({
  sort,
  onChange,
}: {
  sort: QaSort;
  onChange: (s: QaSort) => void;
}) {
  const tab = (v: QaSort, label: string) => (
    <button
      onClick={() => onChange(v)}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${
        sort === v ? "bg-brand font-bold text-black" : "text-ink-500 hover:text-ink-900"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex shrink-0 gap-1 rounded-xl border border-line p-1">
      {tab("popular", "인기순")}
      {tab("recent", "최신순")}
    </div>
  );
}
