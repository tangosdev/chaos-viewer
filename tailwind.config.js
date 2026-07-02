/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Frutiger Aero + GitHub avatar-inspired palette (exact hexes finalized after avatar inspection in impl step)
        'aero-bg': '#0A1625',        // deep navy glass base
        'aero-panel': 'rgba(16, 32, 55, 0.65)',
        'aero-border': 'rgba(255, 255, 255, 0.12)',
        'aero-primary': '#00AEEF',   // classic aero cyan
        'aero-accent': '#7FC400',    // fresh lime/green
        'aero-gloss': '#E6F7FF',     // light highlight
        'aero-text': '#E8F4FC',
        'aero-muted': '#8FB8D8',
        'aero-matched': '#2ECC71',   // vibrant match green (aero glossed)
        'aero-unmatched': '#4A5568',
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

