/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        timber: {
          primary: "#1E5AA8",
          accent: "#E08A1E",
          surface: "#EEF1F6",
          ink: "#1A2332",
        },
      },
      fontFamily: {
        display: ['"Figtree"', "Segoe UI", "system-ui", "sans-serif"],
        sans: ['"Figtree"', "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
