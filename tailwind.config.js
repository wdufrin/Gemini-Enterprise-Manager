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
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
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
          850: '#151f32',
          955: '#0b0f19',
        }
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 160ms ease-out',
        fadeIn: 'fadeIn 160ms ease-out',
        'fade-in-up': 'fadeInUp 180ms ease-out',
        'fade-in-down': 'fadeInDown 180ms ease-out',
      },
    },
  },
  plugins: [],
}

