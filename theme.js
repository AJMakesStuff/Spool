/* Apply the saved theme before the page paints. */
'use strict';
function setTheme(theme, persist = true) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const button = document.querySelector('#theme-toggle');
  if (button) {
    button.textContent = dark ? '☀ Light mode' : '☾ Dark mode';
    button.setAttribute('aria-pressed', String(dark));
  }
  if (persist) {
    try { localStorage.setItem('spool-theme', dark ? 'dark' : 'light'); } catch { /* Storage is optional. */ }
  }
}
let initialTheme;
try { initialTheme = localStorage.getItem('spool-theme'); } catch { /* Use the system preference. */ }
if (!['light', 'dark'].includes(initialTheme)) initialTheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
setTheme(initialTheme, false);
document.addEventListener('DOMContentLoaded', () => {
  setTheme(document.documentElement.dataset.theme, false);
  document.querySelector('#theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
});
