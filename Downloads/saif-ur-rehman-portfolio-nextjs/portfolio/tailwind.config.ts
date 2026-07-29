import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0D17",
        surface: "#12172A",
        surface2: "#171E36",
        border: "#28304A",
        mist: "#98A2BC",
        cloud: "#F1F4FC",
        violet: {
          DEFAULT: "#8B5CF6",
          soft: "#B197FC",
        },
        cyan: {
          DEFAULT: "#22E6D6",
          soft: "#6BF3E6",
        },
        magenta: {
          DEFAULT: "#F0399E",
          soft: "#FF7AC6",
        },
        amber: {
          DEFAULT: "#FBBF24",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, rgba(139,92,246,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(139,92,246,0.08) 1px, transparent 1px)",
      },
      boxShadow: {
        glow: "0 0 45px rgba(139,92,246,0.45)",
        "glow-cyan": "0 0 45px rgba(34,230,214,0.35)",
        "glow-magenta": "0 0 45px rgba(240,57,158,0.35)",
        "glow-sm": "0 0 20px rgba(139,92,246,0.3)",
      },
      keyframes: {
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-14px)" },
        },
        "pulse-glow": {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "blob-move": {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(30px,-20px) scale(1.08)" },
          "66%": { transform: "translate(-20px,20px) scale(0.95)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
        "spin-slow": "spin-slow 14s linear infinite",
        "blob-move": "blob-move 12s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
