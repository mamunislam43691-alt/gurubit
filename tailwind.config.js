/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}",
    "./public/js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00d2ff',
          light: '#70e1ff',
          dark: '#00a3cc'
        },
        secondary: {
          DEFAULT: '#3a7bd5',
          light: '#6fa1e6',
          dark: '#2558a1'
        },
        dark: {
          DEFAULT: '#020b18',
          light: '#05162d',
          lighter: '#0a1e3b'
        }
      },
      backgroundImage: {
        'gradient-premium': 'linear-gradient(135deg, #00d2ff 0%, #3a7bd5 100%)',
        'gradient-dark': 'linear-gradient(135deg, #020b18 0%, #05162d 100%)',
      }
    },
  },
  plugins: [],
}
