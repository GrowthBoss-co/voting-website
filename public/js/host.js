const sessionId = window.location.pathname.split('/')[2];
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode'); // 'edit' or 'present' or null (live)

let polls = [];
let currentPollIndex = -1;
let currentPoll = null;
let pollingInterval = null;
const completedPolls = []; // Store results of completed polls
let creators = [];
let companies = [];
let totalVotersInSession = 0;
let hasReachedThreshold = false;
let autoCarouselInterval = null;
let videoEndTimeout = null;
let voterNames = [];
let expectedAttendance = 0;
let isActiveSession = false;
let readyPollingInterval = null;

// Stop all playing videos (iframes and YouTube API players)
function stopAllVideos() {
  // Stop and destroy YouTube API player if exists
  if (window.ytLoopPlayer) {
    try {
      if (typeof window.ytLoopPlayer.stopVideo === 'function') {
        window.ytLoopPlayer.stopVideo();
      }
      if (typeof window.ytLoopPlayer.destroy === 'function') {
        window.ytLoopPlayer.destroy();
      }
      window.ytLoopPlayer = null;
    } catch (e) {
      console.log('Error stopping YouTube player:', e);
    }
  }

  // Stop all iframes by removing them entirely (most reliable way to stop audio)
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    // Remove the iframe src to stop all media
    iframe.src = 'about:blank';
  });

  // Clear video end timeout if exists
  if (videoEndTimeout) {
    clearTimeout(videoEndTimeout);
    videoEndTimeout = null;
  }
}

document.getElementById('sessionId').textContent = sessionId;

// Load creator and company lists
async function loadLists() {
  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch('/api/host/lists', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      creators = data.creators;
      companies = data.companies;
      updateCreatorsList();
      updateCompaniesList();
    }
  } catch (error) {
    console.error('Error loading lists:', error);
  }
}

// Update creators dropdown and list
function updateCreatorsList() {
  const select = document.getElementById('pollCreator');
  const currentValue = select.value;

  select.innerHTML = '<option value="">Select a creator...</option>';
  creators.forEach(creator => {
    const option = document.createElement('option');
    option.value = creator;
    option.textContent = creator;
    select.appendChild(option);
  });

  // Restore selection if it still exists
  if (currentValue && creators.includes(currentValue)) {
    select.value = currentValue;
  }

  // Update the list with delete buttons
  const listContainer = document.getElementById('creatorsList');
  listContainer.innerHTML = creators
    .map(
      creator => `
    <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #f7fafc; border-radius: 4px; font-size: 13px;">
      <span>${creator}</span>
      <button type="button" onclick="deleteCreator('${creator.replace(/'/g, "\\'")}')" style="background: none; border: none; color: #e53e3e; cursor: pointer; padding: 0 4px; font-size: 16px; line-height: 1;" title="Delete">&times;</button>
    </div>
  `
    )
    .join('');
}

// Update companies dropdown and list
function updateCompaniesList() {
  const select = document.getElementById('pollCompany');
  const currentValue = select.value;

  select.innerHTML = '<option value="">Select a company...</option>';
  companies.forEach(company => {
    const option = document.createElement('option');
    option.value = company;
    option.textContent = company;
    select.appendChild(option);
  });

  // Add custom option at the end
  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = 'Type custom company...';
  select.appendChild(customOption);

  // Restore selection if it still exists
  if (currentValue && (companies.includes(currentValue) || currentValue === '__custom__')) {
    select.value = currentValue;
  }

  // Update the list with delete buttons
  const listContainer = document.getElementById('companiesList');
  listContainer.innerHTML = companies
    .map(
      company => `
    <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #f7fafc; border-radius: 4px; font-size: 13px;">
      <span>${company}</span>
      <button type="button" onclick="deleteCompany('${company.replace(/'/g, "\\'")}')" style="background: none; border: none; color: #e53e3e; cursor: pointer; padding: 0 4px; font-size: 16px; line-height: 1;" title="Delete">&times;</button>
    </div>
  `
    )
    .join('');
}

// Show/hide custom company input based on selection
document.getElementById('pollCompany').addEventListener('change', e => {
  const customInput = document.getElementById('pollCompanyCustom');
  if (e.target.value === '__custom__') {
    customInput.style.display = 'block';
    customInput.required = true;
  } else {
    customInput.style.display = 'none';
    customInput.required = false;
    customInput.value = '';
  }
});

// Add creator dialog
function showAddCreatorDialog() {
  const name = prompt('Enter creator name:');
  if (name && name.trim()) {
    addCreator(name.trim());
  }
}

async function addCreator(name) {
  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch('/api/host/creators', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (!response.ok) {
      alert('Error: ' + (data.error || 'Failed to add creator'));
      return;
    }

    creators = data.creators;
    updateCreatorsList();
  } catch (error) {
    console.error('Error adding creator:', error);
    alert('Error adding creator: ' + error.message);
  }
}

async function deleteCreator(name) {
  if (!confirm(`Delete creator "${name}"?`)) {
    return;
  }

  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch(`/api/host/creators/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
      alert('Error: ' + (data.error || 'Failed to delete creator'));
      return;
    }

    creators = data.creators;
    updateCreatorsList();
  } catch (error) {
    console.error('Error deleting creator:', error);
    alert('Error deleting creator: ' + error.message);
  }
}

// Add company dialog
function showAddCompanyDialog() {
  const name = prompt('Enter company name:');
  if (name && name.trim()) {
    addCompany(name.trim());
  }
}

async function addCompany(name) {
  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch('/api/host/companies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (!response.ok) {
      alert('Error: ' + (data.error || 'Failed to add company'));
      return;
    }

    companies = data.companies;
    updateCompaniesList();
  } catch (error) {
    console.error('Error adding company:', error);
    alert('Error adding company: ' + error.message);
  }
}

async function deleteCompany(name) {
  if (!confirm(`Delete company "${name}"?`)) {
    return;
  }

  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch(`/api/host/companies/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
      alert('Error: ' + (data.error || 'Failed to delete company'));
      return;
    }

    companies = data.companies;
    updateCompaniesList();
  } catch (error) {
    console.error('Error deleting company:', error);
    alert('Error deleting company: ' + error.message);
  }
}

// Load lists on page load
loadLists();

// Load voter names list
async function loadVoterNames() {
  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch('/api/host/voters', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      voterNames = data.voters;
      updateVoterNamesList();
    }
  } catch (error) {
    console.error('Error loading voter names:', error);
  }
}

// Update voter names list display
function updateVoterNamesList() {
  const listContainer = document.getElementById('voterNamesList');
  if (!listContainer) return;

  listContainer.innerHTML = voterNames
    .map(
      name => `
    <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: white; border-radius: 4px; font-size: 13px; border: 1px solid #e2e8f0;">
      <span>${name}</span>
      <button type="button" onclick="deleteVoterName('${name.replace(/'/g, "\\'")}')" style="background: none; border: none; color: #e53e3e; cursor: pointer; padding: 0 4px; font-size: 16px; line-height: 1;" title="Delete">&times;</button>
    </div>
  `
    )
    .join('');
}

// Show add voter dialog
function showAddVoterDialog() {
  const name = prompt('Enter voter name:');
  if (name && name.trim()) {
    addVoterName(name.trim());
  }
}

// Add voter name
async function addVoterName(name) {
  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch('/api/host/voters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (!response.ok) {
      alert('Error: ' + (data.error || 'Failed to add voter'));
      return;
    }

    voterNames = data.voters;
    updateVoterNamesList();
  } catch (error) {
    console.error('Error adding voter:', error);
    alert('Error adding voter: ' + error.message);
  }
}

// Delete voter name
async function deleteVoterName(name) {
  if (!confirm(`Delete voter "${name}"?`)) {
    return;
  }

  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch(`/api/host/voters/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
      alert('Error: ' + (data.error || 'Failed to delete voter'));
      return;
    }

    voterNames = data.voters;
    updateVoterNamesList();
  } catch (error) {
    console.error('Error deleting voter:', error);
    alert('Error deleting voter: ' + error.message);
  }
}

// Load voter names on page load
loadVoterNames();

// Load opening page settings
async function loadOpeningPageSettings() {
  try {
    const response = await fetch('/api/opening-page-settings');
    if (response.ok) {
      const settings = await response.json();
      document.getElementById('openingTitleInput').value = settings.title;
      document.getElementById('openingSubtitleInput').value = settings.subtitle;
    }
  } catch (error) {
    console.error('Error loading opening page settings:', error);
  }
}

// Save opening page settings
async function saveOpeningPageSettings() {
  try {
    const token = localStorage.getItem('hostToken');
    const title = document.getElementById('openingTitleInput').value.trim();
    const subtitle = document.getElementById('openingSubtitleInput').value.trim();

    const response = await fetch('/api/host/opening-page-settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ title, subtitle })
    });

    if (response.ok) {
      alert('Opening page settings saved!');
    } else {
      const data = await response.json();
      alert('Error: ' + (data.error || 'Failed to save settings'));
    }
  } catch (error) {
    console.error('Error saving opening page settings:', error);
    alert('Error saving settings: ' + error.message);
  }
}

// Load opening page settings on page load
loadOpeningPageSettings();

// Check if this session is the active session
async function checkActiveSession() {
  try {
    const response = await fetch('/api/active-session');
    const data = await response.json();

    if (data.active && data.sessionId === sessionId) {
      isActiveSession = true;
      document.getElementById('setActiveSessionBtn').classList.add('hidden');
      document.getElementById('clearActiveSessionBtn').classList.remove('hidden');
      document.getElementById('activeSessionBadge').classList.remove('hidden');

      // Load expected attendance from session
      if (data.session.expectedAttendance) {
        expectedAttendance = data.session.expectedAttendance;
        document.getElementById('expectedAttendanceInput').value = expectedAttendance;
        document.getElementById('expectedVotersCount').textContent = expectedAttendance;
      }

      // Start polling for ready voters
      startReadyPolling();
    } else {
      isActiveSession = false;
      document.getElementById('setActiveSessionBtn').classList.remove('hidden');
      document.getElementById('clearActiveSessionBtn').classList.add('hidden');
      document.getElementById('activeSessionBadge').classList.add('hidden');
    }
  } catch (error) {
    console.error('Error checking active session:', error);
  }
}

// Set this session as the active session
async function setAsActiveSession() {
  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch('/api/host/set-active-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ sessionId })
    });

    if (response.ok) {
      isActiveSession = true;
      document.getElementById('setActiveSessionBtn').classList.add('hidden');
      document.getElementById('clearActiveSessionBtn').classList.remove('hidden');
      document.getElementById('activeSessionBadge').classList.remove('hidden');

      // Save expected attendance
      await updateExpectedAttendance();

      // Start polling for ready voters
      startReadyPolling();

      alert('This session is now set as This Week\'s Session! Voters can now join.');
    } else {
      const data = await response.json();
      alert('Error: ' + (data.error || 'Failed to set active session'));
    }
  } catch (error) {
    console.error('Error setting active session:', error);
    alert('Error setting active session: ' + error.message);
  }
}

// Clear this session as the active session
async function clearActiveSession() {
  if (!confirm('Remove this session as the active session? Voters will no longer be able to join.')) {
    return;
  }

  try {
    const token = localStorage.getItem('hostToken');
    const response = await fetch('/api/host/clear-active-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      isActiveSession = false;
      document.getElementById('setActiveSessionBtn').classList.remove('hidden');
      document.getElementById('clearActiveSessionBtn').classList.add('hidden');
      document.getElementById('activeSessionBadge').classList.add('hidden');

      // Stop polling
      if (readyPollingInterval) {
        clearInterval(readyPollingInterval);
        readyPollingInterval = null;
      }
    }
  } catch (error) {
    console.error('Error clearing active session:', error);
  }
}

// Update expected attendance
async function updateExpectedAttendance() {
  expectedAttendance = parseInt(document.getElementById('expectedAttendanceInput').value) || 10;
  document.getElementById('expectedVotersCount').textContent = expectedAttendance;

  try {
    await fetch(`/api/session/${sessionId}/attendance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendance: expectedAttendance })
    });

    // Update attendance display if in voting section
    const attendanceDisplay = document.getElementById('currentAttendance');
    if (attendanceDisplay) {
      attendanceDisplay.textContent = expectedAttendance;
    }

    totalVotersInSession = expectedAttendance;
  } catch (error) {
    console.error('Error updating attendance:', error);
  }
}

// Start polling for ready voters
function startReadyPolling() {
  if (readyPollingInterval) {
    clearInterval(readyPollingInterval);
  }

  // Initial fetch
  fetchReadyStatus();

  readyPollingInterval = setInterval(fetchReadyStatus, 2000);
}

// Fetch ready status
async function fetchReadyStatus() {
  try {
    const response = await fetch(`/api/session/${sessionId}/ready-status`);
    const data = await response.json();

    document.getElementById('readyVotersCount').textContent = data.readyCount;
    document.getElementById('expectedVotersCount').textContent = data.expectedAttendance;
  } catch (error) {
    console.error('Error fetching ready status:', error);
  }
}

// Clear ready voters
async function clearReadyVoters() {
  if (!confirm('Reset all ready voters? They will need to click Ready again.')) {
    return;
  }

  try {
    await fetch(`/api/session/${sessionId}/clear-ready`, { method: 'POST' });
    document.getElementById('readyVotersCount').textContent = '0';
  } catch (error) {
    console.error('Error clearing ready voters:', error);
  }
}

// Restart session from setup section (before starting)
async function restartSessionFromSetup() {
  if (!confirm('Restart the session? This will clear all votes and reset to Poll 1.')) {
    return;
  }

  try {
    // Clear all votes
    await fetch(`/api/session/${sessionId}/clear-votes`, {
      method: 'POST'
    });

    // Clear chat messages
    await fetch(`/api/session/${sessionId}/chat`, {
      method: 'DELETE'
    });

    // Reset session status
    await fetch(`/api/session/${sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restart: true })
    });

    alert('Session has been reset! All votes and chat cleared. Ready to start from Poll 1.');

    // Hide clear votes button since votes are now cleared
    document.getElementById('clearVotesBtn').style.display = 'none';
  } catch (error) {
    console.error('Error restarting session:', error);
    alert('Error restarting session: ' + error.message);
  }
}

// Host Waiting Room functions
let hostWaitingPollingInterval = null;
function showHostWaitingRoom() {
  document.getElementById('setupSection').classList.add('hidden');
  document.getElementById('hostWaitingRoom').classList.remove('hidden');

  // Update expected count from input
  const expectedInput = document.getElementById('expectedAttendanceInput');
  document.getElementById('hostExpectedCount').textContent = expectedInput ? expectedInput.value : '10';

  // Start polling for ready status
  startHostWaitingPolling();
}

function exitHostWaitingRoom() {
  document.getElementById('hostWaitingRoom').classList.add('hidden');
  document.getElementById('setupSection').classList.remove('hidden');

  // Stop polling
  if (hostWaitingPollingInterval) {
    clearInterval(hostWaitingPollingInterval);
    hostWaitingPollingInterval = null;
  }
}

async function startHostWaitingPolling() {
  // Initial fetch
  await updateHostWaitingStatus();

  // Poll every second
  hostWaitingPollingInterval = setInterval(updateHostWaitingStatus, 1000);
}

async function updateHostWaitingStatus() {
  try {
    const response = await fetch(`/api/session/${sessionId}/ready-status`);
    const data = await response.json();

    document.getElementById('hostReadyCount').textContent = data.readyCount;
    document.getElementById('hostExpectedCount').textContent = data.expectedAttendance;

    const progressPercent = Math.min(100, (data.readyCount / data.expectedAttendance) * 100);
    document.getElementById('hostProgressFill').style.width = `${progressPercent}%`;

    // Update ready voters list
    if (data.readyVoters) {
      document.getElementById('hostReadyVotersList').innerHTML = data.readyVoters
        .map(name => `<span style="display: inline-block; padding: 5px 12px; margin: 4px; background: #48bb78; color: white; border-radius: 20px; font-size: 14px;">${name}</span>`)
        .join('');
    }

    // Check if threshold reached
    if (data.thresholdReached) {
      document.getElementById('hostThresholdMessage').textContent = '80% threshold reached!';
      document.getElementById('hostThresholdMessage').style.color = '#48bb78';
    }

    // If session started, go to presenting
    if (data.sessionStatus === 'presenting') {
      forceStartSession();
    }
  } catch (error) {
    console.error('Error polling ready status:', error);
  }
}

async function forceStartSession() {
  console.log('[forceStartSession] Starting...');

  // Stop waiting room polling
  if (hostWaitingPollingInterval) {
    clearInterval(hostWaitingPollingInterval);
    hostWaitingPollingInterval = null;
  }

  // Hide waiting room and setup, show voting section
  console.log('[forceStartSession] Hiding waiting room and setup, showing voting section');
  document.getElementById('hostWaitingRoom').classList.add('hidden');
  document.getElementById('setupSection').classList.add('hidden');
  document.getElementById('votingSection').classList.remove('hidden');

  console.log('[forceStartSession] votingSection hidden?', document.getElementById('votingSection').classList.contains('hidden'));

  // Ensure polls are loaded before starting
  console.log('[forceStartSession] polls.length before load:', polls.length);
  if (polls.length === 0) {
    console.log('[forceStartSession] Loading polls...');
    await loadExistingPolls();
    console.log('[forceStartSession] polls.length after load:', polls.length);
  }

  // Fetch session data to get expected attendance
  try {
    const sessionResponse = await fetch(`/api/session/${sessionId}`);
    const sessionData = await sessionResponse.json();
    if (sessionData.expectedAttendance) {
      expectedAttendance = sessionData.expectedAttendance;
      totalVotersInSession = sessionData.expectedAttendance;
      console.log('[forceStartSession] Set totalVotersInSession:', totalVotersInSession);
    }
  } catch (error) {
    console.error('[forceStartSession] Error fetching session data:', error);
  }

  // Start the first poll
  console.log('[forceStartSession] Starting poll 0');
  await startPoll(0);
  console.log('[forceStartSession] Done');
}

// Check active session on page load
checkActiveSession();

// Load existing polls if in edit or present mode
async function loadExistingPolls() {
  try {
    const response = await fetch(`/api/session/${sessionId}`);
    if (response.ok) {
      const data = await response.json();
      if (data.polls && data.polls.length > 0) {
        polls = data.polls;
        updatePollsList();
        document.getElementById('startVotingBtn').disabled = false;
      }
    }
  } catch (error) {
    console.error('Error loading existing polls:', error);
  }
}

// If in edit or present mode, load existing polls
if (mode === 'edit' || mode === 'present') {
  loadExistingPolls();

  // Check if session is paused on page load
  checkSessionStatus();
}

// Update button text based on mode
if (mode === 'edit') {
  document.getElementById('startVotingBtn').textContent = 'Save & Exit';
} else if (mode === 'present') {
  document.getElementById('startVotingBtn').textContent = 'Start Presenting';
}

// Function to check session status on load
async function checkSessionStatus() {
  try {
    const response = await fetch(`/api/session/${sessionId}`);
    if (response.ok) {
      const sessionData = await response.json();

      // If session is paused, show a notification
      if (sessionData.status === 'paused' && sessionData.pausedAtPollIndex >= 0) {
        const statusMsg = document.createElement('div');
        statusMsg.style.cssText = 'background: #fed7d7; color: #c53030; padding: 12px; border-radius: 6px; margin-bottom: 20px; text-align: center; font-weight: 600;';
        statusMsg.textContent = `⏸️ This session is paused at Poll ${sessionData.pausedAtPollIndex + 1}. Click "Start Presenting" to resume or restart.`;

        const setupSection = document.getElementById('setupSection');
        setupSection.insertBefore(statusMsg, setupSection.firstChild);
      }

      // Check if there are any votes - if so, show the clear votes button
      await checkIfVotesExist();
    }
  } catch (error) {
    console.error('Error checking session status:', error);
  }
}

// Check if any votes exist and show/hide the clear votes button
async function checkIfVotesExist() {
  try {
    let hasVotes = false;
    for (const poll of polls) {
      const response = await fetch(`/api/session/${sessionId}/results/${poll.id}`);
      const data = await response.json();
      if (data.totalVotes > 0) {
        hasVotes = true;
        break;
      }
    }

    const clearVotesBtn = document.getElementById('clearVotesBtn');
    if (hasVotes) {
      clearVotesBtn.style.display = 'block';
    } else {
      clearVotesBtn.style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking for votes:', error);
  }
}

// Clear all votes function
async function clearAllVotes() {
  if (!confirm('Are you sure you want to clear ALL votes? This will allow everyone to vote again on all polls.')) {
    return;
  }

  try {
    const response = await fetch(`/api/session/${sessionId}/clear-votes`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Failed to clear votes');
    }

    alert('All votes have been cleared! Voters can now vote again.');
    document.getElementById('clearVotesBtn').style.display = 'none';
  } catch (error) {
    console.error('Error clearing votes:', error);
    alert('Error clearing votes: ' + error.message);
  }
}

document.getElementById('pollForm').addEventListener('submit', async e => {
  e.preventDefault();

  const creator = document.getElementById('pollCreator').value;
  const companySelect = document.getElementById('pollCompany').value;
  let company = companySelect;

  // If custom company is selected, use the custom input
  if (companySelect === '__custom__') {
    company = document.getElementById('pollCompanyCustom').value.trim();
    if (!company) {
      alert('Please enter a company name');
      return;
    }
  }

  const mediaUrlsText = document.getElementById('mediaUrls').value.trim();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const editingIndex = document.getElementById('editingPollIndex').value;

  // Capitalize company name (first letter of each word)
  const formattedCompany = company
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (!mediaUrlsText) {
    alert('Please enter at least one media URL');
    return;
  }

  // Split by newlines OR commas (with optional quotes and spaces)
  // This handles both formats:
  // 1. Line-separated: URL1\nURL2\nURL3
  // 2. Comma-separated: "URL1", "URL2", "URL3" or URL1, URL2, URL3
  let urls = [];

  if (mediaUrlsText.includes(',')) {
    // Comma-separated format
    urls = mediaUrlsText
      .split(',')
      .map(url => url.trim())
      // Remove quotes if present
      .map(url => url.replace(/^["']|["']$/g, ''))
      .filter(url => url.length > 0);
  } else {
    // Newline-separated format (original)
    urls = mediaUrlsText
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);
  }

  if (urls.length === 0) {
    alert('Please enter at least one valid media URL');
    return;
  }

  const mediaItems = [];

  for (const url of urls) {
    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      alert(`Invalid URL: ${url}`);
      return;
    }

    let processedUrl = url;
    let type = 'image';

    // Check if it's a YouTube URL
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      type = 'video';
      let videoId = null;

      // Format 1: https://www.youtube.com/watch?v=VIDEO_ID
      const match1 = url.match(/[?&]v=([^&]+)/);
      if (match1) {
        videoId = match1[1];
      }

      // Format 2: https://youtu.be/VIDEO_ID
      const match2 = url.match(/youtu\.be\/([^?&]+)/);
      if (match2) {
        videoId = match2[1];
      }

      // Format 3: https://www.youtube.com/embed/VIDEO_ID
      const match3 = url.match(/youtube\.com\/embed\/([^?&]+)/);
      if (match3) {
        videoId = match3[1];
      }

      if (videoId) {
        processedUrl = `https://www.youtube.com/embed/${videoId}`;
      } else {
        alert('Could not extract YouTube video ID from URL: ' + url);
        return;
      }
    }
    // Check if it's a Google Drive URL
    else if (url.includes('drive.google.com')) {
      type = 'video';
      let fileId = null;

      // Format 1: https://drive.google.com/file/d/FILE_ID/view
      const match1 = url.match(/\/file\/d\/([^\/]+)/);
      if (match1) {
        fileId = match1[1];
      }

      // Format 2: https://drive.google.com/open?id=FILE_ID
      const match2 = url.match(/[?&]id=([^&]+)/);
      if (match2) {
        fileId = match2[1];
      }

      // Format 3: Already in preview format
      const match3 = url.match(/\/file\/d\/([^\/]+)\/preview/);
      if (match3) {
        fileId = match3[1];
      }

      if (fileId) {
        processedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
      } else {
        alert('Could not extract Google Drive file ID from URL: ' + url);
        return;
      }
    }

    mediaItems.push({ url: processedUrl, type });
  }

  // Show loading state
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  const isEditing = editingIndex !== '';

  submitBtn.textContent = isEditing ? 'Updating poll...' : 'Adding poll...';

  try {
    if (isEditing) {
      // Update existing poll
      const pollIndex = parseInt(editingIndex);
      const response = await fetch(`/api/session/${sessionId}/poll/${pollIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator,
          company: formattedCompany,
          mediaItems,
          exposeThem: false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update poll');
      }

      polls[pollIndex] = data.poll;
      updatePollsList();

      // Reset form and exit edit mode
      cancelEdit();

      submitBtn.textContent = 'Poll Updated!';
      setTimeout(() => {
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }, 2000);
    } else {
      // Add new poll
      const response = await fetch(`/api/session/${sessionId}/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator,
          company: formattedCompany,
          mediaItems,
          exposeThem: false
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add poll');
      }

      if (!data.poll) {
        throw new Error('Invalid response from server');
      }

      polls.push(data.poll);
      updatePollsList();

      // Reset form
      document.getElementById('pollForm').reset();
      document.getElementById('mediaUrls').value = '';
      document.getElementById('pollCompanyCustom').style.display = 'none';
      document.getElementById('pollCompanyCustom').value = '';

      document.getElementById('startVotingBtn').disabled = false;

      // Show success feedback
      submitBtn.textContent = 'Poll Added!';
      setTimeout(() => {
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error('Error saving poll:', error);
    alert('Error saving poll: ' + error.message);
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
  }
});

// Track the current view mode for polls list
let pollsViewMode = 'preview'; // 'compact' or 'preview'
let pollsExpanded = false; // Track expanded state

// Generate thumbnail URL for a media item
function getThumbnailUrl(mediaItem) {
  const url = mediaItem.url;

  // YouTube - use thumbnail API
  if (url.includes('youtube.com/embed/')) {
    const videoId = url.split('/embed/')[1].split('?')[0];
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  }

  // Google Drive - use thumbnail API (works for images and video previews)
  if (url.includes('drive.google.com')) {
    const fileIdMatch = url.match(/\/file\/d\/([^\/]+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    }
  }

  // Images - use the URL directly
  if (mediaItem.type === 'image') {
    return url;
  }

  // Other - return null (will use placeholder)
  return null;
}

// Generate thumbnail HTML for a media item
function generateThumbnailHtml(mediaItem, pollIndex, itemIndex, showDelete = false) {
  const thumbnailUrl = getThumbnailUrl(mediaItem);
  const isYouTube = mediaItem.url.includes('youtube.com/embed/');
  const isGoogleDrive = mediaItem.url.includes('drive.google.com');
  const poll = polls[pollIndex];
  const totalItems = poll ? poll.mediaItems.length : 1;

  const deleteBtn = showDelete ? `
    <button class="thumbnail-delete-btn" onclick="event.stopPropagation(); deleteMediaItem(${pollIndex}, ${itemIndex})" title="Remove this item">✕</button>
  ` : '';

  // Shuffle buttons (only show if more than 1 item)
  let shuffleButtons = '';
  if (totalItems > 1) {
    const canMoveLeft = itemIndex > 0;
    const canMoveRight = itemIndex < totalItems - 1;
    shuffleButtons = `
      <div class="thumbnail-shuffle-btns">
        <button class="thumbnail-shuffle-btn ${!canMoveLeft ? 'disabled' : ''}" onclick="event.stopPropagation(); ${canMoveLeft ? `moveMediaItem(${pollIndex}, ${itemIndex}, -1)` : ''}" title="Move left" ${!canMoveLeft ? 'disabled' : ''}>◀</button>
        <span class="thumbnail-position">${itemIndex + 1}/${totalItems}</span>
        <button class="thumbnail-shuffle-btn ${!canMoveRight ? 'disabled' : ''}" onclick="event.stopPropagation(); ${canMoveRight ? `moveMediaItem(${pollIndex}, ${itemIndex}, 1)` : ''}" title="Move right" ${!canMoveRight ? 'disabled' : ''}>▶</button>
      </div>
    `;
  }

  if (thumbnailUrl) {
    let overlayLabel = '';
    if (isYouTube) {
      overlayLabel = '<div class="poll-thumbnail-overlay">▶ YouTube</div>';
    } else if (isGoogleDrive) {
      overlayLabel = '<div class="poll-thumbnail-overlay">Google Drive</div>';
    }

    return `
      <div class="poll-thumbnail" onclick="showThumbnailPreview('${mediaItem.url}', '${mediaItem.type}')" title="Click to preview">
        <img src="${thumbnailUrl}" alt="Media ${itemIndex + 1}" onerror="this.parentElement.innerHTML='<div class=\\'poll-thumbnail-video\\'><div class=\\'play-icon\\'>📁</div>Failed to load</div>'">
        ${overlayLabel}
        ${deleteBtn}
        ${shuffleButtons}
      </div>
    `;
  } else {
    return `
      <div class="poll-thumbnail poll-thumbnail-video" onclick="showThumbnailPreview('${mediaItem.url}', '${mediaItem.type}')" title="Click to preview">
        <div>
          <div class="play-icon">🎬</div>
          <div>Video</div>
        </div>
        ${deleteBtn}
        ${shuffleButtons}
      </div>
    `;
  }
}

// Move a media item left or right in the carousel order
async function moveMediaItem(pollIndex, mediaIndex, direction) {
  const poll = polls[pollIndex];
  const newIndex = mediaIndex + direction;

  if (newIndex < 0 || newIndex >= poll.mediaItems.length) return;

  try {
    // Swap the media items
    const updatedMediaItems = [...poll.mediaItems];
    const temp = updatedMediaItems[mediaIndex];
    updatedMediaItems[mediaIndex] = updatedMediaItems[newIndex];
    updatedMediaItems[newIndex] = temp;

    // Update the poll on the server
    const response = await fetch(`/api/session/${sessionId}/poll/${pollIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator: poll.creator,
        company: poll.company,
        mediaItems: updatedMediaItems
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update poll');
    }

    const data = await response.json();
    polls[pollIndex] = data.poll;
    updatePollsList();
  } catch (error) {
    console.error('Error moving media item:', error);
    alert('Failed to reorder media item');
  }
}

// Delete a specific media item from a poll
async function deleteMediaItem(pollIndex, mediaIndex) {
  const poll = polls[pollIndex];

  if (poll.mediaItems.length <= 1) {
    alert('Cannot delete the last media item. Delete the entire poll instead.');
    return;
  }

  const confirmMsg = `Remove media item ${mediaIndex + 1} from Poll ${pollIndex + 1} (${poll.creator} - ${poll.company})?`;
  if (!confirm(confirmMsg)) return;

  try {
    // Remove the media item
    const updatedMediaItems = [...poll.mediaItems];
    updatedMediaItems.splice(mediaIndex, 1);

    // Update the poll on the server
    const response = await fetch(`/api/session/${sessionId}/poll/${pollIndex}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creator: poll.creator,
        company: poll.company,
        mediaItems: updatedMediaItems
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update poll');
    }

    const data = await response.json();
    polls[pollIndex] = data.poll;
    updatePollsList();

  } catch (error) {
    console.error('Error deleting media item:', error);
    alert('Error deleting media item: ' + error.message);
  }
}

// Show full preview modal when clicking a thumbnail
function showThumbnailPreview(url, type) {
  const modal = document.createElement('div');
  modal.className = 'thumbnail-modal';
  modal.onclick = () => modal.remove();

  if (type === 'image') {
    modal.innerHTML = `<img src="${url}" onclick="event.stopPropagation()">`;
  } else {
    // Check if it's a YouTube Shorts URL and convert to embed
    let embedUrl = url;
    let isShorts = false;

    // Convert /shorts/ URL to embed format
    if (url.includes('/shorts/')) {
      const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) {
        embedUrl = `https://www.youtube.com/embed/${shortsMatch[1]}`;
        isShorts = true;
      }
    }

    // Check if it's a YouTube embed that might be a short (vertical video)
    const embedMatch = embedUrl.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch && !isShorts) {
      // Check if original URL was a shorts URL
      isShorts = url.includes('/shorts/');
    }

    if (isShorts) {
      // Use 9:16 aspect ratio for Shorts
      modal.innerHTML = `
        <div onclick="event.stopPropagation()" style="width: 350px; height: 622px; max-height: 90vh; aspect-ratio: 9/16;">
          <iframe src="${embedUrl}" style="width: 100%; height: 100%; border: none; border-radius: 12px;"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen></iframe>
        </div>`;
    } else {
      modal.innerHTML = `<iframe src="${embedUrl}" frameborder="0" allowfullscreen onclick="event.stopPropagation()"></iframe>`;
    }
  }

  document.body.appendChild(modal);

  // Close on escape key
  const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  document.addEventListener('keydown', closeOnEscape);
}

// Check for potential duplicate polls based on media URLs
function findDuplicatePolls() {
  const urlMap = new Map();
  const duplicates = new Set();

  polls.forEach((poll, index) => {
    poll.mediaItems.forEach(item => {
      const key = item.url;
      if (urlMap.has(key)) {
        duplicates.add(index);
        duplicates.add(urlMap.get(key));
      } else {
        urlMap.set(key, index);
      }
    });
  });

  return duplicates;
}

// Toggle between compact and preview view
function togglePollsView(mode) {
  pollsViewMode = mode;
  updatePollsList();
}

// Toggle expanded view for duplicate checking
function toggleExpandedView() {
  pollsExpanded = !pollsExpanded;
  updatePollsList();

  // Handle escape key to close expanded view
  if (pollsExpanded) {
    const closeOnEscape = (e) => {
      if (e.key === 'Escape' && pollsExpanded) {
        pollsExpanded = false;
        updatePollsList();
        document.removeEventListener('keydown', closeOnEscape);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
  }
}

function updatePollsList() {
  const container = document.getElementById('pollsContainer');
  const duplicates = findDuplicatePolls();

  // Add view toggle buttons
  const viewToggleHtml = `
    <div style="display: flex; gap: 8px; margin-bottom: 15px; flex-wrap: wrap; align-items: center;">
      <button class="view-toggle-btn ${pollsViewMode === 'preview' ? 'active' : ''}" onclick="togglePollsView('preview')">
        🖼️ Preview View
      </button>
      <button class="view-toggle-btn ${pollsViewMode === 'compact' ? 'active' : ''}" onclick="togglePollsView('compact')">
        📋 Compact View
      </button>
      ${pollsViewMode === 'preview' ? `
        <button class="expand-btn ${pollsExpanded ? 'active' : ''}" onclick="toggleExpandedView()">
          ${pollsExpanded ? '⬅️ Collapse' : '↔️ Expand Full Screen'}
        </button>
      ` : ''}
      ${duplicates.size > 0 ? `<span style="color: #e53e3e; font-weight: 600; padding: 6px 12px; background: #fff5f5; border-radius: 6px;">⚠️ ${duplicates.size} potential duplicate(s) found</span>` : ''}
    </div>
  `;

  // Generate the poll grid HTML (with optional delete buttons on thumbnails)
  function generatePollGridHtml(showDeleteButtons) {
    return `
      <div class="poll-preview-grid">
        ${polls.map((poll, index) => `
          <div class="poll-preview-card ${duplicates.has(index) ? 'duplicate-warning' : ''}" data-index="${index}">
            <div class="poll-preview-header">
              <h4>Poll ${index + 1}: ${poll.creator} - ${poll.company}</h4>
              <span class="poll-meta">${poll.mediaItems.length} item${poll.mediaItems.length > 1 ? 's' : ''}</span>
            </div>
            <div class="poll-preview-media">
              ${poll.mediaItems.map((item, itemIndex) => generateThumbnailHtml(item, index, itemIndex, showDeleteButtons)).join('')}
            </div>
            <div class="poll-preview-actions">
              <button onclick="editPoll(${index})" class="btn btn-small btn-secondary">Edit</button>
              <button onclick="deletePoll(${index})" class="btn btn-small btn-danger">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (pollsViewMode === 'preview') {
    if (pollsExpanded) {
      // Full screen expanded view
      let expandedContainer = document.getElementById('expandedPollsView');
      if (!expandedContainer) {
        expandedContainer = document.createElement('div');
        expandedContainer.id = 'expandedPollsView';
        expandedContainer.className = 'polls-expanded';
        document.body.appendChild(expandedContainer);
      }

      expandedContainer.innerHTML = `
        <div class="expanded-header">
          <h2>Poll Preview - Duplicate Check (${polls.length} polls)</h2>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${duplicates.size > 0 ? `<span style="color: #e53e3e; font-weight: 600; padding: 6px 12px; background: #fff5f5; border-radius: 6px;">⚠️ ${duplicates.size} potential duplicate(s)</span>` : '<span style="color: #48bb78; font-weight: 600;">✓ No duplicates found</span>'}
            <button class="btn" style="background: #667eea; color: white; padding: 8px 16px;" onclick="toggleExpandedView()">
              ↙ Collapse View
            </button>
            <button class="expand-btn active" onclick="toggleExpandedView()" style="font-size: 20px; padding: 8px 12px;">
              ✕
            </button>
          </div>
        </div>
        <p style="color: #666; margin: 0 0 15px 0; font-size: 14px;">💡 Hover over thumbnails to reorder carousel items using the arrow buttons</p>
        ${generatePollGridHtml(true)}
      `;

      // Keep the regular container with a note
      container.innerHTML = viewToggleHtml + `<p style="color: #666; text-align: center; padding: 20px;">Viewing in expanded mode. Press Esc or click "Collapse" to return.</p>`;
    } else {
      // Remove expanded view if it exists
      const expandedContainer = document.getElementById('expandedPollsView');
      if (expandedContainer) {
        expandedContainer.remove();
      }

      // Grid view with thumbnails
      container.innerHTML = viewToggleHtml + generatePollGridHtml(false);
    }
  } else {
    // Compact list view (original)
    container.innerHTML = viewToggleHtml + polls
      .map(
        (poll, index) => `
      <div class="poll-item ${duplicates.has(index) ? 'duplicate-warning' : ''}" draggable="true" data-index="${index}" style="${duplicates.has(index) ? 'border-left: 4px solid #e53e3e; background: #fff5f5;' : ''}">
        <div class="drag-handle" title="Drag to reorder">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="color: #718096;">
            <circle cx="7" cy="5" r="1.5"/>
            <circle cx="13" cy="5" r="1.5"/>
            <circle cx="7" cy="10" r="1.5"/>
            <circle cx="13" cy="10" r="1.5"/>
            <circle cx="7" cy="15" r="1.5"/>
            <circle cx="13" cy="15" r="1.5"/>
          </svg>
        </div>
        <div style="flex: 1;">
          <strong>Poll ${index + 1}:</strong> ${poll.creator} - ${poll.company}
          <span style="margin-left: 10px; color: #666;">(${poll.mediaItems.length} media item${poll.mediaItems.length > 1 ? 's' : ''})</span>
          ${duplicates.has(index) ? '<span style="margin-left: 10px; color: #e53e3e; font-weight: 600;">⚠️ Duplicate</span>' : ''}
        </div>
        <div style="display: flex; gap: 8px;">
          <button onclick="editPoll(${index})" class="btn btn-small btn-secondary">Edit</button>
          <button onclick="deletePoll(${index})" class="btn btn-small btn-danger">Delete</button>
        </div>
      </div>
    `
      )
      .join('');

    // Add drag and drop event listeners for compact view
    const pollItems = container.querySelectorAll('.poll-item');
    pollItems.forEach(item => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragover', handleDragOver);
      item.addEventListener('drop', handleDrop);
      item.addEventListener('dragenter', handleDragEnter);
      item.addEventListener('dragleave', handleDragLeave);
      item.addEventListener('dragend', handleDragEnd);
    });
  }
}

document.getElementById('startVotingBtn').addEventListener('click', async () => {
  // Handle edit mode - save and exit
  if (mode === 'edit') {
    alert('Session saved! You can present it anytime from the saved sessions page.');
    window.location.href = '/session-select';
    return;
  }

  if (polls.length === 0) {
    alert('Please add at least one poll');
    return;
  }

  // Check if session is paused
  try {
    const response = await fetch(`/api/session/${sessionId}`);
    if (response.ok) {
      const sessionData = await response.json();
      console.log('Session status check:', sessionData.status, 'pausedAtPollIndex:', sessionData.pausedAtPollIndex);

      if (sessionData.status === 'paused' && sessionData.pausedAtPollIndex >= 0) {
        // Show resume/restart dialog
        console.log('Showing resume dialog for poll index:', sessionData.pausedAtPollIndex);
        showResumeDialog(sessionData.pausedAtPollIndex);
        return;
      }
    }
  } catch (error) {
    console.error('Error checking session status:', error);
  }

  // Use the pre-set attendance from setup section
  expectedAttendance = parseInt(document.getElementById('expectedAttendanceInput').value) || 10;
  totalVotersInSession = expectedAttendance;

  // Update attendance display
  const attendanceDisplay = document.getElementById('currentAttendance');
  if (attendanceDisplay) {
    attendanceDisplay.textContent = expectedAttendance;
  }

  // Save attendance to session
  await fetch(`/api/session/${sessionId}/attendance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendance: expectedAttendance })
  });

  // Stop ready polling when starting session
  if (readyPollingInterval) {
    clearInterval(readyPollingInterval);
    readyPollingInterval = null;
  }

  // Start session - hide setup, show voting
  document.getElementById('setupSection').classList.add('hidden');
  document.getElementById('votingSection').classList.remove('hidden');

  await startPoll(0);
});

// Show update attendance dialog (during session)
function showUpdateAttendanceDialog() {
  const modal = document.getElementById('updateAttendanceModal');
  document.getElementById('updateAttendanceInput').value = expectedAttendance || totalVotersInSession || '';
  modal.classList.remove('hidden');
  document.getElementById('updateAttendanceInput').focus();
}

// Handle update attendance confirm
document.getElementById('confirmUpdateAttendanceBtn').addEventListener('click', async () => {
  const attendance = parseInt(document.getElementById('updateAttendanceInput').value) || 0;

  if (attendance < 1) {
    alert('Please enter a valid number of voters');
    return;
  }

  // Save attendance to session
  try {
    await fetch(`/api/session/${sessionId}/attendance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendance })
    });

    expectedAttendance = attendance;
    totalVotersInSession = attendance;

    // Update attendance display
    const attendanceDisplay = document.getElementById('currentAttendance');
    if (attendanceDisplay) {
      attendanceDisplay.textContent = attendance;
    }
  } catch (error) {
    console.error('Error updating attendance:', error);
  }

  document.getElementById('updateAttendanceModal').classList.add('hidden');
});

// Handle update attendance cancel
document.getElementById('closeUpdateAttendanceBtn').addEventListener('click', () => {
  document.getElementById('updateAttendanceModal').classList.add('hidden');
});

// Check if a URL is a YouTube Short
function isYouTubeShort(url) {
  if (!url) return false;
  return url.includes('/shorts/') || (url.includes('youtube.com/embed/') && url.includes('shorts'));
}

// Get embed URL for Shorts
function getShortsEmbedUrl(url) {
  if (url.includes('youtube.com/embed/')) {
    return url;
  }
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch) {
    return `https://www.youtube.com/embed/${shortsMatch[1]}`;
  }
  return url;
}

async function startPoll(pollIndex, { skipServerStart = false } = {}) {
  // Stop any playing videos from previous poll
  stopAllVideos();

  try {
    // Skip the server POST when advancing from voter-skip detection
    // (the skip-poll endpoint already started the poll on the server)
    if (!skipServerStart) {
      const response = await fetch(`/api/session/${sessionId}/start/${pollIndex}`, {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to start poll');
    }

    currentPollIndex = pollIndex;
    currentPoll = polls[pollIndex];

    document.getElementById('currentPollTitle').textContent = `${currentPoll.creator} - ${currentPoll.company}`;

    // Render carousel for media items
    const mediaContainer = document.getElementById('currentPollMedia');

    // Check if this is a YouTube Short
    const hasShorts = currentPoll.mediaItems.some(item =>
      item.type === 'video' && isYouTubeShort(item.url)
    );

    // Apply or remove shorts layout class
    const currentPollSection = document.querySelector('.current-poll');
    const resultsPanel = currentPollSection.querySelector('.results-panel');
    const exposeStatusPanel = document.getElementById('exposeStatusPanel');

    // Handle shorts layout wrapper
    let shortsRightPanel = currentPollSection.querySelector('.shorts-right-panel');

    if (hasShorts && currentPoll.mediaItems.length === 1) {
      currentPollSection.classList.add('shorts-layout');

      // Create wrapper for right side elements if not exists
      if (!shortsRightPanel) {
        shortsRightPanel = document.createElement('div');
        shortsRightPanel.className = 'shorts-right-panel';

        // Move results panel and expose status into the wrapper
        if (resultsPanel) {
          resultsPanel.parentNode.insertBefore(shortsRightPanel, resultsPanel);
          shortsRightPanel.appendChild(resultsPanel);
        }
        if (exposeStatusPanel) {
          shortsRightPanel.appendChild(exposeStatusPanel);
        }
      }
    } else {
      currentPollSection.classList.remove('shorts-layout');

      // Unwrap elements if wrapper exists
      if (shortsRightPanel) {
        const pollControls = currentPollSection.querySelector('.poll-controls');
        if (resultsPanel && pollControls) {
          pollControls.parentNode.insertBefore(resultsPanel, pollControls);
        }
        if (exposeStatusPanel && pollControls) {
          pollControls.parentNode.insertBefore(exposeStatusPanel, pollControls);
        }
        if (shortsRightPanel.parentNode) {
          shortsRightPanel.parentNode.removeChild(shortsRightPanel);
        }
      }
    }

    if (currentPoll.mediaItems.length === 1) {
      // Single item - no carousel needed
      const item = currentPoll.mediaItems[0];
      if (item.type === 'video') {
        // Check if it's a YouTube Short
        if (isYouTubeShort(item.url)) {
          // Extract video ID from shorts URL
          const shortsMatch = item.url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
          const embedMatch = item.url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
          const videoId = shortsMatch ? shortsMatch[1] : (embedMatch ? embedMatch[1] : '');

          let embedUrl = getShortsEmbedUrl(item.url);
          mediaContainer.innerHTML = `
            <div class="shorts-video-container">
              <iframe src="${embedUrl}"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowfullscreen>
              </iframe>
            </div>
          `;
        } else {
          const videoUrl = item.url;
          mediaContainer.innerHTML = `
            <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
              <iframe src="${videoUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen>
              </iframe>
            </div>
          `;
        }
      } else {
        mediaContainer.innerHTML = `
          <img src="${item.url}" alt="Poll media" style="max-width: 100%; max-height: 500px; display: block; margin: 0 auto; border-radius: 8px;">
        `;
      }
    } else {
      // Multiple items - show first one with carousel controls
      mediaContainer.innerHTML = `
        <div class="carousel-container">
          <button class="carousel-arrow carousel-prev" onclick="hostCarouselPrev()">‹</button>
          <div class="carousel-content" id="hostCarouselContent"></div>
          <button class="carousel-arrow carousel-next" onclick="hostCarouselNext()">›</button>
        </div>
        <div class="carousel-indicators" id="hostCarouselIndicators"></div>
      `;

      window.hostCarouselIndex = 0;
      window.hostCarouselItems = currentPoll.mediaItems;

      // Preload all images in the carousel
      preloadCarouselImages(currentPoll.mediaItems);

      renderHostCarouselItem(0);

      // Always start auto-carousel for multi-media polls
      startAutoCarousel();
    }

    document.getElementById('totalVotes').textContent = '0';
    document.getElementById('averageRating').textContent = '-';
    document.getElementById('ratingsList').innerHTML = '';
    document.getElementById('pollProgress').textContent =
      `Poll ${pollIndex + 1} of ${polls.length}`;

    // Reset expose vote display for this poll
    document.getElementById('exposeVoteCount').textContent = '0';
    document.getElementById('exposeVoteNeeded').textContent = Math.ceil(expectedAttendance * 0.5);
    document.getElementById('exposeStatus').textContent = 'Not triggered';
    document.getElementById('exposeStatus').style.background = '#e2e8f0';

    startPolling();

    // Start voter status polling for the status panel
    startHostVoterStatusPolling();

    const nextBtn = document.getElementById('nextPollBtn');
    if (pollIndex >= polls.length - 1) {
      nextBtn.textContent = 'Finish Session';
      nextBtn.onclick = async () => {
        stopPolling();
        await saveCompletedPoll();
        await showSessionResults();
      };
    } else {
      nextBtn.textContent = 'Next Poll';
      nextBtn.onclick = async () => {
        stopPolling();
        await saveCompletedPoll();
        startPoll(pollIndex + 1);
      };
    }
  } catch (error) {
    console.error('Error starting poll:', error);
    // Ensure polling restarts even on error so the host UI doesn't freeze
    currentPollIndex = pollIndex;
    currentPoll = polls[pollIndex];
    startPolling();
  }
}

function startPolling() {
  stopPolling();
  updateResults();
  pollingInterval = setInterval(updateResults, 2000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// Skip to next poll
async function skipToNextPoll() {
  if (!confirm('Skip to the next poll?')) return;

  try {
    const response = await fetch(`/api/session/${sessionId}/skip-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Error skipping poll:', data.error);
      return;
    }

    // Stop current poll state
    stopPolling();
    await saveCompletedPoll();

    if (data.sessionCompleted) {
      await showSessionResults();
    } else {
      // Start the new poll without re-posting to server (skip-poll already did it)
      await startPoll(data.newPollIndex, { skipServerStart: true });
    }
  } catch (error) {
    console.error('Error skipping poll:', error);
  }
}

function startAutoCarousel() {
  stopAutoCarousel();
  if (window.hostCarouselItems && window.hostCarouselItems.length > 1) {
    autoCarouselInterval = setInterval(() => {
      hostCarouselNext();
    }, 5000); // Rotate every 5 seconds
  }
}

function stopAutoCarousel() {
  if (autoCarouselInterval) {
    clearInterval(autoCarouselInterval);
    autoCarouselInterval = null;
  }
}

function stopVideoEndTimeout() {
  if (videoEndTimeout) {
    clearTimeout(videoEndTimeout);
    videoEndTimeout = null;
  }
}

// YouTube looping player
let ytLoopPlayer = null;
let ytLoopCheckInterval = null;
let ytApiReady = false;

// Load YouTube API script once
function loadYouTubeAPI() {
  if (document.getElementById('youtube-api-script')) {
    return; // Already loaded
  }
  const tag = document.createElement('script');
  tag.id = 'youtube-api-script';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

// Called automatically by YouTube API when ready
window.onYouTubeIframeAPIReady = function() {
  console.log('YouTube API ready');
  ytApiReady = true;
};

function initYouTubeLoopPlayer(videoId) {
  console.log('Initializing YouTube loop player for:', videoId);

  // Clean up existing player
  destroyYouTubeLoopPlayer();

  // Load API if needed
  loadYouTubeAPI();

  // Wait for API to be ready
  const tryCreatePlayer = () => {
    if (window.YT && window.YT.Player) {
      console.log('Creating YouTube player');
      try {
        ytLoopPlayer = new YT.Player('ytLoopPlayer', {
          videoId: videoId,
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1
          },
          events: {
            onReady: function(event) {
              console.log('YouTube player ready, starting playback');
              event.target.unMute();
              event.target.setVolume(75);
              event.target.playVideo();
              startLoopCheck();
            },
            onStateChange: function(event) {
              console.log('YouTube player state:', event.data);
              // 0 = ended
              if (event.data === 0) {
                console.log('Video ended, restarting');
                event.target.seekTo(0);
                event.target.playVideo();
              }
            },
            onError: function(event) {
              console.error('YouTube player error:', event.data);
            }
          }
        });
      } catch (e) {
        console.error('Error creating YouTube player:', e);
      }
    } else {
      console.log('Waiting for YouTube API...');
      setTimeout(tryCreatePlayer, 200);
    }
  };

  tryCreatePlayer();
}

function startLoopCheck() {
  if (ytLoopCheckInterval) {
    clearInterval(ytLoopCheckInterval);
  }

  ytLoopCheckInterval = setInterval(() => {
    if (ytLoopPlayer && typeof ytLoopPlayer.getPlayerState === 'function') {
      try {
        const state = ytLoopPlayer.getPlayerState();
        if (state === 0) { // Ended
          console.log('Loop check: video ended, restarting');
          ytLoopPlayer.seekTo(0);
          ytLoopPlayer.playVideo();
        }
      } catch (e) {
        // Player might be destroyed
      }
    }
  }, 500);
}

function destroyYouTubeLoopPlayer() {
  if (ytLoopCheckInterval) {
    clearInterval(ytLoopCheckInterval);
    ytLoopCheckInterval = null;
  }

  if (ytLoopPlayer) {
    try {
      ytLoopPlayer.destroy();
    } catch (e) {
      // Ignore
    }
    ytLoopPlayer = null;
  }
}

async function updateResults() {
  if (!currentPoll) return;

  try {
    // Check if an authorized voter skipped to a different poll
    const sessionResponse = await fetch(`/api/session/${sessionId}`);
    const sessionData = await sessionResponse.json();

    // Detect if poll was skipped by voter (server's currentPollIndex doesn't match ours)
    if (sessionData.currentPollIndex !== undefined && sessionData.currentPollIndex !== currentPollIndex) {
      console.log('Poll change detected! Server:', sessionData.currentPollIndex, 'Local:', currentPollIndex);

      if (sessionData.status === 'completed') {
        // Session was ended by voter skip on last poll
        stopPolling();
        await saveCompletedPoll();
        await showSessionResults();
        return;
      } else if (sessionData.currentPollIndex >= 0 && sessionData.currentPollIndex < polls.length) {
        // Voter skipped to a different poll - use startPoll to properly initialize
        stopPolling();
        await saveCompletedPoll();
        // Update local poll data with server-side data (includes startTime from skip)
        if (sessionData.polls && sessionData.polls[sessionData.currentPollIndex]) {
          polls[sessionData.currentPollIndex] = sessionData.polls[sessionData.currentPollIndex];
        }
        // Call startPoll which handles all the media rendering and setup
        // skipServerStart: true because skip-poll already started the poll on the server
        // Await it to ensure polling restarts properly
        await startPoll(sessionData.currentPollIndex, { skipServerStart: true });
        return; // Skip the rest of this update cycle
      }
    }

    const response = await fetch(`/api/session/${sessionId}/results/${currentPoll.id}`);
    const data = await response.json();

    document.getElementById('totalVotes').textContent = data.totalVotes;
    document.getElementById('averageRating').textContent = data.average;

    // Hide individual ratings during live voting
    const ratingsList = document.getElementById('ratingsList');
    ratingsList.innerHTML = '';

    // Fetch and update expose status
    const exposeResponse = await fetch(`/api/session/${sessionId}/expose-status/${currentPoll.id}`);
    const exposeData = await exposeResponse.json();

    document.getElementById('exposeVoteCount').textContent = exposeData.exposeVoteCount;
    document.getElementById('exposeVoteNeeded').textContent = exposeData.thresholdNeeded;

    const exposeStatus = document.getElementById('exposeStatus');
    if (exposeData.shouldReveal) {
      exposeStatus.textContent = 'Revealed!';
      exposeStatus.style.background = '#f8d7da';
      exposeStatus.style.color = '#721c24';
    } else if (exposeData.thresholdReached) {
      if (exposeData.revealCountdown !== null && exposeData.revealCountdown > 0) {
        exposeStatus.textContent = `Revealing in ${exposeData.revealCountdown}s`;
      } else {
        exposeStatus.textContent = 'Revealing...';
      }
      exposeStatus.style.background = '#fff3cd';
      exposeStatus.style.color = '#856404';
    } else {
      exposeStatus.textContent = 'Not triggered';
      exposeStatus.style.background = '#e2e8f0';
      exposeStatus.style.color = '#4a5568';
    }

  } catch (error) {
    console.error('Error fetching results:', error);
  }
}

async function saveCompletedPoll() {
  if (!currentPoll) return;

  // Stop auto-carousel and video timeouts
  stopAutoCarousel();
  stopVideoEndTimeout();

  try {
    const response = await fetch(`/api/session/${sessionId}/results/${currentPoll.id}`);
    const data = await response.json();

    completedPolls.push({
      creator: currentPoll.creator,
      company: currentPoll.company,
      pollId: currentPoll.id,
      totalVotes: data.totalVotes,
      average: data.average,
      votesWithEmails: data.votesWithEmails || [],
      exposeThem: exposeThemValue,
      lastVoter: data.lastVoter || null,
      exposeThemV2: exposeThemV2Value,
      nonVoters: data.nonVoters || []
    });
  } catch (error) {
    console.error('Error saving completed poll:', error);
  }
}

async function showSessionResults() {
  // Stop any playing videos first
  stopAllVideos();

  document.getElementById('votingSection').classList.add('hidden');

  // Mark session as completed
  try {
    await fetch(`/api/session/${sessionId}/complete`, {
      method: 'POST'
    });
  } catch (error) {
    console.error('Error marking session as completed:', error);
  }

  // Show Top 10 screen first
  document.getElementById('hostTop10Screen').classList.remove('hidden');
  await fetchHostTop10();
}

// Fetch and display Top 10 for host
async function fetchHostTop10() {
  try {
    const response = await fetch(`/api/session/${sessionId}/top10`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load top 10');
    }

    renderHostTop10(data.top10, data.topCreators || (data.topCreator ? [data.topCreator] : null));
  } catch (error) {
    console.error('Error fetching top 10:', error);
    const top10List = document.getElementById('hostTop10List');
    top10List.innerHTML = `
      <div class="loading-top10">
        <p>Could not load results. <a href="#" onclick="fetchHostTop10(); return false;">Try again</a></p>
      </div>
    `;
  }
}

// Store carousel state for host top10
window.hostTop10Carousels = {};

// Render Top 10 for host
function renderHostTop10(top10, topCreators) {
  const top10List = document.getElementById('hostTop10List');
  const congratsSection = document.getElementById('hostTopCreatorCongrats');

  if (!top10 || top10.length === 0) {
    top10List.innerHTML = `
      <div class="loading-top10">
        <p>No rated content available yet.</p>
      </div>
    `;
    congratsSection.classList.add('hidden');
    return;
  }

  // Show congratulations for the creator(s) with highest overall average
  if (topCreators && topCreators.length > 0) {
    const names = topCreators.map(c => c.name);
    const namesText = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];

    document.getElementById('hostTopCreatorName').textContent = namesText;
    document.getElementById('hostTopCreatorScore').textContent = topCreators[0].overallAverage.toFixed(2);
    congratsSection.classList.remove('hidden');
  } else {
    congratsSection.classList.add('hidden');
  }

  // Reset carousel state
  window.hostTop10Carousels = {};

  // Render top 10 items with full media preview
  top10List.innerHTML = top10.map((item, index) => {
    const rank = index + 1;
    const mediaItems = item.mediaItems || [];

    // Generate media HTML based on number of items
    let mediaHTML = '';
    if (mediaItems.length === 1) {
      mediaHTML = renderHostTop10SingleMedia(mediaItems[0]);
    } else if (mediaItems.length > 1) {
      window.hostTop10Carousels[index] = { items: mediaItems, currentIndex: 0 };
      mediaHTML = renderHostTop10Carousel(index, mediaItems);
    }

    return `
      <div class="top10-item">
        <div class="top10-item-header">
          <div class="top10-rank">#${rank}</div>
          <div class="top10-info">
            <div class="top10-title">${item.creator} - ${item.company}</div>
            <div class="top10-meta">${item.totalVotes} vote${item.totalVotes !== 1 ? 's' : ''}</div>
          </div>
          <div class="top10-rating">
            <div class="top10-rating-value">${item.average.toFixed(1)}</div>
            <div class="top10-rating-label">avg</div>
          </div>
        </div>
        <div class="top10-media">
          ${mediaHTML}
        </div>
      </div>
    `;
  }).join('');
}

function renderHostTop10SingleMedia(mediaItem) {
  if (!mediaItem) return '';

  if (mediaItem.type === 'video') {
    let videoUrl = mediaItem.url;

    // Check if YouTube Shorts URL - convert to embed format
    const shortsMatch = videoUrl.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      videoUrl = `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }

    const youtubeMatch = videoUrl.match(/youtube\.com\/embed\/([^?&]+)/);
    if (youtubeMatch) {
      return `<iframe src="${videoUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    return `<iframe src="${videoUrl}" allow="autoplay" allowfullscreen></iframe>`;
  } else {
    return `<img src="${mediaItem.url}" alt="Content">`;
  }
}

function renderHostTop10Carousel(carouselIndex, mediaItems) {
  const firstItem = mediaItems[0];
  const indicators = mediaItems.map((_, i) =>
    `<span class="top10-carousel-dot ${i === 0 ? 'active' : ''}" onclick="hostTop10CarouselGoto(${carouselIndex}, ${i})"></span>`
  ).join('');

  return `
    <div class="top10-carousel" id="host-top10-carousel-${carouselIndex}">
      <div class="top10-carousel-content" id="host-top10-carousel-content-${carouselIndex}">
        ${renderHostTop10SingleMedia(firstItem)}
      </div>
      <div class="top10-carousel-arrows">
        <button class="top10-carousel-arrow" onclick="hostTop10CarouselPrev(${carouselIndex})">‹</button>
        <button class="top10-carousel-arrow" onclick="hostTop10CarouselNext(${carouselIndex})">›</button>
      </div>
      <div class="top10-carousel-indicators" id="host-top10-carousel-indicators-${carouselIndex}">
        ${indicators}
      </div>
    </div>
  `;
}

function hostTop10CarouselPrev(carouselIndex) {
  const carousel = window.hostTop10Carousels[carouselIndex];
  if (!carousel) return;

  carousel.currentIndex = (carousel.currentIndex - 1 + carousel.items.length) % carousel.items.length;
  updateHostTop10Carousel(carouselIndex);
}

function hostTop10CarouselNext(carouselIndex) {
  const carousel = window.hostTop10Carousels[carouselIndex];
  if (!carousel) return;

  carousel.currentIndex = (carousel.currentIndex + 1) % carousel.items.length;
  updateHostTop10Carousel(carouselIndex);
}

function hostTop10CarouselGoto(carouselIndex, itemIndex) {
  const carousel = window.hostTop10Carousels[carouselIndex];
  if (!carousel) return;

  carousel.currentIndex = itemIndex;
  updateHostTop10Carousel(carouselIndex);
}

function updateHostTop10Carousel(carouselIndex) {
  const carousel = window.hostTop10Carousels[carouselIndex];
  if (!carousel) return;

  const content = document.getElementById(`host-top10-carousel-content-${carouselIndex}`);
  const indicators = document.getElementById(`host-top10-carousel-indicators-${carouselIndex}`);

  if (content) {
    content.innerHTML = renderHostTop10SingleMedia(carousel.items[carousel.currentIndex]);
  }

  if (indicators) {
    const dots = indicators.querySelectorAll('.top10-carousel-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === carousel.currentIndex);
    });
  }
}

// Handle continue to full results button
document.getElementById('continueToResultsBtn').addEventListener('click', () => {
  document.getElementById('hostTop10Screen').classList.add('hidden');
  showFullSessionResults();
});

async function showFullSessionResults() {
  const container = document.querySelector('.host-dashboard');

  // Fetch all poll results from backend instead of relying on completedPolls array
  const allPollResults = [];
  for (const poll of polls) {
    try {
      const response = await fetch(`/api/session/${sessionId}/results/${poll.id}`);
      const data = await response.json();
      allPollResults.push({
        creator: poll.creator,
        company: poll.company,
        pollId: poll.id,
        totalVotes: data.totalVotes,
        average: data.average,
        votesWithEmails: data.votesWithEmails || [],
        exposeThem: poll.exposeThem || false,
        lastVoter: data.lastVoter || null,
        exposeThemV2: poll.exposeThemV2 || false,
        nonVoters: data.nonVoters || []
      });
    } catch (error) {
      console.error('Error fetching results for poll:', poll.id, error);
    }
  }

  // Calculate creator and company averages
  const creatorStats = {};
  const companyStats = {};

  allPollResults.forEach(poll => {
    // Creator stats
    if (!creatorStats[poll.creator]) {
      creatorStats[poll.creator] = { total: 0, count: 0, votes: 0 };
    }
    creatorStats[poll.creator].total += poll.average * poll.totalVotes;
    creatorStats[poll.creator].count += poll.totalVotes;
    creatorStats[poll.creator].votes += poll.totalVotes;

    // Company stats
    if (!companyStats[poll.company]) {
      companyStats[poll.company] = { total: 0, count: 0, votes: 0 };
    }
    companyStats[poll.company].total += poll.average * poll.totalVotes;
    companyStats[poll.company].count += poll.totalVotes;
    companyStats[poll.company].votes += poll.totalVotes;
  });

  // Calculate averages
  const creatorAverages = Object.entries(creatorStats).map(([name, stats]) => ({
    name,
    average: stats.count > 0 ? (stats.total / stats.count).toFixed(2) : 0,
    totalVotes: stats.votes
  })).sort((a, b) => b.average - a.average);

  const companyAverages = Object.entries(companyStats).map(([name, stats]) => ({
    name,
    average: stats.count > 0 ? (stats.total / stats.count).toFixed(2) : 0,
    totalVotes: stats.votes
  })).sort((a, b) => b.average - a.average);

  const resultsSection = document.createElement('div');
  resultsSection.className = 'session-results';
  resultsSection.innerHTML = `
    <h2>Session Complete - Final Results</h2>

    <div class="aggregated-stats">
      <div class="stats-section">
        <h3>Average Rating by Creator</h3>
        <div class="stats-list">
          ${creatorAverages.map(stat => `
            <div class="stat-item">
              <span class="stat-name">${stat.name}</span>
              <span class="stat-value">${stat.average}/10 <small>(${stat.totalVotes} votes)</small></span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="stats-section">
        <h3>Average Rating by Company</h3>
        <div class="stats-list">
          ${companyAverages.map(stat => `
            <div class="stat-item">
              <span class="stat-name">${stat.name}</span>
              <span class="stat-value">${stat.average}/10 <small>(${stat.totalVotes} votes)</small></span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <h3 style="margin-top: 30px;">Individual Poll Results</h3>
    <p>Click on each poll to see detailed results.</p>
    <div id="completedPollsContainer"></div>
    <button onclick="window.location.href='/'" class="btn btn-primary" style="margin-top: 20px;">Back to Home</button>
  `;

  container.appendChild(resultsSection);

  const completedContainer = document.getElementById('completedPollsContainer');
  completedContainer.innerHTML = allPollResults
    .map(
      (poll, index) => `
    <div class="completed-poll-card">
      <div class="completed-poll-header" onclick="togglePollDetails(${index})">
        <h3>Poll ${index + 1}: ${poll.creator} - ${poll.company}</h3>
        <div class="poll-summary">
          <span>Total Votes: ${poll.totalVotes}</span>
          <span>Average: ${poll.average}/10</span>
          <span class="dropdown-arrow" id="arrow-${index}">▼</span>
        </div>
      </div>
      <div class="completed-poll-details hidden" id="details-${index}">
        ${
          poll.votesWithEmails.length > 0
            ? `
          <h4>Individual Votes:</h4>
          ${poll.votesWithEmails
            .map(
              vote => `
            <div class="vote-detail">
              <strong>${vote.email}</strong>: ${vote.rating}/10
            </div>
          `
            )
            .join('')}
          ${poll.exposeThem && poll.lastVoter ? `
          <div style="margin-top: 15px; padding: 10px; background: #fef5e7; border-left: 4px solid #f39c12; border-radius: 4px;">
            <strong>Last to vote:</strong> ${poll.lastVoter.email} 😎
          </div>
          ` : ''}
          ${poll.exposeThemV2 && poll.nonVoters && poll.nonVoters.length > 0 ? `
          <div style="margin-top: 15px; padding: 10px; background: #fee; border-left: 4px solid #e74c3c; border-radius: 4px;">
            <strong>Did NOT vote:</strong> ${poll.nonVoters.join(', ')} 😎
          </div>
          ` : ''}
        `
            : '<p>No votes recorded for this poll.</p>'
        }
      </div>
    </div>
  `
    )
    .join('');
}

function togglePollDetails(index) {
  const details = document.getElementById(`details-${index}`);
  const arrow = document.getElementById(`arrow-${index}`);

  if (details.classList.contains('hidden')) {
    details.classList.remove('hidden');
    arrow.textContent = '▲';
  } else {
    details.classList.add('hidden');
    arrow.textContent = '▼';
  }
}

function copySessionId() {
  navigator.clipboard.writeText(sessionId).then(() => {
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  });
}

// Carousel functions for host view
function renderHostCarouselItem(index) {
  const item = window.hostCarouselItems[index];
  const content = document.getElementById('hostCarouselContent');

  stopVideoEndTimeout(); // Clear any existing timeout
  destroyYouTubeLoopPlayer(); // Clean up any existing YouTube player

  const isGoogleDrive = item.url.includes('drive.google.com');

  if (item.type === 'video' && !isGoogleDrive) {
    // Real video (YouTube) - use regular iframe
    const videoUrl = item.url;
    content.innerHTML = `
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
        <iframe id="hostVideoFrame" src="${videoUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen>
        </iframe>
      </div>
    `;
  } else if (isGoogleDrive) {
    // Google Drive - use iframe preview
    content.innerHTML = `
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
        <iframe src="${item.url}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen>
        </iframe>
      </div>
    `;
  } else {
    // Regular image
    content.innerHTML = `
      <img src="${item.url}" alt="Poll media" style="max-width: 100%; max-height: 500px; display: block; margin: 0 auto; border-radius: 8px;">
    `;
  }

  // Update indicators
  const indicators = document.getElementById('hostCarouselIndicators');
  indicators.innerHTML = window.hostCarouselItems
    .map(
      (_, i) =>
        `<span class="carousel-dot ${i === index ? 'active' : ''}" onclick="hostCarouselGoto(${i})"></span>`
    )
    .join('');
}

function hostCarouselPrev() {
  window.hostCarouselIndex =
    (window.hostCarouselIndex - 1 + window.hostCarouselItems.length) %
    window.hostCarouselItems.length;
  renderHostCarouselItem(window.hostCarouselIndex);
}

function hostCarouselNext() {
  window.hostCarouselIndex = (window.hostCarouselIndex + 1) % window.hostCarouselItems.length;
  renderHostCarouselItem(window.hostCarouselIndex);
}

function hostCarouselGoto(index) {
  window.hostCarouselIndex = index;
  renderHostCarouselItem(index);
}

// Preload all images in carousel for instant navigation
function preloadCarouselImages(mediaItems) {
  mediaItems.forEach(item => {
    if (item.type === 'image') {
      const img = new Image();
      img.src = item.url;
    }
  });
}

// Edit poll function
function editPoll(index) {
  const poll = polls[index];

  // Fill form with poll data
  document.getElementById('pollCreator').value = poll.creator;

  // Check if company exists in the list
  const companySelect = document.getElementById('pollCompany');
  if (companies.includes(poll.company)) {
    companySelect.value = poll.company;
    document.getElementById('pollCompanyCustom').style.display = 'none';
  } else {
    // Company not in list, use custom input
    companySelect.value = '__custom__';
    document.getElementById('pollCompanyCustom').value = poll.company;
    document.getElementById('pollCompanyCustom').style.display = 'block';
  }

  // Convert mediaItems back to URLs (one per line)
  const urls = poll.mediaItems
    .map(item => {
      // Convert embed URLs back to watch/view URLs for better UX
      if (item.type === 'video' && item.url.includes('youtube.com/embed/')) {
        const videoId = item.url.split('/embed/')[1].split('?')[0];
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
      // Convert Google Drive preview URLs back to view URLs
      if (item.type === 'video' && item.url.includes('drive.google.com') && item.url.includes('/preview')) {
        const fileId = item.url.match(/\/file\/d\/([^\/]+)/)[1];
        return `https://drive.google.com/file/d/${fileId}/view`;
      }
      return item.url;
    })
    .join('\n');

  document.getElementById('mediaUrls').value = urls;

  // Set editing mode
  document.getElementById('editingPollIndex').value = index;
  document.getElementById('submitPollBtn').textContent = 'Update Poll';
  document.getElementById('cancelEditBtn').classList.remove('hidden');

  // Scroll to form
  document.getElementById('pollForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Delete poll function
async function deletePoll(index) {
  // Check if delete mode is enabled
  const deleteModeToggle = document.getElementById('deleteModeToggle');
  const isDeleteModeEnabled = deleteModeToggle && deleteModeToggle.checked;

  // Only show confirmation if delete mode is OFF
  if (!isDeleteModeEnabled) {
    if (!confirm(`Are you sure you want to delete Poll ${index + 1}?`)) {
      return;
    }
  }

  try {
    const response = await fetch(`/api/session/${sessionId}/poll/${index}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete poll');
    }

    polls.splice(index, 1);
    updatePollsList();

    if (polls.length === 0) {
      document.getElementById('startVotingBtn').disabled = true;
    }
  } catch (error) {
    console.error('Error deleting poll:', error);
    alert('Error deleting poll: ' + error.message);
  }
}

async function clearAllPolls() {
  if (polls.length === 0) {
    alert('No polls to clear!');
    return;
  }

  if (!confirm(`Are you sure you want to delete all ${polls.length} polls? This cannot be undone.`)) {
    return;
  }

  try {
    // Delete all polls one by one
    for (let i = polls.length - 1; i >= 0; i--) {
      const response = await fetch(`/api/session/${sessionId}/poll/${i}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete poll ${i + 1}`);
      }
    }

    // Clear the polls array
    polls = [];
    updatePollsList();
    document.getElementById('startVotingBtn').disabled = true;

    alert('All polls cleared successfully!');
  } catch (error) {
    console.error('Error clearing polls:', error);
    alert('Error clearing polls: ' + error.message);
  }
}

// Cancel edit function
function cancelEdit() {
  document.getElementById('editingPollIndex').value = '';
  document.getElementById('submitPollBtn').textContent = 'Add Poll';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('pollForm').reset();
  document.getElementById('mediaUrls').value = '';
  document.getElementById('pollCompanyCustom').style.display = 'none';
  document.getElementById('pollCompanyCustom').value = '';
}

// Drag and drop functions for reordering polls
let draggedIndex = null;

function handleDragStart(e) {
  draggedIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  const dropIndex = parseInt(e.currentTarget.dataset.index);

  if (draggedIndex !== dropIndex) {
    // Reorder the polls array
    const draggedPoll = polls[draggedIndex];
    polls.splice(draggedIndex, 1);
    polls.splice(dropIndex, 0, draggedPoll);

    // Update the backend
    savePollOrder();

    // Update the UI
    updatePollsList();
  }

  return false;
}

function handleDragEnd(e) {
  e.currentTarget.style.opacity = '1';

  // Remove drag-over class from all items
  const pollItems = document.querySelectorAll('.poll-item');
  pollItems.forEach(item => {
    item.classList.remove('drag-over');
  });
}

async function savePollOrder() {
  try {
    const response = await fetch(`/api/session/${sessionId}/reorder-polls`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polls })
    });

    if (!response.ok) {
      throw new Error('Failed to save poll order');
    }
  } catch (error) {
    console.error('Error saving poll order:', error);
    alert('Error saving poll order: ' + error.message);
  }
}

// Restart session from voting section (during presenting)
async function restartSessionFromVoting() {
  if (!confirm('Restart the session from the beginning? This will clear all votes and start from Poll 1.')) {
    return;
  }

  try {
    stopPolling();
    stopAutoCarousel();
    stopVideoEndTimeout();

    // Clear all votes via API
    await fetch(`/api/session/${sessionId}/clear-votes`, {
      method: 'POST'
    });

    // Clear chat messages
    await fetch(`/api/session/${sessionId}/chat`, {
      method: 'DELETE'
    });

    // Reset session status to draft
    await fetch(`/api/session/${sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restart: true })
    });

    // Reset local state
    currentPollIndex = -1;
    currentPoll = null;
    hasReachedThreshold = false;
    completedPolls.length = 0;

    // Start from poll 0
    await startPoll(0);
  } catch (error) {
    console.error('Error restarting session:', error);
    alert('Error restarting session: ' + error.message);
  }
}

// Show resume/restart dialog
function showResumeDialog(pausedAtPollIndex) {
  const modal = document.getElementById('resumeModal');
  const pollNumber = document.getElementById('pausedPollNumber');

  pollNumber.textContent = pausedAtPollIndex + 1;

  modal.classList.remove('hidden');

  // Handle resume button
  document.getElementById('resumeFromPauseBtn').onclick = async () => {
    modal.classList.add('hidden');
    await resumeSession(false, pausedAtPollIndex);
  };

  // Handle restart button
  document.getElementById('restartSessionBtn').onclick = async () => {
    modal.classList.add('hidden');
    await resumeSession(true, pausedAtPollIndex);
  };
}

// Resume session (with or without restart)
async function resumeSession(restart, pausedAtPollIndex) {
  try {
    const response = await fetch(`/api/session/${sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restart })
    });

    if (!response.ok) {
      throw new Error('Failed to resume session');
    }

    // Get session data to restore attendance
    const sessionResponse = await fetch(`/api/session/${sessionId}`);
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      // Use server value, fall back to input value if server has 0
      const inputAttendance = parseInt(document.getElementById('expectedAttendanceInput').value) || 10;
      expectedAttendance = sessionData.expectedAttendance || inputAttendance;
      totalVotersInSession = expectedAttendance;

      // Update attendance display
      const attendanceDisplay = document.getElementById('currentAttendance');
      if (attendanceDisplay) {
        attendanceDisplay.textContent = expectedAttendance;
      }

      // Save attendance to server if it was 0
      if (!sessionData.expectedAttendance) {
        await fetch(`/api/session/${sessionId}/attendance`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendance: expectedAttendance })
        });
      }
    }

    // Hide setup, show voting
    document.getElementById('setupSection').classList.add('hidden');
    document.getElementById('votingSection').classList.remove('hidden');

    // Start from appropriate poll
    const startIndex = restart ? 0 : pausedAtPollIndex;
    await startPoll(startIndex);
  } catch (error) {
    console.error('Error resuming session:', error);
    alert('Error resuming session: ' + error.message);
  }
}

// Pause session when navigating back to setup
async function pauseSession() {
  try {
    await fetch(`/api/session/${sessionId}/pause`, {
      method: 'POST'
    });
  } catch (error) {
    console.error('Error pausing session:', error);
  }
}

// Detect when user is in voting section and navigates away
window.addEventListener('beforeunload', (e) => {
  // Check if voting section is visible (session is active)
  const votingSection = document.getElementById('votingSection');
  if (votingSection && !votingSection.classList.contains('hidden')) {
    console.log('Pausing session via beforeunload');
    // Session is active, pause it
    // Use sendBeacon for reliable sending during page unload
    const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
    navigator.sendBeacon(`/api/session/${sessionId}/pause`, blob);
  }
});

// Also detect navigation via pagehide (more reliable for mobile/navigation)
window.addEventListener('pagehide', (e) => {
  const votingSection = document.getElementById('votingSection');
  if (votingSection && !votingSection.classList.contains('hidden')) {
    console.log('Pausing session via pagehide');
    const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
    navigator.sendBeacon(`/api/session/${sessionId}/pause`, blob);
  }
}, { capture: true });

// ========================================
// Host Voter Status Panel
// ========================================

let hostVoterStatusInterval = null;

function startHostVoterStatusPolling() {
  if (hostVoterStatusInterval) {
    clearInterval(hostVoterStatusInterval);
  }

  // Initial fetch
  fetchHostVoterStatuses();

  // Poll every 2 seconds
  hostVoterStatusInterval = setInterval(fetchHostVoterStatuses, 2000);
}

async function fetchHostVoterStatuses() {
  try {
    const response = await fetch(`/api/session/${sessionId}/voter-statuses`);
    const data = await response.json();

    if (data.success) {
      renderHostVoterList(data.readyVoters, data.voterStatuses);
    }
  } catch (error) {
    console.error('Error fetching voter statuses:', error);
  }
}

function renderHostVoterList(readyVoters, voterStatuses) {
  const voterList = document.getElementById('hostVoterList');
  const voterCountBadge = document.getElementById('hostVoterCountBadge');

  if (!voterList) return;

  voterCountBadge.textContent = readyVoters.length;

  voterList.innerHTML = readyVoters.map(name => {
    const statusData = voterStatuses[name];
    let statusClass = '';
    let statusIcon = '';

    if (statusData) {
      switch (statusData.status) {
        case 'speaking':
          statusClass = 'voter-speaking';
          statusIcon = '👋';
          break;
        case 'ready':
          statusClass = 'voter-ready';
          statusIcon = '✓';
          break;
        case 'notReady':
          statusClass = 'voter-not-ready';
          statusIcon = '✗';
          break;
      }
    }

    return `
      <div class="voter-item ${statusClass}">
        <span class="voter-name">${name}</span>
        <span class="voter-status-icon">${statusIcon}</span>
      </div>
    `;
  }).join('');
}
