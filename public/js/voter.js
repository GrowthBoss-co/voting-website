const sessionId = window.location.pathname.split('/')[2];

let currentPoll = null;
const voterId = localStorage.getItem(`voterId_${sessionId}`);
const voterName = localStorage.getItem(`voterEmail_${sessionId}`);
let pollingInterval = null;
let lastPollId = null;
let timerInterval = null;
let isVoterTimerPaused = false;
let hasMovedToFeedback = false; // Track if user has moved past top10 to feedback
let hasShownTop10 = false; // Track if top10 has already been shown

// Poll navigation state
let viewingPollIndex = null; // null = viewing current/live poll, number = viewing past poll
let totalPolls = 0;
let livePollIndex = -1; // Track the live poll index

// Authorized voters who can pause/skip/toggle auto-advance
const authorizedVoters = ['Karol Trojanowski', 'Adrielle Silva', 'Henry Dutra'];
// Case-insensitive and trimmed comparison
const isAuthorizedVoter = voterName && authorizedVoters.some(
  name => name.toLowerCase().trim() === voterName.toLowerCase().trim()
);

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

// Check if a URL is a YouTube Short
function isYouTubeShort(url) {
  if (!url) return false;
  // Shorts can be in /shorts/ URL format or embed format with shorts
  return url.includes('/shorts/') || url.includes('youtube.com/embed/') && url.includes('shorts');
}

// Convert YouTube Shorts URL to embed format
function getShortsEmbedUrl(url) {
  // If already an embed URL, return as is
  if (url.includes('youtube.com/embed/')) {
    return url;
  }
  // Extract video ID from /shorts/ URL
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch) {
    return `https://www.youtube.com/embed/${shortsMatch[1]}`;
  }
  return url;
}

function displayPoll(poll, hasVoted = false, voterRating = null) {
  currentPoll = poll;

  document.getElementById('waitingScreen').classList.add('hidden');
  document.getElementById('votingScreen').classList.remove('hidden');

  document.getElementById('pollTitle').textContent = `${currentPoll.creator} - ${currentPoll.company}`;

  // Check if this poll contains YouTube Shorts
  const hasShorts = currentPoll.mediaItems.some(item =>
    item.type === 'video' && isYouTubeShort(item.url)
  );

  // Apply or remove shorts layout class
  const votingScreen = document.getElementById('votingScreen');
  const ratingSection = document.querySelector('.rating-section');
  const exposeSection = document.getElementById('exposeSection');

  // Handle shorts layout wrapper
  let shortsRightPanel = votingScreen.querySelector('.shorts-right-panel');

  if (hasShorts && currentPoll.mediaItems.length === 1) {
    votingScreen.classList.add('shorts-layout');

    // Create wrapper for right side elements if not exists
    if (!shortsRightPanel) {
      shortsRightPanel = document.createElement('div');
      shortsRightPanel.className = 'shorts-right-panel';

      // Move rating section and expose section into the wrapper
      if (ratingSection && exposeSection) {
        ratingSection.parentNode.insertBefore(shortsRightPanel, ratingSection);
        shortsRightPanel.appendChild(ratingSection);
        shortsRightPanel.appendChild(exposeSection);
      }
    }
  } else {
    votingScreen.classList.remove('shorts-layout');

    // Unwrap elements if wrapper exists
    if (shortsRightPanel) {
      const mediaContainer = document.getElementById('pollMedia');
      if (mediaContainer && ratingSection) {
        mediaContainer.parentNode.insertBefore(ratingSection, shortsRightPanel);
      }
      if (mediaContainer && exposeSection) {
        ratingSection.parentNode.insertBefore(exposeSection, shortsRightPanel);
        exposeSection.parentNode.removeChild(shortsRightPanel);
      }
    }
  }

  // Always reset timer display first, before starting new timer
  const timerText = document.getElementById('timerText');
  const timerDisplay = document.getElementById('timerDisplay');

  if (timerText && timerDisplay) {
    // Clear any existing timer interval
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Reset saved time state for new poll
    voterSavedTimeLeft = null;
    isVoterTimerPaused = false;

    // Reset to default state
    timerText.innerHTML = 'Time remaining: <strong id="timerValue">60</strong>s';
    timerDisplay.style.background = '#48bb78';
    timerDisplay.style.color = 'white';
    timerDisplay.style.display = 'block';
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
      // Check if it's a YouTube Short
      if (isYouTubeShort(item.url)) {
        const embedUrl = getShortsEmbedUrl(item.url);
        mediaContainer.innerHTML = `
          <div class="shorts-video-container">
            <iframe src="${embedUrl}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen>
            </iframe>
          </div>
        `;
      } else {
        mediaContainer.innerHTML = `
          <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
            <iframe src="${item.url}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen>
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

    // Always enable voting controls initially - the timer will handle disabling if needed
    // This prevents issues with auto-advance mode where timer shouldn't disable voting
    ratingSlider.disabled = false;
    ratingInput.disabled = false;
    document.getElementById('submitMessage').classList.add('hidden');
    document.getElementById('submitRatingBtn').disabled = false;
  }

  // Reload notes if the notes panel is expanded
  if (notesExpanded) {
    loadNotes();
  }
}

async function checkForPoll() {
  // If viewing a past poll, don't auto-update
  if (viewingPollIndex !== null) {
    return;
  }

  try {
    const response = await fetch(`/api/session/${sessionId}/current-poll?voterId=${voterId}`);

    if (!response.ok) {
      console.error('Failed to fetch current poll:', response.status);
      return;
    }

    const data = await response.json();
    console.log('checkForPoll response:', data.status, 'currentPoll:', !!data.currentPoll);

    // Track total polls and live poll index for navigation
    totalPolls = data.totalPolls || 0;
    if (data.pollIndex !== undefined) {
      livePollIndex = data.pollIndex;
    }

    // Check if session is completed FIRST - this takes priority
    if (data.status === 'completed') {
      console.log('Session completed - showing end screen');
      showEndScreen();
      return;
    }

    if (data.currentPoll) {
      if (lastPollId !== data.currentPoll.id) {
        lastPollId = data.currentPoll.id;
        // Restore voting UI if coming back from viewing past polls
        if (viewingPollIndex !== null) {
          restoreVotingUI();
          viewingPollIndex = null;
        }
        displayPoll(data.currentPoll, data.hasVoted, data.voterRating);
        updatePollNavigationUI();
      }
    } else {
      // No active poll - show appropriate waiting screen
      currentPoll = null;
      lastPollId = null;

      if (data.status === 'paused') {
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

// Stop all playing videos (iframes)
function stopAllVideos() {
  // Stop all iframes by setting src to about:blank (most reliable way to stop audio)
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    iframe.src = 'about:blank';
  });
}

function showEndScreen() {
  // Stop polling - session is over
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  // Stop any playing videos first
  stopAllVideos();

  // If user has already moved to feedback, don't bring them back to top10
  if (hasMovedToFeedback) {
    document.getElementById('top10Screen').classList.add('hidden');
    document.getElementById('endScreen').classList.remove('hidden');
    return;
  }

  // If top10 has already been shown, don't re-fetch
  if (hasShownTop10) {
    return;
  }

  hasShownTop10 = true;

  // First show the Top 10 screen, then feedback form
  document.getElementById('waitingScreen').classList.add('hidden');
  document.getElementById('votingScreen').classList.add('hidden');
  document.getElementById('endScreen').classList.add('hidden');
  document.getElementById('top10Screen').classList.remove('hidden');

  // Scroll to top to ensure user sees the new screen
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Fetch and display top 10
  fetchTop10();
}

async function fetchTop10() {
  try {
    const response = await fetch(`/api/session/${sessionId}/top10`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to load top 10');
    }

    renderTop10(data.top10, data.topCreators || (data.topCreator ? [data.topCreator] : null));
  } catch (error) {
    console.error('Error fetching top 10:', error);
    const top10List = document.getElementById('top10List');
    top10List.innerHTML = `
      <div class="loading-top10">
        <p>Could not load results. <a href="#" onclick="fetchTop10(); return false;">Try again</a></p>
      </div>
    `;
  }
}

// Store carousel state for each top10 item
window.top10Carousels = {};

function renderTop10(top10, topCreators) {
  const top10List = document.getElementById('top10List');
  const congratsSection = document.getElementById('topCreatorCongrats');

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

    document.getElementById('topCreatorName').textContent = namesText;
    document.getElementById('topCreatorScore').textContent = topCreators[0].overallAverage.toFixed(2);
    congratsSection.classList.remove('hidden');
  } else {
    congratsSection.classList.add('hidden');
  }

  // Reset carousel state
  window.top10Carousels = {};

  top10List.innerHTML = top10.map((item, index) => {
    const rank = index + 1;
    const mediaItems = item.mediaItems || [];

    // Generate media HTML based on number of items
    let mediaHTML = '';
    if (mediaItems.length === 1) {
      // Single item - display directly
      mediaHTML = renderTop10SingleMedia(mediaItems[0]);
    } else if (mediaItems.length > 1) {
      // Multiple items - create carousel
      window.top10Carousels[index] = { items: mediaItems, currentIndex: 0 };
      mediaHTML = renderTop10Carousel(index, mediaItems);
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

function renderTop10SingleMedia(mediaItem) {
  if (!mediaItem) return '';

  if (mediaItem.type === 'video') {
    let videoUrl = mediaItem.url;

    // Check if YouTube Shorts URL - convert to embed format
    const shortsMatch = videoUrl.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      videoUrl = `https://www.youtube.com/embed/${shortsMatch[1]}`;
    }

    // Check if YouTube embed URL
    const youtubeMatch = videoUrl.match(/youtube\.com\/embed\/([^?&]+)/);
    if (youtubeMatch) {
      return `<iframe src="${videoUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    // Google Drive video
    return `<iframe src="${videoUrl}" allow="autoplay" allowfullscreen></iframe>`;
  } else {
    // Image
    return `<img src="${mediaItem.url}" alt="Content">`;
  }
}

function renderTop10Carousel(carouselIndex, mediaItems) {
  const firstItem = mediaItems[0];
  const indicators = mediaItems.map((_, i) =>
    `<span class="top10-carousel-dot ${i === 0 ? 'active' : ''}" onclick="top10CarouselGoto(${carouselIndex}, ${i})"></span>`
  ).join('');

  return `
    <div class="top10-carousel" id="top10-carousel-${carouselIndex}">
      <div class="top10-carousel-content" id="top10-carousel-content-${carouselIndex}">
        ${renderTop10SingleMedia(firstItem)}
      </div>
      <div class="top10-carousel-arrows">
        <button class="top10-carousel-arrow" onclick="top10CarouselPrev(${carouselIndex})">‹</button>
        <button class="top10-carousel-arrow" onclick="top10CarouselNext(${carouselIndex})">›</button>
      </div>
      <div class="top10-carousel-indicators" id="top10-carousel-indicators-${carouselIndex}">
        ${indicators}
      </div>
    </div>
  `;
}

function top10CarouselPrev(carouselIndex) {
  const carousel = window.top10Carousels[carouselIndex];
  if (!carousel) return;

  carousel.currentIndex = (carousel.currentIndex - 1 + carousel.items.length) % carousel.items.length;
  updateTop10Carousel(carouselIndex);
}

function top10CarouselNext(carouselIndex) {
  const carousel = window.top10Carousels[carouselIndex];
  if (!carousel) return;

  carousel.currentIndex = (carousel.currentIndex + 1) % carousel.items.length;
  updateTop10Carousel(carouselIndex);
}

function top10CarouselGoto(carouselIndex, itemIndex) {
  const carousel = window.top10Carousels[carouselIndex];
  if (!carousel) return;

  carousel.currentIndex = itemIndex;
  updateTop10Carousel(carouselIndex);
}

function updateTop10Carousel(carouselIndex) {
  const carousel = window.top10Carousels[carouselIndex];
  if (!carousel) return;

  const content = document.getElementById(`top10-carousel-content-${carouselIndex}`);
  const indicators = document.getElementById(`top10-carousel-indicators-${carouselIndex}`);

  if (content) {
    content.innerHTML = renderTop10SingleMedia(carousel.items[carousel.currentIndex]);
  }

  if (indicators) {
    const dots = indicators.querySelectorAll('.top10-carousel-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === carousel.currentIndex);
    });
  }
}

// Handle continue to feedback button
document.getElementById('continueToFeedbackBtn').addEventListener('click', () => {
  hasMovedToFeedback = true; // Prevent being brought back to top10
  document.getElementById('top10Screen').classList.add('hidden');
  document.getElementById('endScreen').classList.remove('hidden');
  initializeFeedbackForm();
});

checkForPoll();
pollingInterval = setInterval(checkForPoll, 2000);

// Named function for submitting rating (can be reattached after restoring UI)
async function submitRating() {
  if (!currentPoll) {
    alert('No active poll');
    return;
  }

  const ratingSlider = document.getElementById('ratingSlider');
  const ratingInput = document.getElementById('ratingInput');

  // Check if timer has expired (but skip this check if auto-advance is on)
  if (currentPoll.timer && currentPoll.startTime) {
    // First check auto-advance state
    try {
      const stateResponse = await fetch(`/api/session/${sessionId}/auto-advance-state`);
      const stateData = await stateResponse.json();

      // If auto-advance is ON, always allow voting (no timer expiry)
      if (stateData.autoAdvanceOn) {
        // Voting is allowed, skip timer check
      } else {
        // Check timer normally
        const elapsed = Math.floor((Date.now() - currentPoll.startTime) / 1000);
        const timeLeft = Math.max(0, currentPoll.timer - elapsed);

        if (timeLeft <= 0) {
          alert('Voting period has ended for this poll');
          disableVotingControls();
          return;
        }
      }
    } catch (error) {
      console.error('Error checking auto-advance state:', error);
      // Fall back to timer check
      const elapsed = Math.floor((Date.now() - currentPoll.startTime) / 1000);
      const timeLeft = Math.max(0, currentPoll.timer - elapsed);

      if (timeLeft <= 0) {
        alert('Voting period has ended for this poll');
        disableVotingControls();
        return;
      }
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
}

document.getElementById('submitRatingBtn').addEventListener('click', submitRating);

let voterSavedTimeLeft = null;
let voterAutoAdvanceOn = false;

async function startTimer(duration) {
  let timeLeft = duration;
  voterSavedTimeLeft = duration;
  const timerDisplay = document.getElementById('timerDisplay');
  const timerText = document.getElementById('timerText');

  if (!timerDisplay || !timerText) return;

  // Check initial auto-advance state
  try {
    const stateResponse = await fetch(`/api/session/${sessionId}/auto-advance-state`);
    const stateData = await stateResponse.json();
    voterAutoAdvanceOn = stateData.autoAdvanceOn;
  } catch (error) {
    console.error('Error fetching auto-advance state:', error);
  }

  // If auto-advance is ON, hide timer and always allow voting (host manually advances)
  if (voterAutoAdvanceOn) {
    timerDisplay.style.display = 'none';
    enableVotingControls();
    // Don't return - we need to keep polling for state changes
  } else {
    timerDisplay.style.display = 'block';
  }

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

  // Enable voting controls at start
  // If auto-advance is ON, always enable voting (no timer expiry)
  if (voterAutoAdvanceOn) {
    enableVotingControls();
  } else if (timeLeft > 0) {
    enableVotingControls();
  } else {
    disableVotingControls();
    timerText.innerHTML = '⏱️ <strong>Voting Closed</strong> - Time expired';
    timerDisplay.style.background = '#718096';
    return; // Don't start interval if already expired
  }

  timerInterval = setInterval(async () => {
    // Check for pause state and auto-advance changes
    try {
      const stateResponse = await fetch(`/api/session/${sessionId}/auto-advance-state`);
      const stateData = await stateResponse.json();

      // Handle pause
      if (stateData.timerPaused) {
        return; // Skip this tick if paused
      }

      // Handle auto-advance state changes
      if (stateData.autoAdvanceOn !== voterAutoAdvanceOn) {
        voterAutoAdvanceOn = stateData.autoAdvanceOn;
        if (voterAutoAdvanceOn) {
          // Auto-advance turned ON - hide timer, voting always allowed
          timerDisplay.style.display = 'none';
          voterSavedTimeLeft = timeLeft;
          enableVotingControls();
          return;
        } else {
          // Auto-advance turned OFF - show timer, resume countdown
          timerDisplay.style.display = 'block';
          if (voterSavedTimeLeft !== null) {
            timeLeft = voterSavedTimeLeft;
          }
          timerText.innerHTML = 'Time remaining: <strong id="timerValue">' + timeLeft + '</strong>s';
        }
      }

      // If auto-advance is ON, skip timer countdown (host manually advances)
      if (voterAutoAdvanceOn) {
        return;
      }
    } catch (error) {
      console.error('Error checking state:', error);
    }

    timeLeft--;
    voterSavedTimeLeft = timeLeft;
    const currentTimerValue = document.getElementById('timerValue');
    if (currentTimerValue) {
      currentTimerValue.textContent = timeLeft;
    }

    // Change color as time runs out (only for normal mode)
    if (!voterAutoAdvanceOn || !voterCountdownStarted) {
      if (timeLeft <= 10) {
        timerDisplay.style.background = '#e53e3e';
      } else if (timeLeft <= 30) {
        timerDisplay.style.background = '#ed8936';
      }
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

// Poll navigation functions
async function navigateToPoll(direction) {
  let targetIndex;

  if (direction === 'live') {
    // Go back to live poll
    viewingPollIndex = null;
    await checkForPoll();
    updatePollNavigationUI();
    return;
  } else if (direction === 'prev') {
    const currentViewing = viewingPollIndex !== null ? viewingPollIndex : livePollIndex;
    targetIndex = currentViewing - 1;
  } else if (direction === 'next') {
    const currentViewing = viewingPollIndex !== null ? viewingPollIndex : livePollIndex;
    targetIndex = currentViewing + 1;
  } else {
    targetIndex = parseInt(direction);
  }

  // Bounds check
  if (targetIndex < 0 || targetIndex >= totalPolls) {
    return;
  }

  // If navigating to the live poll, go back to live mode
  if (targetIndex === livePollIndex) {
    viewingPollIndex = null;
    await checkForPoll();
    updatePollNavigationUI();
    return;
  }

  viewingPollIndex = targetIndex;
  await loadPollForViewing(targetIndex);
}

async function loadPollForViewing(pollIndex) {
  try {
    const response = await fetch(`/api/session/${sessionId}/poll/${pollIndex}?voterId=${voterId}`);
    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to load poll:', data.error);
      return;
    }

    // Display the poll in read-only mode
    displayPollForViewing(data.poll, data.hasVoted, data.voterRating, data.results, pollIndex, data.totalPolls);
  } catch (error) {
    console.error('Error loading poll for viewing:', error);
  }
}

function displayPollForViewing(poll, hasVoted, voterRating, results, pollIndex, total) {
  currentPoll = poll;
  totalPolls = total;

  document.getElementById('waitingScreen').classList.add('hidden');
  document.getElementById('votingScreen').classList.remove('hidden');

  document.getElementById('pollTitle').textContent = `${poll.creator} - ${poll.company}`;

  // Clear timer for past polls
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timerDisplay = document.getElementById('timerDisplay');
  timerDisplay.style.display = 'none';

  // Render media
  const mediaContainer = document.getElementById('pollMedia');
  if (poll.mediaItems.length === 1) {
    const item = poll.mediaItems[0];
    if (item.type === 'video') {
      if (isYouTubeShort(item.url)) {
        const embedUrl = getShortsEmbedUrl(item.url);
        mediaContainer.innerHTML = `
          <div class="shorts-video-container">
            <iframe src="${embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>`;
      } else {
        mediaContainer.innerHTML = `
          <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%;">
            <iframe src="${item.url}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
          </div>`;
      }
    } else {
      mediaContainer.innerHTML = `<img src="${item.url}" alt="Poll media" style="max-width: 100%; max-height: 500px; display: block; margin: 0 auto; border-radius: 8px;">`;
    }
  } else {
    mediaContainer.innerHTML = `
      <div class="carousel-container">
        <button class="carousel-arrow carousel-prev" onclick="voterCarouselPrev()">‹</button>
        <div class="carousel-content" id="voterCarouselContent"></div>
        <button class="carousel-arrow carousel-next" onclick="voterCarouselNext()">›</button>
      </div>
      <div class="carousel-indicators" id="voterCarouselIndicators"></div>`;
    window.voterCarouselIndex = 0;
    window.voterCarouselItems = poll.mediaItems;
    renderVoterCarouselItem(0);
  }

  // Show results instead of voting controls for past polls
  const ratingSection = document.querySelector('.rating-section');
  ratingSection.innerHTML = `
    <div style="text-align: center; padding: 20px; background: #f7fafc; border-radius: 8px;">
      <h3 style="margin: 0 0 15px 0; color: #667eea;">Poll Results</h3>
      <div style="display: flex; gap: 20px; justify-content: center; margin-bottom: 15px;">
        <div style="text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #667eea;">${results.average}</div>
          <div style="color: #666; font-size: 14px;">Average Rating</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #48bb78;">${results.totalVotes}</div>
          <div style="color: #666; font-size: 14px;">Total Votes</div>
        </div>
      </div>
      ${hasVoted ? `<p style="color: #48bb78; margin: 0;">Your rating: <strong>${voterRating}/10</strong></p>` : '<p style="color: #666; margin: 0;">You did not vote on this poll</p>'}
    </div>`;

  // Hide expose section for past polls
  const exposeSection = document.getElementById('exposeSection');
  exposeSection.style.display = 'none';

  // Update navigation UI
  updatePollNavigationUI();

  // Reload notes if the notes panel is expanded
  if (notesExpanded) {
    loadNotes();
  }
}

function updatePollNavigationUI() {
  const navContainer = document.getElementById('pollNavigation');
  const navInfo = document.getElementById('pollNavigationInfo');
  const prevBtn = document.getElementById('prevPollBtn');
  const nextBtn = document.getElementById('nextPollBtn');
  const backToLiveBtn = document.getElementById('backToLiveBtn');

  if (totalPolls <= 1 && viewingPollIndex === null) {
    navContainer.classList.add('hidden');
    return;
  }

  navContainer.classList.remove('hidden');

  const currentViewing = viewingPollIndex !== null ? viewingPollIndex : livePollIndex;

  if (viewingPollIndex !== null) {
    navInfo.textContent = `Viewing Poll ${viewingPollIndex + 1} of ${totalPolls} (Past)`;
    navInfo.style.background = '#fff3cd';
    navInfo.style.color = '#856404';
    backToLiveBtn.style.display = 'inline-block';
  } else {
    navInfo.textContent = `Poll ${livePollIndex + 1} of ${totalPolls} (Live)`;
    navInfo.style.background = '#d4edda';
    navInfo.style.color = '#155724';
    backToLiveBtn.style.display = 'none';
  }

  prevBtn.disabled = currentViewing <= 0;
  nextBtn.disabled = currentViewing >= totalPolls - 1;

  prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
  nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
}

function restoreVotingUI() {
  // Restore the original rating section HTML
  const ratingSection = document.querySelector('.rating-section');
  ratingSection.innerHTML = `
    <label for="ratingInput">Your Rating (0-10):</label>
    <div class="rating-input-group">
      <input type="range" id="ratingSlider" min="0" max="10" value="5" />
      <input type="number" id="ratingInput" min="0" max="10" value="5" />
    </div>
    <button id="submitRatingBtn" class="btn btn-primary">Submit Rating</button>
    <div id="submitMessage" class="submit-message hidden"></div>`;

  // Re-attach event listeners
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

  document.getElementById('submitRatingBtn').addEventListener('click', submitRating);

  // Show expose section again
  const exposeSection = document.getElementById('exposeSection');
  exposeSection.style.display = 'block';
}

// Expose voting functionality
let hasVotedToExpose = false;
let exposePollingInterval = null;
let currentExposePollId = null; // Track which poll we're fetching expose status for

// Fetch and update expose status
async function fetchExposeStatus() {
  if (!currentPoll) return;

  const pollIdForThisRequest = currentPoll.id;

  try {
    // First get the auto-advance state from the server
    const stateResponse = await fetch(`/api/session/${sessionId}/auto-advance-state`);
    const stateData = await stateResponse.json();

    // Update pause button and auto-advance toggle state for authorized voters
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

      // Sync auto-advance toggle state
      const autoAdvanceToggle = document.getElementById('voterAutoAdvanceToggle');
      if (autoAdvanceToggle && autoAdvanceToggle.checked !== stateData.autoAdvanceOn) {
        autoAdvanceToggle.checked = stateData.autoAdvanceOn;
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

    const response = await fetch(`/api/session/${sessionId}/expose-status/${pollIdForThisRequest}?voterId=${voterId}&autoAdvanceOn=${stateData.autoAdvanceOn}`);
    const data = await response.json();

    // Ignore response if poll has changed since we made the request
    if (!currentPoll || currentPoll.id !== pollIdForThisRequest) {
      return;
    }

    // Update vote counts
    document.getElementById('exposeVoteCount').textContent = data.exposeVoteCount;
    document.getElementById('exposeVoteNeeded').textContent = data.thresholdNeeded;

    // Update button state only if this is for the current poll
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
      // Threshold reached but waiting for 10-second countdown
      const resultDiv = document.getElementById('exposedResult');
      resultDiv.classList.remove('hidden');
      resultDiv.style.background = '#fff3cd';
      document.getElementById('exposedTitle').textContent = 'Threshold Reached!';
      if (data.revealCountdown !== null && data.revealCountdown > 0) {
        document.getElementById('exposedNames').textContent = `Revealing in ${data.revealCountdown} seconds...`;
      } else {
        document.getElementById('exposedNames').textContent = 'Revealing shortly...';
      }
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

  // Track which poll we're polling for
  currentExposePollId = currentPoll?.id;

  // Reset expose state for new poll
  hasVotedToExpose = false;
  const exposeBtn = document.getElementById('voteExposeBtn');
  exposeBtn.textContent = 'Vote To Reveal';
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

// Modify displayPoll to stop videos and start expose polling
const originalDisplayPoll = displayPoll;
displayPoll = function(poll, hasVoted, voterRating) {
  // Stop any playing videos from previous poll
  stopAllVideos();

  originalDisplayPoll(poll, hasVoted, voterRating);
  startExposePolling();
};

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (exposePollingInterval) {
    clearInterval(exposePollingInterval);
  }
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
});

// Heartbeat - send every 15 seconds to indicate we're still connected
let heartbeatInterval = null;

function startHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  // Send initial heartbeat
  sendHeartbeat();

  // Send heartbeat every 15 seconds
  heartbeatInterval = setInterval(sendHeartbeat, 15000);
}

async function sendHeartbeat() {
  try {
    await fetch(`/api/session/${sessionId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterId, voterName })
    });
  } catch (error) {
    // Silently fail - heartbeat is not critical
    console.log('Heartbeat failed:', error.message);
  }
}

// Start heartbeat when page loads
startHeartbeat();

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
  console.log('voterSkipPoll called, isAuthorizedVoter:', isAuthorizedVoter, 'voterName:', voterName);

  if (!isAuthorizedVoter) {
    console.log('Not authorized - voterName does not match authorized list');
    alert('You are not authorized to skip polls. Your name: ' + voterName);
    return;
  }

  if (!confirm('Skip to the next poll?')) return;

  const skipBtn = document.getElementById('voterSkipBtn');
  if (skipBtn) {
    skipBtn.disabled = true;
    skipBtn.textContent = 'Skipping...';
  }

  try {
    const response = await fetch(`/api/session/${sessionId}/skip-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voterName })
    });

    const data = await response.json();
    console.log('Skip response:', data);

    if (!response.ok) {
      alert('Failed to skip: ' + (data.error || 'Unknown error'));
      return;
    }

    if (data.sessionCompleted) {
      // Session is over, show end screen
      showEndScreen();
    } else {
      // Force immediate check for new poll
      lastPollId = null; // Reset so we detect the new poll
      await checkForPoll();
    }
  } catch (error) {
    console.error('Error skipping poll:', error);
    alert('Error skipping poll: ' + error.message);
  } finally {
    if (skipBtn) {
      skipBtn.disabled = false;
      skipBtn.textContent = 'Skip';
    }
  }
}

// Voter toggle auto-advance (for authorized voters)
// Note: This only syncs the state to server - carousel/video autoplay only happens on host
async function voterToggleAutoAdvance() {
  if (!isAuthorizedVoter) return;

  const toggle = document.getElementById('voterAutoAdvanceToggle');
  const isOn = toggle ? toggle.checked : false;

  try {
    await fetch(`/api/session/${sessionId}/auto-advance-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        autoAdvanceOn: isOn
      })
    });
  } catch (error) {
    console.error('Error toggling auto-advance:', error);
  }
}

// ========================================
// Feedback Form Logic
// ========================================

let feedbackData = {
  rating: null,
  mostValuable: '',
  improvements: '',
  meetingLengthAppropriate: null,
  meetingLengthReason: null,
  meetingLengthSuggestion: '',
  additionalComments: ''
};

let feedbackInitialized = false;

function initializeFeedbackForm() {
  if (feedbackInitialized) return;
  feedbackInitialized = true;

  // Star rating interaction
  const stars = document.querySelectorAll('.star-rating .star');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const value = parseInt(star.dataset.value);
      feedbackData.rating = value;

      // Update visual state
      stars.forEach(s => {
        if (parseInt(s.dataset.value) <= value) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });

    star.addEventListener('mouseenter', () => {
      const value = parseInt(star.dataset.value);
      stars.forEach(s => {
        if (parseInt(s.dataset.value) <= value) {
          s.style.color = '#f6ad55';
        }
      });
    });

    star.addEventListener('mouseleave', () => {
      stars.forEach(s => {
        if (!s.classList.contains('active')) {
          s.style.color = '#cbd5e0';
        } else {
          s.style.color = '#f6ad55';
        }
      });
    });
  });

  // Meeting length option buttons
  document.querySelectorAll('#meetingLengthOptions .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#meetingLengthOptions .option-btn').forEach(b =>
        b.classList.remove('selected'));
      btn.classList.add('selected');
      feedbackData.meetingLengthAppropriate = btn.dataset.value;

      // Show/hide expanded options based on selection
      const detailsDiv = document.getElementById('meetingLengthDetails');
      if (btn.dataset.value === 'No') {
        detailsDiv.classList.remove('hidden');
      } else {
        detailsDiv.classList.add('hidden');
        // Reset the expanded options when "Yes" is selected
        feedbackData.meetingLengthReason = null;
        feedbackData.meetingLengthSuggestion = '';
        document.querySelectorAll('#meetingLengthReason .option-btn').forEach(b =>
          b.classList.remove('selected'));
        const suggestionInput = document.getElementById('meetingLengthSuggestion');
        if (suggestionInput) suggestionInput.value = '';
      }
    });
  });

  // Meeting length reason buttons (too short / too long)
  document.querySelectorAll('#meetingLengthReason .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#meetingLengthReason .option-btn').forEach(b =>
        b.classList.remove('selected'));
      btn.classList.add('selected');
      feedbackData.meetingLengthReason = btn.dataset.value;
    });
  });

  // Submit feedback handler
  const submitBtn = document.getElementById('submitFeedbackBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', submitFeedback);
  }

  // Skip feedback handler
  const skipBtn = document.getElementById('skipFeedbackBtn');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      document.getElementById('feedbackSection').classList.add('hidden');
      const thanksDiv = document.getElementById('feedbackThanks');
      thanksDiv.classList.remove('hidden');
      thanksDiv.innerHTML = '<p style="font-size: 1.3em; color: #666; margin-top: 20px;">No problem! See you next time!</p>';
    });
  }
}

async function submitFeedback() {
  const submitBtn = document.getElementById('submitFeedbackBtn');
  const messageDiv = document.getElementById('feedbackMessage');

  // Collect form data
  feedbackData.mostValuable = document.getElementById('mostValuable')?.value || '';
  feedbackData.improvements = document.getElementById('improvements')?.value || '';
  feedbackData.meetingLengthSuggestion = document.getElementById('meetingLengthSuggestion')?.value || '';
  feedbackData.additionalComments = document.getElementById('additionalComments')?.value || '';

  // Validate at least one field is filled
  if (!feedbackData.rating && !feedbackData.mostValuable && !feedbackData.improvements && !feedbackData.meetingLengthAppropriate) {
    messageDiv.textContent = 'Please provide at least one piece of feedback.';
    messageDiv.className = 'submit-message error';
    messageDiv.classList.remove('hidden');
    return;
  }

  // Disable button during submission
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const response = await fetch(`/api/session/${sessionId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackData })
    });

    if (!response.ok) {
      throw new Error('Failed to submit feedback');
    }

    // Show success message
    document.getElementById('feedbackSection').classList.add('hidden');
    document.getElementById('feedbackThanks').classList.remove('hidden');

  } catch (error) {
    console.error('Error submitting feedback:', error);
    messageDiv.textContent = 'Failed to submit feedback. Please try again.';
    messageDiv.className = 'submit-message error';
    messageDiv.classList.remove('hidden');

    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Feedback';
  }
}

// Note: initializeFeedbackForm is now called from the "Continue to Feedback" button click handler
// after the top 10 screen is shown

// ========================================
// Voter Status Panel
// ========================================

let voterStatusPollingInterval = null;
let currentVoterStatus = null;

// Start polling for voter statuses
function startVoterStatusPolling() {
  if (voterStatusPollingInterval) {
    clearInterval(voterStatusPollingInterval);
  }

  // Initial fetch
  fetchVoterStatuses();

  // Poll every 2 seconds
  voterStatusPollingInterval = setInterval(fetchVoterStatuses, 2000);
}

// Fetch and update voter statuses
async function fetchVoterStatuses() {
  try {
    const response = await fetch(`/api/session/${sessionId}/voter-statuses`);
    const data = await response.json();

    if (data.success) {
      renderVoterList(data.readyVoters, data.voterStatuses);
    }
  } catch (error) {
    console.error('Error fetching voter statuses:', error);
  }
}

// Render the voter list with status indicators
function renderVoterList(readyVoters, voterStatuses) {
  const voterList = document.getElementById('voterList');
  const voterCountBadge = document.getElementById('voterCountBadge');

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

    const isMe = name === voterName;

    return `
      <div class="voter-item ${statusClass} ${isMe ? 'voter-me' : ''}">
        <span class="voter-name">${name}${isMe ? ' (You)' : ''}</span>
        <span class="voter-status-icon">${statusIcon}</span>
      </div>
    `;
  }).join('');
}

// Set voter status
async function setVoterStatus(status) {
  // If clicking the same status, clear it
  if (currentVoterStatus === status) {
    status = null;
  }

  try {
    const response = await fetch(`/api/session/${sessionId}/voter-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voterId,
        voterName,
        status
      })
    });

    if (response.ok) {
      currentVoterStatus = status;
      updateStatusButtonStates();

      // If speaking status, auto-clear after 3 seconds
      if (status === 'speaking') {
        setTimeout(() => {
          if (currentVoterStatus === 'speaking') {
            setVoterStatus(null);
          }
        }, 3000);
      }
    }
  } catch (error) {
    console.error('Error setting voter status:', error);
  }
}

// Update button visual states
function updateStatusButtonStates() {
  const buttons = document.querySelectorAll('.status-btn');
  buttons.forEach(btn => {
    btn.classList.remove('active');
  });

  if (currentVoterStatus) {
    const activeBtn = document.querySelector(`.status-${currentVoterStatus === 'notReady' ? 'not-ready' : currentVoterStatus}`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }
}

// Start voter status polling when page loads
startVoterStatusPolling();

// ===== NOTES FUNCTIONALITY =====

let notesExpanded = false;
let currentPollNotes = [];

// Toggle notes panel visibility
function toggleNotesPanel() {
  const notesContent = document.getElementById('notesContent');
  const toggleIcon = document.getElementById('notesToggleIcon');

  notesExpanded = !notesExpanded;

  if (notesExpanded) {
    notesContent.classList.remove('hidden');
    toggleIcon.textContent = '▲';
    // Load notes when panel is opened
    loadNotes();
  } else {
    notesContent.classList.add('hidden');
    toggleIcon.textContent = '▼';
  }
}

// Save a note for the current poll
async function saveNote() {
  const noteInput = document.getElementById('noteInput');
  const content = noteInput.value.trim();

  if (!content) {
    return;
  }

  // Determine which poll we're viewing (live or navigating)
  const pollIndex = viewingPollIndex !== null ? viewingPollIndex : livePollIndex;

  if (pollIndex === null || !currentPoll) {
    console.error('No poll data available');
    return;
  }

  const pollId = `poll-${pollIndex}`;
  const pollTitle = currentPoll.creator ?
    `${currentPoll.creator} - ${currentPoll.company || 'Unknown'}` :
    'Unknown Poll';

  try {
    const response = await fetch(`/api/session/${sessionId}/poll/${pollId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, pollTitle })
    });

    if (response.ok) {
      const data = await response.json();
      // Add to local list and re-render
      currentPollNotes.push(data.note);
      renderNotes();
      // Clear input
      noteInput.value = '';
    } else {
      console.error('Failed to save note');
    }
  } catch (error) {
    console.error('Error saving note:', error);
  }
}

// Load notes for the current poll
async function loadNotes() {
  const pollIndex = viewingPollIndex !== null ? viewingPollIndex : livePollIndex;

  if (pollIndex === null) {
    currentPollNotes = [];
    renderNotes();
    return;
  }

  const pollId = `poll-${pollIndex}`;

  try {
    const response = await fetch(`/api/session/${sessionId}/poll/${pollId}/notes`);
    if (response.ok) {
      const data = await response.json();
      currentPollNotes = data.notes || [];
      renderNotes();
    }
  } catch (error) {
    console.error('Error loading notes:', error);
    currentPollNotes = [];
    renderNotes();
  }
}

// Render the notes list
function renderNotes() {
  const notesList = document.getElementById('notesList');
  if (!notesList) return;

  if (currentPollNotes.length === 0) {
    notesList.innerHTML = '<p class="no-notes">No notes yet for this poll.</p>';
    return;
  }

  // Sort by timestamp (newest first)
  const sortedNotes = [...currentPollNotes].sort((a, b) => b.timestamp - a.timestamp);

  notesList.innerHTML = sortedNotes.map(note => {
    const time = new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="note-item">
        <div class="note-time">${time}</div>
        <div class="note-content">${escapeHtml(note.content)}</div>
      </div>
    `;
  }).join('');
}

// Helper to escape HTML in notes
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
