const sessionId = window.location.pathname.split('/')[2];

let currentPoll = null;
const voterId = localStorage.getItem(`voterId_${sessionId}`);
const voterName = localStorage.getItem(`voterEmail_${sessionId}`);
let pollingInterval = null;
let lastPollId = null;
let timerInterval = null;
let isVoterTimerPaused = false;

// Authorized voters who can pause/skip
const authorizedVoters = ['Karol Trojanowski', 'Adrielle Souza'];
const isAuthorizedVoter = authorizedVoters.includes(voterName);

if (!voterId) {
  window.location.href = '/join-session';
}

// Show admin controls for authorized voters
if (isAuthorizedVoter) {
  const adminControls = document.getElementById('adminControls');
  if (adminControls) {
    adminControls.classList.remove('hidden');
    adminControls.style.display = 'flex';
  }
}

const ratingSlider = document.getElementById('ratingSlider');
const ratingInput = document.getElementById('ratingInput');

ratingSlider.addEventListener('input', e => {
  ratingInput.value = e.target.value;
});

ratingInput.addEventListener('input', e => {
  let value = parseInt(e.target.value);
  if (value < 0) value = 0;
  if (value > 10) value = 10;
  ratingInput.value = value;
  ratingSlider.value = value;
});

function displayPoll(poll, hasVoted = false, voterRating = null) {
  currentPoll = poll;

  document.getElementById('waitingScreen').classList.add('hidden');
  document.getElementById('votingScreen').classList.remove('hidden');

  document.getElementById('pollTitle').textContent = `${currentPoll.creator} - ${currentPoll.company}`;

  // Always reset timer display first, before starting new timer
  const timerText = document.getElementById('timerText');
  const timerDisplay = document.getElementById('timerDisplay');

  if (timerText && timerDisplay) {
    // Clear any existing timer interval
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Reset to default state
    timerText.innerHTML = 'Time remaining: <strong id="timerValue">60</strong>s';
    timerDisplay.style.background = '#48bb78';
    timerDisplay.style.color = 'white';
  }

  // Start timer if poll has one
  if (currentPoll.timer && currentPoll.startTime) {
    const elapsed = Math.floor((Date.now() - currentPoll.startTime) / 1000);
    const timeLeft = Math.max(0, currentPoll.timer - elapsed);
    startTimer(timeLeft);
  }

  // Render carousel for media items
  const mediaContainer = document.getElementById('pollMedia');

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
        <button class="carousel-arrow carousel-prev" onclick="voterCarouselPrev()">‹</button>
        <div class="carousel-content" id="voterCarouselContent"></div>
        <button class="carousel-arrow carousel-next" onclick="voterCarouselNext()">›</button>
      </div>
      <div class="carousel-indicators" id="voterCarouselIndicators"></div>
    `;

    window.voterCarouselIndex = 0;
    window.voterCarouselItems = currentPoll.mediaItems;

    // Preload all images in the carousel
    preloadCarouselImages(currentPoll.mediaItems);

    renderVoterCarouselItem(0);
  }

  // Track voting status
  ratingSlider.dataset.hasVoted = hasVoted ? 'true' : 'false';

  if (hasVoted && voterRating !== null) {
    ratingSlider.value = voterRating;
    ratingInput.value = voterRating;
    ratingSlider.disabled = true;
    ratingInput.disabled = true;
    document.getElementById('submitRatingBtn').disabled = true;

    const messageDiv = document.getElementById('submitMessage');
    messageDiv.textContent = `You already submitted your rating: ${voterRating}/10`;
    messageDiv.className = 'submit-message success';
    messageDiv.classList.remove('hidden');
  } else {
    ratingSlider.value = 5;
    ratingInput.value = 5;

    // Check if timer has expired
    if (currentPoll.timer && currentPoll.startTime) {
      const elapsed = Math.floor((Date.now() - currentPoll.startTime) / 1000);
      const timeLeft = Math.max(0, currentPoll.timer - elapsed);

      if (timeLeft <= 0) {
        // Timer expired - disable voting
        disableVotingControls();
      } else {
        // Timer still active - enable voting
        ratingSlider.disabled = false;
        ratingInput.disabled = false;
        document.getElementById('submitMessage').classList.add('hidden');
        document.getElementById('submitRatingBtn').disabled = false;
      }
    } else {
      // No timer - enable voting
      ratingSlider.disabled = false;
      ratingInput.disabled = false;
      document.getElementById('submitMessage').classList.add('hidden');
      document.getElementById('submitRatingBtn').disabled = false;
    }
  }
}

async function checkForPoll() {
  try {
    const response = await fetch(`/api/session/${sessionId}/current-poll?voterId=${voterId}`);

    if (!response.ok) {
      console.error('Failed to fetch current poll:', response.status);
      return;
    }

    const data = await response.json();

    if (data.currentPoll) {
      if (lastPollId !== data.currentPoll.id) {
        lastPollId = data.currentPoll.id;
        displayPoll(data.currentPoll, data.hasVoted, data.voterRating);
      }
    } else {
      // No active poll - show appropriate waiting screen
      currentPoll = null;
      lastPollId = null;

      // Check if session is completed
      if (data.status === 'completed') {
        showEndScreen();
      } else if (data.status === 'paused') {
        showWaitingScreen(
          'Session Paused',
          'The host has paused the session. Please wait while they resume.'
        );
      } else if (!data.sessionStarted) {
        // Session hasn't started yet
        showWaitingScreen(
          'Waiting for host to start the session...',
          `The session has ${data.totalPolls} poll${data.totalPolls !== 1 ? 's' : ''} ready. Please wait for the host to begin.`
        );
      } else {
        // Session started but between polls or finished
        if (data.totalPolls > 0) {
          showWaitingScreen('Waiting for next poll...', 'The host will start the next poll shortly.');
        } else {
          showWaitingScreen('Session ended', 'Thank you for participating!');
        }
      }
    }
  } catch (error) {
    console.error('Error checking for poll:', error);
  }
}

function showWaitingScreen(title, subtitle) {
  document.getElementById('waitingTitle').textContent = title;
  document.getElementById('waitingSubtitle').textContent = subtitle;
  document.getElementById('waitingScreen').classList.remove('hidden');
  document.getElementById('votingScreen').classList.add('hidden');
  document.getElementById('endScreen').classList.add('hidden');
}

function showEndScreen() {
  document.getElementById('endScreen').classList.remove('hidden');
  document.getElementById('waitingScreen').classList.add('hidden');
  document.getElementById('votingScreen').classList.add('hidden');
}

checkForPoll();
pollingInterval = setInterval(checkForPoll, 2000);

document.getElementById('submitRatingBtn').addEventListener('click', async () => {
  if (!currentPoll) {
    alert('No active poll');
    return;
  }

  // Check if timer has expired
  if (currentPoll.timer && currentPoll.startTime) {
    const elapsed = Math.floor((Date.now() - currentPoll.startTime) / 1000);
    const timeLeft = Math.max(0, currentPoll.timer - elapsed);

    if (timeLeft <= 0) {
      alert('Voting period has ended for this poll');
      disableVotingControls();
      return;
    }
  }

  const rating = parseInt(ratingInput.value);

  try {
    const response = await fetch(`/api/session/${sessionId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId: currentPoll.id,
        voterId: voterId,
        rating: rating
      })
    });

    if (!response.ok) throw new Error('Failed to submit vote');

    const messageDiv = document.getElementById('submitMessage');
    messageDiv.textContent = 'Rating submitted successfully!';
    messageDiv.className = 'submit-message success';
    messageDiv.classList.remove('hidden');

    // Mark as voted
    ratingSlider.dataset.hasVoted = 'true';
    ratingSlider.disabled = true;
    ratingInput.disabled = true;
    document.getElementById('submitRatingBtn').disabled = true;
  } catch (error) {
    const messageDiv = document.getElementById('submitMessage');
    messageDiv.textContent = 'Error submitting rating: ' + error.message;
    messageDiv.className = 'submit-message error';
    messageDiv.classList.remove('hidden');
  }
});

function startTimer(duration) {
  let timeLeft = duration;
  const timerDisplay = document.getElementById('timerDisplay');
  const timerText = document.getElementById('timerText');

  if (!timerDisplay || !timerText) return;

  // Update timer text with actual duration
  timerText.innerHTML = 'Time remaining: <strong id="timerValue">' + timeLeft + '</strong>s';

  // Set color based on initial time
  if (timeLeft <= 10) {
    timerDisplay.style.background = '#e53e3e';
  } else if (timeLeft <= 30) {
    timerDisplay.style.background = '#ed8936';
  } else {
    timerDisplay.style.background = '#48bb78';
  }
  timerDisplay.style.color = 'white';

  // Enable voting controls at start (unless time is already 0)
  if (timeLeft > 0) {
    enableVotingControls();
  } else {
    disableVotingControls();
    timerText.innerHTML = '⏱️ <strong>Voting Closed</strong> - Time expired';
    timerDisplay.style.background = '#718096';
    return; // Don't start interval if already expired
  }

  timerInterval = setInterval(() => {
    timeLeft--;
    const currentTimerValue = document.getElementById('timerValue');
    if (currentTimerValue) {
      currentTimerValue.textContent = timeLeft;
    }

    // Change color as time runs out
    if (timeLeft <= 10) {
      timerDisplay.style.background = '#e53e3e';
    } else if (timeLeft <= 30) {
      timerDisplay.style.background = '#ed8936';
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerDisplay.style.background = '#718096';
      if (currentTimerValue) {
        currentTimerValue.textContent = '0';
      }
      timerText.innerHTML = '⏱️ <strong>Voting Closed</strong> - Time expired';

      // Disable voting when timer expires
      disableVotingControls();
    }
  }, 1000);
}

function disableVotingControls() {
  const ratingSlider = document.getElementById('ratingSlider');
  const ratingInput = document.getElementById('ratingInput');
  const submitBtn = document.getElementById('submitRatingBtn');
  const messageDiv = document.getElementById('submitMessage');

  // Disable controls
  ratingSlider.disabled = true;
  ratingInput.disabled = true;
  submitBtn.disabled = true;

  // Show message if user hasn't voted
  if (!messageDiv.classList.contains('success')) {
    messageDiv.textContent = 'Voting period has ended for this poll';
    messageDiv.className = 'submit-message error';
    messageDiv.classList.remove('hidden');
  }
}

function enableVotingControls() {
  const ratingSlider = document.getElementById('ratingSlider');
  const ratingInput = document.getElementById('ratingInput');
  const submitBtn = document.getElementById('submitRatingBtn');
  const messageDiv = document.getElementById('submitMessage');

  // Only enable if user hasn't voted yet
  const hasVoted = ratingSlider.dataset.hasVoted === 'true';

  if (!hasVoted) {
    ratingSlider.disabled = false;
    ratingInput.disabled = false;
    submitBtn.disabled = false;
    messageDiv.classList.add('hidden');
  }
}

// Carousel functions for voter view
function renderVoterCarouselItem(index) {
  const item = window.voterCarouselItems[index];
  const content = document.getElementById('voterCarouselContent');

  if (item.type === 'video') {
    content.innerHTML = `
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
        <iframe src="${item.url}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>
        </iframe>
      </div>
    `;
  } else {
    content.innerHTML = `
      <img src="${item.url}" alt="Poll media" style="max-width: 100%; max-height: 500px; display: block; margin: 0 auto; border-radius: 8px;">
    `;
  }

  // Update indicators
  const indicators = document.getElementById('voterCarouselIndicators');
  indicators.innerHTML = window.voterCarouselItems
    .map(
      (_, i) =>
        `<span class="carousel-dot ${i === index ? 'active' : ''}" onclick="voterCarouselGoto(${i})"></span>`
    )
    .join('');
}

function voterCarouselPrev() {
  window.voterCarouselIndex =
    (window.voterCarouselIndex - 1 + window.voterCarouselItems.length) %
    window.voterCarouselItems.length;
  renderVoterCarouselItem(window.voterCarouselIndex);
}

function voterCarouselNext() {
  window.voterCarouselIndex = (window.voterCarouselIndex + 1) % window.voterCarouselItems.length;
  renderVoterCarouselItem(window.voterCarouselIndex);
}

function voterCarouselGoto(index) {
  window.voterCarouselIndex = index;
  renderVoterCarouselItem(index);
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

// Expose voting functionality
let hasVotedToExpose = false;
let exposePollingInterval = null;

// Fetch and update expose status
async function fetchExposeStatus() {
  if (!currentPoll) return;

  try {
    // First get the auto-advance state from the server
    const stateResponse = await fetch(`/api/session/${sessionId}/auto-advance-state`);
    const stateData = await stateResponse.json();

    // Update pause button state for authorized voters
    if (isAuthorizedVoter) {
      const pauseBtn = document.getElementById('voterPauseBtn');
      if (stateData.timerPaused !== isVoterTimerPaused) {
        isVoterTimerPaused = stateData.timerPaused;
        if (isVoterTimerPaused) {
          pauseBtn.textContent = 'Resume';
          pauseBtn.style.background = '#48bb78';
        } else {
          pauseBtn.textContent = 'Pause';
          pauseBtn.style.background = '#ed8936';
        }
      }
    }

    // Update timer display if paused
    const timerText = document.getElementById('timerText');
    const timerDisplay = document.getElementById('timerDisplay');
    if (stateData.timerPaused && timerText && timerDisplay) {
      if (!timerText.innerHTML.includes('PAUSED')) {
        const currentTime = stateData.pausedTimeLeft || document.getElementById('timerValue')?.textContent || '0';
        timerText.innerHTML = '⏸️ PAUSED - <strong id="timerValue">' + currentTime + '</strong>s';
        timerDisplay.style.background = '#718096';
      }
    }

    const response = await fetch(`/api/session/${sessionId}/expose-status/${currentPoll.id}?voterId=${voterId}&autoAdvanceOn=${stateData.autoAdvanceOn}&countdownStarted=${stateData.countdownStarted}`);
    const data = await response.json();

    // Update vote counts
    document.getElementById('exposeVoteCount').textContent = data.exposeVoteCount;
    document.getElementById('exposeVoteNeeded').textContent = data.thresholdNeeded;

    // Update button state
    hasVotedToExpose = data.hasVotedToExpose;
    const exposeBtn = document.getElementById('voteExposeBtn');
    if (hasVotedToExpose) {
      exposeBtn.textContent = 'Voted';
      exposeBtn.disabled = true;
      exposeBtn.style.background = '#c3e6cb';
      exposeBtn.style.color = '#155724';
    }

    // Show exposed result if shouldReveal is true
    if (data.shouldReveal && data.exposedData) {
      const resultDiv = document.getElementById('exposedResult');
      const titleEl = document.getElementById('exposedTitle');
      const namesEl = document.getElementById('exposedNames');

      resultDiv.classList.remove('hidden');

      if (data.exposedData.type === 'lastVoter') {
        titleEl.textContent = 'Last Voter Revealed!';
        namesEl.textContent = data.exposedData.name;
      } else if (data.exposedData.type === 'nonVoters') {
        titleEl.textContent = 'Who Hasn\'t Voted Yet:';
        if (data.exposedData.names.length > 0) {
          namesEl.textContent = data.exposedData.names.join(', ');
        } else {
          namesEl.textContent = 'Everyone has voted!';
        }
      }
    } else if (data.thresholdReached && !data.shouldReveal) {
      // Threshold reached but waiting for countdown
      const resultDiv = document.getElementById('exposedResult');
      resultDiv.classList.remove('hidden');
      document.getElementById('exposedTitle').textContent = 'Threshold Reached!';
      document.getElementById('exposedNames').textContent = 'Waiting for countdown to reveal...';
      resultDiv.style.background = '#fff3cd';
    } else {
      document.getElementById('exposedResult').classList.add('hidden');
    }
  } catch (error) {
    console.error('Error fetching expose status:', error);
  }
}

// Handle vote to expose button click
document.getElementById('voteExposeBtn').addEventListener('click', async () => {
  if (!currentPoll || hasVotedToExpose) return;

  try {
    const response = await fetch(`/api/session/${sessionId}/vote-expose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId: currentPoll.id,
        voterId: voterId
      })
    });

    const data = await response.json();

    if (data.success) {
      hasVotedToExpose = true;
      const exposeBtn = document.getElementById('voteExposeBtn');
      exposeBtn.textContent = 'Voted';
      exposeBtn.disabled = true;
      exposeBtn.style.background = '#c3e6cb';
      exposeBtn.style.color = '#155724';

      // Update counts immediately
      document.getElementById('exposeVoteCount').textContent = data.exposeVoteCount;
    }
  } catch (error) {
    console.error('Error voting to expose:', error);
  }
});

// Start expose polling when a poll is displayed
function startExposePolling() {
  if (exposePollingInterval) {
    clearInterval(exposePollingInterval);
  }

  // Reset expose state for new poll
  hasVotedToExpose = false;
  const exposeBtn = document.getElementById('voteExposeBtn');
  exposeBtn.textContent = 'Vote to Reveal';
  exposeBtn.disabled = false;
  exposeBtn.style.background = '#ffc107';
  exposeBtn.style.color = '#856404';

  // Reset exposed result
  const resultDiv = document.getElementById('exposedResult');
  resultDiv.classList.add('hidden');
  resultDiv.style.background = '#f8d7da'; // Reset to default color

  // Initial fetch
  fetchExposeStatus();

  // Poll every 2 seconds
  exposePollingInterval = setInterval(fetchExposeStatus, 2000);
}

// Modify displayPoll to start expose polling
const originalDisplayPoll = displayPoll;
displayPoll = function(poll, hasVoted, voterRating) {
  originalDisplayPoll(poll, hasVoted, voterRating);
  startExposePolling();
};

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (exposePollingInterval) {
    clearInterval(exposePollingInterval);
  }
});

// Voter pause/resume timer (for authorized voters)
async function voterTogglePause() {
  if (!isAuthorizedVoter) return;

  const pauseBtn = document.getElementById('voterPauseBtn');

  if (isVoterTimerPaused) {
    // Resume timer
    try {
      const response = await fetch(`/api/session/${sessionId}/resume-timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterName })
      });

      if (response.ok) {
        isVoterTimerPaused = false;
        pauseBtn.textContent = 'Pause';
        pauseBtn.style.background = '#ed8936';
      }
    } catch (error) {
      console.error('Error resuming timer:', error);
    }
  } else {
    // Pause timer - get current time from display
    const timerValue = document.getElementById('timerValue');
    const currentTime = timerValue ? parseInt(timerValue.textContent) : 0;

    try {
      const response = await fetch(`/api/session/${sessionId}/pause-timer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voterName, timeLeft: currentTime })
      });

      if (response.ok) {
        isVoterTimerPaused = true;
        pauseBtn.textContent = 'Resume';
        pauseBtn.style.background = '#48bb78';
      }
    } catch (error) {
      console.error('Error pausing timer:', error);
    }
  }
}

// Voter skip poll (for authorized voters)
async function voterSkipPoll() {
  if (!isAuthorizedVoter) return;

  if (!confirm('Skip to the next poll?')) return;

  try {
    await fetch(`/api/session/${sessionId}/skip-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterName })
    });

    // The host will handle the actual skip, voter just triggers it
  } catch (error) {
    console.error('Error skipping poll:', error);
  }
}
