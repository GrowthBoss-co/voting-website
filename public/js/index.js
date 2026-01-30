document.getElementById('hostBtn').addEventListener('click', () => {
  window.location.href = '/host-login';
});

document.getElementById('joinBtn').addEventListener('click', () => {
  window.location.href = '/join-session';
});

// Load opening page settings
async function loadOpeningPageSettings() {
  try {
    const response = await fetch('/api/opening-page-settings');
    if (response.ok) {
      const settings = await response.json();
      document.getElementById('openingTitle').textContent = settings.title;
      document.getElementById('openingSubtitle').textContent = settings.subtitle;
    }
  } catch (error) {
    console.error('Error loading opening page settings:', error);
  }
}

loadOpeningPageSettings();
