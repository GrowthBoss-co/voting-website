let activeSessionId = null;
let voterId = null;
let voterName = null;
let pollingInterval = null;

// Check for active session on page load
async function checkActiveSession() {
  try {
    const response = await fetch('/api/active-session');
    const data = await response.json();

    if (data.active && data.sessionId) {
      activeSessionId = data.sessionId;

      // If voter already has saved credentials AND session is actively presenting,
      // skip name selection and go straight to voting
      const savedVoterId = localStorage.getItem(`voterId_${activeSessionId}`);
      const savedVoterName = localStorage.getItem(`voterEmail_${activeSessionId}`);
      if (savedVoterId && savedVoterName && data.session && data.session.status === 'presenting') {
        // Send a heartbeat to re-register presence, then redirect
        try {
          await fetch(`/api/session/${activeSessionId}/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voterId: savedVoterId, voterName: savedVoterName })
          });
        } catch (e) {
          // Heartbeat failure is non-critical
        }
        window.location.href = `/vote/${activeSessionId}`;
        return;
      }
    }
    // Don't show error message here - let user select name first
    // Error will show when they try to click Ready without an active session
  } catch (error) {
    console.error('Error checking active session:', error);
    // Don't block the form - let user try
  }
}

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

// Handle form submission (Ready button)
document.getElementById('joinForm').addEventListener('submit', async e => {
  e.preventDefault();

  const voterNameSelect = document.getElementById('voterName').value;
  const customName = document.getElementById('customName').value.trim();
  const errorDiv = document.getElementById('errorMessage');

  // Get the actual name to use
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

  if (!voterName) {
    errorDiv.textContent = 'Please select your name';
    errorDiv.classList.remove('hidden');
    return;
  }

  // Check for active session now (after name is selected)
  if (!activeSessionId) {
    try {
      const sessionResponse = await fetch('/api/active-session');
      const sessionData = await sessionResponse.json();

      if (sessionData.active && sessionData.sessionId) {
        activeSessionId = sessionData.sessionId;
      } else {
        document.getElementById('noSessionMessage').classList.remove('hidden');
        errorDiv.classList.add('hidden');
        return;
      }
    } catch (error) {
      document.getElementById('noSessionMessage').classList.remove('hidden');
      document.getElementById('noSessionMessage').textContent = 'Error connecting to server. Please try again.';
      return;
    }
  }

  try {
    // Mark as ready
    const response = await fetch(`/api/session/${activeSessionId}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterName })
    });

    const data = await response.json();

    // Check for name already taken error (409 Conflict)
    if (response.status === 409) {
      errorDiv.textContent = data.message || 'This name is already taken. Please choose a different name.';
      errorDiv.classList.remove('hidden');
      // Reset the dropdown so they can choose a different name
      document.getElementById('voterName').value = '';
      document.getElementById('customName').style.display = 'none';
      document.getElementById('customName').value = '';
      return;
    }

    if (data.success) {
      voterId = data.voterId;
      localStorage.setItem(`voterId_${activeSessionId}`, voterId);
      localStorage.setItem(`voterEmail_${activeSessionId}`, voterName);

      // If session already presenting, go directly
      if (data.sessionStatus === 'presenting') {
        window.location.href = `/vote/${activeSessionId}`;
        return;
      }

      // Show waiting room
      document.getElementById('joinScreen').classList.add('hidden');
      document.getElementById('waitingRoom').classList.remove('hidden');

      // Update initial counts
      updateReadyStatus(data);

      // Start polling for updates
      startPolling();
    } else {
      errorDiv.textContent = data.error || 'Failed to join session';
      errorDiv.classList.remove('hidden');
    }
  } catch (error) {
    errorDiv.textContent = 'Error joining session: ' + error.message;
    errorDiv.classList.remove('hidden');
  }
});

// Update the waiting room display
function updateReadyStatus(data) {
  document.getElementById('readyCount').textContent = data.readyCount;
  document.getElementById('expectedCount').textContent = data.expectedAttendance;

  const progressPercent = Math.min(100, (data.readyCount / data.expectedAttendance) * 100);
  document.getElementById('progressFill').style.width = `${progressPercent}%`;

  // Update ready voters list
  if (data.readyVoters) {
    const votersList = document.getElementById('readyVotersList');
    votersList.innerHTML = data.readyVoters
      .map(name => `<span class="voter-chip">${name}</span>`)
      .join('');
  }

  // Check if threshold reached
  if (data.thresholdReached) {
    document.getElementById('thresholdMessage').textContent = '80% threshold reached! Waiting for host to start...';
    document.getElementById('thresholdMessage').style.color = '#48bb78';
  }

  // If session started, redirect
  if (data.sessionStatus === 'presenting') {
    window.location.href = `/vote/${activeSessionId}`;
  }
}

// Poll for ready status updates
function startPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch(`/api/session/${activeSessionId}/ready-status`);
      const data = await response.json();
      updateReadyStatus(data);
    } catch (error) {
      console.error('Error polling ready status:', error);
    }
  }, 1000); // Poll every second
}

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = '/';
});

// Initialize on page load
checkActiveSession();
loadVoterNames();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
});
