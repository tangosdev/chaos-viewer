/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // all aero tokens resolve through CSS variables so the theme picker
        // can swap palettes live (rgb triplets enable /opacity modifiers)
        'aero-bg': 'rgb(var(--aero-bg-rgb) / <alpha-value>)',
        'aero-panel': 'var(--aero-panel)',
        'aero-border': 'var(--aero-border)',
        'aero-primary': 'rgb(var(--aero-primary-rgb) / <alpha-value>)',
        'aero-accent': 'rgb(var(--aero-accent-rgb) / <alpha-value>)',
        'aero-gloss': 'rgb(var(--aero-gloss-rgb) / <alpha-value>)',
        'aero-text': 'rgb(var(--aero-text-rgb) / <alpha-value>)',
        'aero-muted': 'rgb(var(--aero-muted-rgb) / <alpha-value>)',
        'aero-matched': 'rgb(var(--aero-matched-rgb) / <alpha-value>)',
        'aero-unmatched': 'rgb(var(--aero-unmatched-rgb) / <alpha-value>)',
      },
      backdropBlur: {
        'aero': '20px',
      },
      borderRadius: {
        'aero': '16px',
      },
    },
  },
  plugins: [],
}

