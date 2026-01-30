// Check if user is authenticated
const hostToken = localStorage.getItem('hostToken');
if (!hostToken) {
  window.location.href = '/host-login';
}

async function createLiveSession() {
  try {
    const response = await fetch('/api/host/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`
      },
      body: JSON.stringify({ isLive: true })
    });

    if (!response.ok) throw new Error('Failed to create session');

    const data = await response.json();
    window.location.href = `/host/${data.sessionId}`;
  } catch (error) {
    alert('Error creating live session: ' + error.message);
  }
}

async function createNewSavedSession() {
  const sessionName = prompt('Enter a name for this saved session:');
  if (!sessionName) return;

  try {
    const response = await fetch('/api/host/create-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`
      },
      body: JSON.stringify({
        isLive: false,
        sessionName: sessionName
      })
    });

    if (!response.ok) throw new Error('Failed to create saved session');

    const data = await response.json();
    window.location.href = `/host/${data.sessionId}?mode=edit`;
  } catch (error) {
    alert('Error creating saved session: ' + error.message);
  }
}

async function showSavedSessions() {
  try {
    const response = await fetch('/api/host/saved-sessions', {
      headers: {
        Authorization: `Bearer ${hostToken}`
      }
    });

    if (!response.ok) throw new Error('Failed to fetch saved sessions');

    const data = await response.json();
    displaySavedSessions(data.sessions);

    document.getElementById('savedSessionsModal').classList.remove('hidden');
  } catch (error) {
    alert('Error loading saved sessions: ' + error.message);
  }
}

function displaySavedSessions(sessions) {
  const container = document.getElementById('sessionsList');

  if (sessions.length === 0) {
    container.innerHTML =
      '<p style="text-align: center; color: #718096;">No saved sessions yet. Create one to get started!</p>';
    return;
  }

  container.innerHTML = sessions
    .map(
      session => `
    <div class="session-item">
      <div>
        <h4>${session.name}</h4>
        <p>${session.polls.length} poll(s) • Created ${new Date(session.created).toLocaleDateString()}</p>
      </div>
      <div class="session-actions">
        <button onclick="editSession('${session.id}')" class="btn btn-small">Edit</button>
        <button onclick="presentSession('${session.id}')" class="btn btn-primary btn-small">Present</button>
        <button onclick="duplicateSession('${session.id}')" class="btn btn-small" style="background: #805ad5; color: white;">Duplicate</button>
        <button onclick="deleteSession('${session.id}')" class="btn btn-secondary btn-small">Delete</button>
      </div>
    </div>
  `
    )
    .join('');
}

function editSession(sessionId) {
  window.location.href = `/host/${sessionId}?mode=edit`;
}

function presentSession(sessionId) {
  if (confirm('Start presenting this session to voters?')) {
    window.location.href = `/host/${sessionId}?mode=present`;
  }
}

async function deleteSession(sessionId) {
  if (!confirm('Are you sure you want to delete this session?')) return;

  try {
    const response = await fetch(`/api/host/session/${sessionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${hostToken}`
      }
    });

    if (!response.ok) throw new Error('Failed to delete session');

    // Refresh the list
    showSavedSessions();
  } catch (error) {
    alert('Error deleting session: ' + error.message);
  }
}

async function duplicateSession(sessionId) {
  try {
    const response = await fetch(`/api/host/session/${sessionId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`
      }
    });

    if (!response.ok) throw new Error('Failed to duplicate session');

    const data = await response.json();

    // Ask if they want to edit the duplicated session
    if (confirm(`Session duplicated successfully!\n\nNew session: "${data.session.name}"\n\nWould you like to edit it now?`)) {
      window.location.href = `/host/${data.sessionId}?mode=edit`;
    } else {
      // Refresh the list to show the new session
      showSavedSessions();
    }
  } catch (error) {
    alert('Error duplicating session: ' + error.message);
  }
}

function closeModal() {
  document.getElementById('savedSessionsModal').classList.remove('hidden');
  document.getElementById('savedSessionsModal').classList.add('hidden');
}

function logout() {
  localStorage.removeItem('hostToken');
  window.location.href = '/';
}
