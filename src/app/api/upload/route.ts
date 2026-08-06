import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
// SVG 제외 — 스크립트가 심긴 SVG는 저장형 XSS가 될 수 있음(래스터 이미지만 허용)
const ALLOWED = ["png", "jpg", "jpeg", "gif", "webp"];

/** POST /api/upload (multipart: file) → { url } — public/uploads 에 저장 */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "8MB 이하만 업로드할 수 있어요." }, { status: 413 });

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ALLOWED.includes(ext))
    return NextResponse.json({ error: "이미지 파일만 올릴 수 있어요." }, { status: 415 });

  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ url: `/uploads/${name}` });
}
