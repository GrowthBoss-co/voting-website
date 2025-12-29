document.getElementById('joinForm').addEventListener('submit', async e => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const sessionId = document.getElementById('sessionId').value.trim();
  const errorDiv = document.getElementById('errorMessage');

  try {
    const response = await fetch('/api/session/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, email })
    });

    const data = await response.json();

    if (data.success) {
      localStorage.setItem(`voterId_${sessionId}`, data.voterId);
      localStorage.setItem(`voterEmail_${sessionId}`, email);
      window.location.href = `/vote/${sessionId}`;
    } else {
      errorDiv.textContent = data.error || 'Invalid session ID';
      errorDiv.classList.remove('hidden');
    }
  } catch (error) {
    errorDiv.textContent = 'Error joining session: ' + error.message;
    errorDiv.classList.remove('hidden');
  }
});

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = '/';
});
