/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./{components,context,pages,services,src}/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        slate: {
          450: '#94a3b8',
          850: '#1e293b80',
          955: '#0b0f19e6',
        }
      }
    },
  },
  plugins: [],
}

