import Link from "next/link";
import { ScrambledTitle } from "@/components/ui/modern-animated-hero-section";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center px-5 py-[clamp(1rem,5vh,4rem)]">
      {/* 전체는 가운데 정렬하되, 사이 spacer 가 남는 세로 공간을 상한까지 흡수해
          타이틀은 위로 / 안내문은 아래로 벌어진다. 화면이 빡빡하면 min 값까지만 줄어든다 */}
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <header className="text-center">
          <ScrambledTitle
            phrases={["PLAY IMWEB"]}
            /* nowrap 한 줄이라 높이(vh)뿐 아니라 폭(vw)도 함께 제한해야 잘리지 않는다 */
            className="whitespace-nowrap text-white text-[clamp(2.25rem,min(7.8vh,13vw),4.875rem)] font-bold tracking-wide"
          />
        </header>

        <div className="min-h-[clamp(0.75rem,2.5vh,1rem)] max-h-24 w-full flex-1" />

        {/* 게임 2개 — 3열이면 오른쪽이 비므로 최대 2열, 폭도 함께 제한해 가운데 모이게 */}
        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-[clamp(0.5rem,1.5vh,1.5rem)] [@media(max-height:700px)]:grid-cols-2 sm:grid-cols-2">
          <GameCard
            href="/quiz"
            title="실시간 퀴즈"
            desc="방장이 퀴즈를 만들고 QR로 참가자를 모아 실시간 대결. 객관식·OX·주관식·슬라이더 지원."
            cta="퀴즈 시작"
          />
          <GameCard
            href="/lucky-draw"
            title="럭키드로우"
            desc="CSV로 명단을 올리거나 직접 추가해 당첨자를 무작위 추첨. 동시 슬롯 연출."
            cta="추첨 시작"
          />
        </div>

        <div className="min-h-[clamp(0.75rem,2vh,1rem)] max-h-20 w-full flex-1" />

        {/* 타이틀과 같은 monospace + 터미널식 점멸 */}
        <p
          className="animate-blink text-[clamp(1rem,2.3vh,1.3rem)] tracking-wide text-white/60"
          style={{ fontFamily: "monospace" }}
        >
          Press enter game...
        </p>
      </div>

      <footer className="pt-[clamp(1rem,2vh,4rem)] text-center text-sm text-white/40">
        Socket.io 실시간 · 로컬(LAN) / 배포 URL 모두 지원
      </footer>
    </main>
  );
}

function GameCard({
  href,
  title,
  desc,
  cta,
}: {
  href: string;
  title: string;
  desc: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="lift-card card group relative overflow-hidden p-[clamp(1rem,3vh,1.75rem)]"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand/10 blur-2xl" />
      <div className="relative">
        <h2 className="text-2xl font-bold text-ink-900">{title}</h2>
        {/* 3열로 압축되는 낮은 높이에서는 설명을 감춰 세로 스크롤을 막는다 */}
        <p className="mt-2 text-sm leading-relaxed text-ink-700 [@media(max-height:700px)]:hidden">
          {desc}
        </p>
        <div className="mt-[clamp(0.5rem,2vh,1.25rem)] inline-flex items-center gap-1.5 font-semibold text-brand group-hover:gap-2.5">
          {cta} <span aria-hidden>→</span>
        </div>
      </div>
    </Link>
  );
}
