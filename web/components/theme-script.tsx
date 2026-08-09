/**
 * Sets the theme before first paint.
 *
 * This runs as a blocking inline script in <head> on purpose. Any approach
 * that waits for React — an effect, a provider, a client component — paints
 * the default theme first and then corrects it, which is a white flash on
 * every load for anyone using Night Ledger. The script is tiny and the block
 * is measured in microseconds; the flash is not.
 *
 * `suppressHydrationWarning` on <html> in layout.tsx is the other half: the
 * server cannot know the user's stored preference, so the attribute this adds
 * legitimately differs from the server render.
 */
const script = `
(function () {
  try {
    var stored = localStorage.getItem('expenseiq-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    // Private mode can throw on localStorage. Light is the design's default,
    // and a theme failure must never stop the page rendering.
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
