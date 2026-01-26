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
let autoAdvanceEnabled = false;
let totalVotersInSession = 0;
let hasReachedThreshold = false;
let autoCarouselInterval = null;
let videoEndTimeout = null;

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

  const timer = parseInt(document.getElementById('pollTimer').value) || 60;
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
          timer,
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
          timer,
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
      document.getElementById('pollTimer').value = 60;
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

function updatePollsList() {
  const container = document.getElementById('pollsContainer');
  container.innerHTML = polls
    .map(
      (poll, index) => `
    <div class="poll-item" draggable="true" data-index="${index}">
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
        <span style="margin-left: 10px; color: #666;">(${poll.mediaItems.length} media item${poll.mediaItems.length > 1 ? 's' : ''}, ${poll.timer}s timer)</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="editPoll(${index})" class="btn btn-small btn-secondary">Edit</button>
        <button onclick="deletePoll(${index})" class="btn btn-small btn-danger">Delete</button>
      </div>
    </div>
  `
    )
    .join('');

  // Add drag and drop event listeners
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

  // Get total number of voters for threshold calculation
  try {
    const sessionResponse = await fetch(`/api/session/${sessionId}`);
    const sessionData = await sessionResponse.json();
    totalVotersInSession = sessionData.totalVoters || 0;
  } catch (error) {
    console.error('Error getting session data:', error);
  }

  // Normal start - hide setup, show voting
  document.getElementById('setupSection').classList.add('hidden');
  document.getElementById('votingSection').classList.remove('hidden');

  await startPoll(0);
});

let timerInterval = null;

async function startPoll(pollIndex) {
  try {
    const response = await fetch(`/api/session/${sessionId}/start/${pollIndex}`, {
      method: 'POST'
    });

    if (!response.ok) throw new Error('Failed to start poll');

    currentPollIndex = pollIndex;
    currentPoll = polls[pollIndex];

    document.getElementById('currentPollTitle').textContent = `${currentPoll.creator} - ${currentPoll.company}`;

    // Render carousel for media items
    const mediaContainer = document.getElementById('currentPollMedia');

    if (currentPoll.mediaItems.length === 1) {
      // Single item - no carousel needed
      const item = currentPoll.mediaItems[0];
      if (item.type === 'video') {
        mediaContainer.innerHTML = `
          <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
            <iframe src="${item.url}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>
            </iframe>
          </div>
        `;
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

      // Start auto-carousel if enabled (check toggle state)
      const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
      if (autoAdvanceToggle && autoAdvanceToggle.checked) {
        startAutoCarousel();
      }
    }

    document.getElementById('totalVotes').textContent = '0';
    document.getElementById('averageRating').textContent = '-';
    document.getElementById('ratingsList').innerHTML = '';
    document.getElementById('pollProgress').textContent =
      `Poll ${pollIndex + 1} of ${polls.length}`;

    // Reset the expose them checkboxes for this poll
    const exposeThemCheckbox = document.getElementById('exposeThem');
    if (exposeThemCheckbox) {
      exposeThemCheckbox.checked = currentPoll.exposeThem || false;
    }

    const exposeThemV2Checkbox = document.getElementById('exposeThemV2');
    if (exposeThemV2Checkbox) {
      exposeThemV2Checkbox.checked = currentPoll.exposeThemV2 || false;
    }

    // Add toggle listener to stop carousel/video timeouts when turned off
    const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
    if (autoAdvanceToggle) {
      // Remove any existing listener to avoid duplicates
      autoAdvanceToggle.removeEventListener('change', handleToggleChange);
      autoAdvanceToggle.addEventListener('change', handleToggleChange);
    }

    // Start timer countdown
    startTimer(currentPoll.timer);

    startPolling();

    const nextBtn = document.getElementById('nextPollBtn');
    if (pollIndex >= polls.length - 1) {
      nextBtn.textContent = 'Finish Session';
      nextBtn.onclick = async () => {
        stopPolling();
        stopTimer();
        await saveCompletedPoll();
        await showSessionResults();
      };
    } else {
      nextBtn.textContent = 'Next Poll';
      nextBtn.onclick = async () => {
        stopPolling();
        stopTimer();
        await saveCompletedPoll();
        startPoll(pollIndex + 1);
      };
    }
  } catch (error) {
    alert('Error starting poll: ' + error.message);
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

function startTimer(duration) {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  let timeLeft = duration;
  hasReachedThreshold = false;
  const timerValue = document.getElementById('timerValue');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerText = document.getElementById('timerText');

  // Check if timer elements exist
  if (!timerValue || !timerDisplay || !timerText) {
    console.error('Timer elements not found in DOM');
    return;
  }

  timerValue.textContent = timeLeft;
  timerDisplay.style.background = '#48bb78';
  timerDisplay.style.color = 'white';
  timerText.textContent = 'Time remaining: ';

  timerInterval = setInterval(() => {
    // Check current state of auto-advance toggle (can be changed during poll)
    const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
    const isAutoAdvanceEnabled = autoAdvanceToggle ? autoAdvanceToggle.checked : false;

    // Check if we've reached 70% threshold in auto-advance mode
    if (isAutoAdvanceEnabled && !hasReachedThreshold && totalVotersInSession > 0) {
      const totalVotesElement = document.getElementById('totalVotes');
      const currentVotes = parseInt(totalVotesElement.textContent) || 0;
      const threshold = Math.ceil(totalVotersInSession * 0.7);

      if (currentVotes >= threshold) {
        // Switch to 10-second countdown
        hasReachedThreshold = true;
        timeLeft = 10;
        timerText.textContent = '70% voted! Auto-advancing in: ';
        timerDisplay.style.background = '#667eea';
        timerValue.textContent = timeLeft;
        return; // Skip the rest of this interval
      }
    }

    if (!hasReachedThreshold) {
      // Normal countdown
      timeLeft--;
      timerValue.textContent = timeLeft;

      // Change color as time runs out
      if (timeLeft <= 10) {
        timerDisplay.style.background = '#e53e3e';
      } else if (timeLeft <= 30) {
        timerDisplay.style.background = '#ed8936';
      }
    } else {
      // Threshold reached, 10-second countdown
      timeLeft--;
      timerValue.textContent = timeLeft;
      timerDisplay.style.background = '#667eea';
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerDisplay.style.background = '#718096';
      timerValue.textContent = '0';

      // Auto-advance if enabled and threshold was reached
      const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
      const isAutoAdvanceEnabled = autoAdvanceToggle ? autoAdvanceToggle.checked : false;

      if (isAutoAdvanceEnabled && hasReachedThreshold) {
        setTimeout(async () => {
          const nextBtn = document.getElementById('nextPollBtn');
          if (nextBtn) {
            nextBtn.click();
          }
        }, 500);
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
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

function handleToggleChange(event) {
  const isEnabled = event.target.checked;

  if (!isEnabled) {
    // Toggle turned off - stop all auto-advance features
    stopAutoCarousel();
    stopVideoEndTimeout();
  } else {
    // Toggle turned on - restart carousel if applicable
    if (window.hostCarouselItems && window.hostCarouselItems.length > 1) {
      const currentItem = window.hostCarouselItems[window.hostCarouselIndex];
      // Only start carousel if current item is not a video
      if (currentItem && currentItem.type !== 'video') {
        startAutoCarousel();
      }
      // If current item is a video, set up video end timeout
      if (currentItem && currentItem.type === 'video') {
        stopVideoEndTimeout(); // Clear any existing
        const estimatedVideoDuration = 60000;
        const bufferAfterVideo = 5000;
        videoEndTimeout = setTimeout(() => {
          const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
          const isStillEnabled = autoAdvanceToggle ? autoAdvanceToggle.checked : false;
          if (isStillEnabled) {
            hostCarouselNext();
          }
        }, estimatedVideoDuration + bufferAfterVideo);
      }
    }
  }
}

async function updateResults() {
  if (!currentPoll) return;

  try {
    const response = await fetch(`/api/session/${sessionId}/results/${currentPoll.id}`);
    const data = await response.json();

    document.getElementById('totalVotes').textContent = data.totalVotes;
    document.getElementById('averageRating').textContent = data.average;

    // Hide individual ratings during live voting
    const ratingsList = document.getElementById('ratingsList');
    ratingsList.innerHTML = '';
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
    // Save the exposeThem and exposeThemV2 status from the checkboxes to the current poll
    const exposeThemCheckbox = document.getElementById('exposeThem');
    const exposeThemValue = exposeThemCheckbox ? exposeThemCheckbox.checked : false;

    const exposeThemV2Checkbox = document.getElementById('exposeThemV2');
    const exposeThemV2Value = exposeThemV2Checkbox ? exposeThemV2Checkbox.checked : false;

    // Update the poll with exposeThem and exposeThemV2 status
    const pollIndex = polls.findIndex(p => p.id === currentPoll.id);
    if (pollIndex !== -1) {
      const updateResponse = await fetch(`/api/session/${sessionId}/poll/${pollIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: currentPoll.creator,
          company: currentPoll.company,
          mediaItems: currentPoll.mediaItems,
          timer: currentPoll.timer,
          exposeThem: exposeThemValue,
          exposeThemV2: exposeThemV2Value
        })
      });

      if (updateResponse.ok) {
        const updatedData = await updateResponse.json();
        polls[pollIndex] = updatedData.poll;
        currentPoll.exposeThem = exposeThemValue;
        currentPoll.exposeThemV2 = exposeThemV2Value;
      }
    }

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
  document.getElementById('votingSection').classList.add('hidden');

  // Mark session as completed
  try {
    await fetch(`/api/session/${sessionId}/complete`, {
      method: 'POST'
    });
  } catch (error) {
    console.error('Error marking session as completed:', error);
  }

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

  if (item.type === 'video') {
    // Check if auto-advance is currently enabled
    const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
    const isAutoAdvanceEnabled = autoAdvanceToggle ? autoAdvanceToggle.checked : false;

    // Add autoplay parameter if auto-advance is enabled
    let videoUrl = item.url;
    if (isAutoAdvanceEnabled) {
      // For YouTube embeds, add autoplay parameter
      if (videoUrl.includes('youtube.com/embed/')) {
        videoUrl += (videoUrl.includes('?') ? '&' : '?') + 'autoplay=1&mute=0';
      }
      // For Google Drive, we can't directly control autoplay via URL
      // The user will need to click play, but we estimate video length
    }

    content.innerHTML = `
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
        <iframe src="${videoUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>
        </iframe>
      </div>
    `;

    // In auto-advance mode with video carousel, pause auto-carousel
    // and estimate video duration (60 seconds) + 5 second buffer
    if (isAutoAdvanceEnabled && window.hostCarouselItems.length > 1) {
      stopAutoCarousel(); // Stop auto-rotation while video plays
      const estimatedVideoDuration = 60000; // 60 seconds (1 minute)
      const bufferAfterVideo = 5000; // 5 seconds after video ends

      videoEndTimeout = setTimeout(() => {
        // Check if auto-advance is still enabled before advancing
        const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
        const isStillEnabled = autoAdvanceToggle ? autoAdvanceToggle.checked : false;

        if (isStillEnabled) {
          hostCarouselNext();
          // The renderHostCarouselItem function will handle restarting
          // auto-carousel for images automatically
        }
      }, estimatedVideoDuration + bufferAfterVideo);
    }
  } else {
    content.innerHTML = `
      <img src="${item.url}" alt="Poll media" style="max-width: 100%; max-height: 500px; display: block; margin: 0 auto; border-radius: 8px;">
    `;

    // For images in auto-advance mode, ensure carousel keeps running
    const autoAdvanceToggle = document.getElementById('autoAdvanceToggle');
    const isAutoAdvanceEnabled = autoAdvanceToggle ? autoAdvanceToggle.checked : false;
    if (isAutoAdvanceEnabled && window.hostCarouselItems && window.hostCarouselItems.length > 1) {
      // Restart auto-carousel if it's not running (ensures continuous rotation)
      if (!autoCarouselInterval) {
        startAutoCarousel();
      }
    }
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

  document.getElementById('pollTimer').value = poll.timer;

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
  document.getElementById('pollTimer').value = 60;
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
