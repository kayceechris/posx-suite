/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#F8FAFC",
        surface: "#FFFFFF",
        "surface-alt": "#F1F5F9",
        foreground: "#0F172A",
        "foreground-muted": "#64748B",
        primary: "#3B82F6",
        "primary-hover": "#2563EB",
        secondary: "#EAB308",
        accent1: "#F97316",
        accent2: "#10B981",
        destructive: "#F43F5E",
        border: "#E2E8F0",
      },
      fontFamily: {
        heading: ["Nunito", "sans-serif"],
        body: ["Figtree", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
