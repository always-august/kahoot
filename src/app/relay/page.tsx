"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RelayEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/relay/play?room=${encodeURIComponent(c)}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-[clamp(1rem,4vh,3.5rem)]">
      <Link href="/" className="mb-8 text-sm text-ink-500 hover:text-ink-700">
        ← 게임 선택
      </Link>

      <h1 className="mb-1 text-3xl font-bold text-ink-900">키워드 릴레이</h1>
      <p className="mb-8 text-ink-700">
        키워드에 맞는 단어를 팀원들이 릴레이로 이어 채우는 순발력 게임.
      </p>

      <Link href="/relay/host" className="btn-primary btn-lg mb-6 w-full">
        게임 만들기 (어드민)
      </Link>

      <div className="mb-6 flex items-center gap-3 text-sm text-ink-500">
        <span className="h-px flex-1 bg-line" />
        또는
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={join} className="card p-6">
        <label className="label" htmlFor="code">
          방 코드로 참여
        </label>
        <input
          id="code"
          className="input mb-4 text-center text-2xl font-bold tracking-[0.3em]"
          placeholder="ABC123"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit" className="btn-ghost w-full" disabled={!code.trim()}>
          참여하기 →
        </button>
      </form>
    </main>
  );
}
