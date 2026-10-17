/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Brand ink, taken from the monochrome Teststein logo.
        // Change these to re-theme buttons, active nav, avatars, etc.
        brand: {
          DEFAULT: '#0f172a',
          hover: '#1e293b',
          fg: '#ffffff',
        },
        canvas: '#f6f7f9',
        // Reserved for test result state only. Always pair with an icon + label.
        status: {
          passed: '#0ca30c',
          failed: '#d03b3b',
          blocked: '#fab219',
          running: '#2563eb',
          untested: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
}
