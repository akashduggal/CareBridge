/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Custom breakpoints for responsive layout:
        // <768px: mobile (hamburger menu, card layout)
        // 768px-1279px: tablet (hamburger menu, scrollable table)
        // >=1280px: desktop (persistent sidebar)
        tablet: '768px',
        desktop: '1280px',
      },
    },
  },
  plugins: [],
}
