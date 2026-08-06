import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 브랜드 블루는 라이트/다크 공통
        // 메인 매트릭스의 초록 계열을 브랜드 액센트로 사용
        brand: {
          DEFAULT: "#2bff66",
          dark: "#15e04f",
          accent: "#7c3aed",
        },
        // 시맨틱 색상은 CSS 변수 → globals.css 의 :root / .dark 에서 전환
        ink: {
          900: "var(--color-text)",
          700: "var(--color-subtext)",
          500: "var(--color-muted)",
        },
        surface: "var(--color-surface)",
        line: "var(--color-border)",
        base: "var(--color-bg)",
        card: "var(--color-card)",
        // 퀴즈 정답 4색 타일 (라이트/다크 공통, 흰 글자)
        tile: {
          red: "#ea4c5f",
          blue: "#3182f6",
          gold: "#f0a020",
          green: "#17b26a",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Apple SD Gothic Neo",
          "Noto Sans KR",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "16px",
        chip: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 16px rgba(15, 23, 42, 0.04)",
        "card-hover":
          "0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 32px rgba(15, 23, 42, 0.08)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        // 터미널식 점멸
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
      },
      animation: {
        pop: "pop 0.25s cubic-bezier(0.16,1,0.3,1)",
        floaty: "floaty 3s ease-in-out infinite",
        blink: "blink 1.2s step-end infinite",
      },
    },
  },
  plugins: [],
};

export default config;
