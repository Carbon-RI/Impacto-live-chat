/**
 * Tailwind v4 (this app): utilities are driven from `src/app/globals.css` (`@import` + `@theme`).
 * Chat panel tokens: `:root` `--chat-panel-width` / `--chat-panel-height` → `w-chat-width`, `h-chat-height`.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
};
