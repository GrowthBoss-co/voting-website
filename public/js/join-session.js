// Load voter names on page load
async function loadVoterNames() {
  try {
    const response = await fetch('/api/voter-names');
    const data = await response.json();

    const select = document.getElementById('voterName');
    select.innerHTML = '<option value="">Select your name...</option>';

    if (data.voters && data.voters.length > 0) {
      data.voters.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
    }

    // Add "Other" option at the end
    const otherOption = document.createElement('option');
    otherOption.value = '__other__';
    otherOption.textContent = 'Other (type your name)';
    select.appendChild(otherOption);
  } catch (error) {
    console.error('Error loading voter names:', error);
  }
}

// Show/hide custom name input based on selection
document.getElementById('voterName').addEventListener('change', e => {
  const customInput = document.getElementById('customName');
  if (e.target.value === '__other__') {
    customInput.style.display = 'block';
    customInput.required = true;
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    customInput.required = false;
    customInput.value = '';
  }
});

document.getElementById('joinForm').addEventListener('submit', async e => {
  e.preventDefault();

  const voterNameSelect = document.getElementById('voterName').value;
  const customName = document.getElementById('customName').value.trim();
  const sessionId = document.getElementById('sessionId').value.trim();
  const errorDiv = document.getElementById('errorMessage');

  // Get the actual name to use
  let voterName;
  if (voterNameSelect === '__other__') {
    if (!customName) {
      errorDiv.textContent = 'Please enter your name';
      errorDiv.classList.remove('hidden');
      return;
    }
    voterName = customName;
  } else {
    voterName = voterNameSelect;
  }

  try {
    const response = await fetch('/api/session/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, email: voterName })
    });

    const data = await response.json();

    if (data.success) {
      localStorage.setItem(`voterId_${sessionId}`, data.voterId);
      localStorage.setItem(`voterEmail_${sessionId}`, voterName);
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

// Load voter names on page load
loadVoterNames();
