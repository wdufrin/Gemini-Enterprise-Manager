/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./{components,context,hooks,pages,services,src,utils}/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        gray: {
          650: '#414b5a',
          750: '#2b3544',
          850: '#18202f',
        },
        slate: {
          450: '#94a3b8',
          750: '#293548',
          805: '#1c2638',
          850: '#1e293b80',
          955: '#0b0f19e6',
        }
      }
    },
  },
  plugins: [],
}

