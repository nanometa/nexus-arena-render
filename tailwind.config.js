/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        melon: '#d6b56d',
        brass: '#b9935a',
        gold: '#f5d38a',
        obsidian: '#0f172a',
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Roboto Mono"', 'Consolas', 'Monaco', 'monospace'],
      },
      boxShadow: {
        premium: '0 24px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(245,211,138,0.08)',
      },
    },
  },
  plugins: [],
};
