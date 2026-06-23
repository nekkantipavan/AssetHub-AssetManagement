/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',   // ✅ ADD THIS LINE
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        cream: {
          50:  '#fdfcfa',
          100: '#f8f6f2',
          200: '#f0ece4',
          300: '#e6e0d4',
        },
        ink: {
          900: '#2e2e2e',
          700: '#4a4a4a',
          500: '#6b7280',
          300: '#9ca3af',
          100: '#f3f4f6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      boxShadow: {
        'soft':   '0 2px 12px rgba(0,0,0,0.06)',
        'medium': '0 4px 24px rgba(0,0,0,0.08)',
        'card':   '0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
      },
      backgroundImage: {
        'orange-gradient': 'linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)',
        'orange-soft':     'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)',
      }
    },
  },
  plugins: [],
}