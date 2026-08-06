"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

export default function QRPanel({
  code,
  joinUrl,
}: {
  code: string;
  joinUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 미지원 무시 */
    }
  };

  return (
    <div className="card flex flex-col items-center gap-4 p-6">
      <div className="rounded-2xl border border-line bg-white p-4">
        <QRCodeSVG value={joinUrl} size={200} level="M" />
      </div>
      <div className="text-center">
        <p className="text-sm text-ink-500">방 코드</p>
        <p className="text-4xl font-bold tracking-[0.25em] text-ink-900">{code}</p>
      </div>
      <button onClick={copy} className="btn-ghost w-full text-sm">
        {copied ? "복사됨 ✓" : "참여 링크 복사"}
      </button>
      <p className="break-all text-center text-xs text-ink-500">{joinUrl}</p>
    </div>
  );
}
