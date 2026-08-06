"use client";

import type React from "react";
import { useState, useEffect, useCallback, useRef } from "react";

interface Character {
  char: string;
  x: number;
  y: number;
  speed: number;
}

const ALL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";

class TextScramble {
  el: HTMLElement;
  chars: string;
  queue: Array<{
    from: string;
    to: string;
    start: number;
    end: number;
    char?: string;
  }>;
  frame: number;
  frameRequest: number;
  resolve: (value: void | PromiseLike<void>) => void;

  constructor(el: HTMLElement) {
    this.el = el;
    this.chars = "!<>-_\\/[]{}—=+*^?#";
    this.queue = [];
    this.frame = 0;
    this.frameRequest = 0;
    this.resolve = () => {};
    this.update = this.update.bind(this);
  }

  setText(newText: string) {
    const oldText = this.el.innerText;
    const length = Math.max(oldText.length, newText.length);
    const promise = new Promise<void>((resolve) => (this.resolve = resolve));
    this.queue = [];

    for (let i = 0; i < length; i++) {
      const from = oldText[i] || "";
      const to = newText[i] || "";
      const start = Math.floor(Math.random() * 40);
      const end = start + Math.floor(Math.random() * 40);
      this.queue.push({ from, to, start, end });
    }

    cancelAnimationFrame(this.frameRequest);
    this.frame = 0;
    this.update();
    return promise;
  }

  update() {
    let output = "";
    let complete = 0;

    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i];
      if (this.frame >= end) {
        complete++;
        output += to;
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.chars[Math.floor(Math.random() * this.chars.length)];
          this.queue[i].char = char;
        }
        output += `<span class="dud">${char}</span>`;
      } else {
        output += from;
      }
    }

    this.el.innerHTML = output;
    if (complete === this.queue.length) {
      this.resolve();
    } else {
      this.frameRequest = requestAnimationFrame(this.update);
      this.frame++;
    }
  }
}

export const ScrambledTitle: React.FC<{
  phrases: string[];
  className?: string;
}> = ({ phrases, className }) => {
  const elementRef = useRef<HTMLHeadingElement>(null);
  const scramblerRef = useRef<TextScramble | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (elementRef.current && !scramblerRef.current) {
      scramblerRef.current = new TextScramble(elementRef.current);
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted || !scramblerRef.current) return;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    let counter = 0;

    const next = () => {
      if (!active || !scramblerRef.current) return;
      scramblerRef.current.setText(phrases[counter]).then(() => {
        if (active) timeoutId = setTimeout(next, 2000);
      });
      counter = (counter + 1) % phrases.length;
    };

    next();
    return () => {
      active = false;
      clearTimeout(timeoutId);
      if (scramblerRef.current) cancelAnimationFrame(scramblerRef.current.frameRequest);
    };
  }, [mounted, phrases]);

  return (
    <h1
      ref={elementRef}
      className={
        className ??
        "text-white text-6xl font-bold tracking-wider justify-center"
      }
      style={{ fontFamily: "monospace" }}
    >
      {phrases[0]}
    </h1>
  );
};

/**
 * 화면 전체를 덮는 매트릭스식 "떨어지는 글자" 배경.
 * 콘텐츠 뒤(fixed, -z-10, 클릭 통과)에 깔려 앱 전체에서 공유된다.
 */
export const MatrixBackground: React.FC<{ charCount?: number }> = ({
  charCount = 180,
}) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeIndices, setActiveIndices] = useState<Set<number>>(new Set());
  // 모바일에서는 정신없고 성능 부담도 커서 흐르는 글자 효과를 끈다(검정 배경만 유지).
  // sm(640px) 미만이면 비활성 — 창 크기 변화에도 반응.
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const createCharacters = useCallback(() => {
    const newCharacters: Character[] = [];
    for (let i = 0; i < charCount; i++) {
      newCharacters.push({
        char: ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)],
        x: Math.random() * 100,
        y: Math.random() * 100,
        speed: 0.1 + Math.random() * 0.3,
      });
    }
    return newCharacters;
  }, [charCount]);

  useEffect(() => {
    // 비활성(모바일)이면 글자를 만들지 않아 아래 타이머들도 돌지 않는다.
    setCharacters(enabled ? createCharacters() : []);
  }, [createCharacters, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const updateActiveIndices = () => {
      const newActiveIndices = new Set<number>();
      const numActive = Math.floor(Math.random() * 3) + 3;
      for (let i = 0; i < numActive; i++) {
        newActiveIndices.add(Math.floor(Math.random() * characters.length));
      }
      setActiveIndices(newActiveIndices);
    };
    const flickerInterval = setInterval(updateActiveIndices, 50);
    return () => clearInterval(flickerInterval);
  }, [characters.length, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let animationFrameId: number;
    const updatePositions = () => {
      setCharacters((prevChars) =>
        prevChars.map((char) => ({
          ...char,
          y: char.y + char.speed,
          ...(char.y >= 100 && {
            y: -5,
            x: Math.random() * 100,
            char: ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)],
          }),
        })),
      );
      animationFrameId = requestAnimationFrame(updatePositions);
    };
    animationFrameId = requestAnimationFrame(updatePositions);
    return () => cancelAnimationFrame(animationFrameId);
  }, [enabled]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      {characters.map((char, index) => (
        <span
          key={index}
          className={`absolute text-xs transition-colors duration-100 ${
            activeIndices.has(index)
              ? "text-[#00ff00] text-base scale-125 z-10 font-bold animate-pulse"
              : "text-slate-600 font-light"
          }`}
          style={{
            left: `${char.x}%`,
            top: `${char.y}%`,
            transform: `translate(-50%, -50%) ${
              activeIndices.has(index) ? "scale(1.25)" : "scale(1)"
            }`,
            textShadow: activeIndices.has(index)
              ? "0 0 8px rgba(255,255,255,0.8), 0 0 12px rgba(255,255,255,0.4)"
              : "none",
            opacity: activeIndices.has(index) ? 1 : 0.4,
            transition: "color 0.1s, transform 0.1s, text-shadow 0.1s",
            willChange: "transform, top",
            fontSize: "1.8rem",
          }}
        >
          {char.char}
        </span>
      ))}
    </div>
  );
};

export default MatrixBackground;
