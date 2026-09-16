/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefbf3",
          100: "#d6f5e1",
          200: "#aeebc8",
          300: "#7ddaa9",
          400: "#4cc188",
          500: "#2aa46d",
          600: "#1c8457",
          700: "#186a48",
          800: "#17543b",
          900: "#144632",
        },
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
