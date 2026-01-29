// Dark Mode Toggle - Shared across all pages
(function() {
  // Check for saved preference or system preference
  function getPreferredTheme() {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return saved === 'true';
    }
    // Check system preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Apply dark mode
  function applyDarkMode(isDark) {
    if (isDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    updateToggleButton(isDark);
  }

  // Update toggle button text
  function updateToggleButton(isDark) {
    const btn = document.getElementById('darkModeToggle');
    if (btn) {
      btn.innerHTML = isDark ? '☀️ Light' : '🌙 Dark';
    }
  }

  // Create and insert toggle button
  function createToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'darkModeToggle';
    btn.className = 'dark-mode-toggle';
    btn.innerHTML = getPreferredTheme() ? '☀️ Light' : '🌙 Dark';
    btn.onclick = function() {
      const isDark = !document.body.classList.contains('dark-mode');
      localStorage.setItem('darkMode', isDark);
      applyDarkMode(isDark);
    };
    document.body.appendChild(btn);
  }

  // Initialize on DOM ready
  function init() {
    // Apply saved preference immediately
    applyDarkMode(getPreferredTheme());
    // Create toggle button
    createToggleButton();
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only apply if user hasn't set a preference
      if (localStorage.getItem('darkMode') === null) {
        applyDarkMode(e.matches);
      }
    });
  }
})();
