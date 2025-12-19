const sessionId = window.location.pathname.split('/')[2];

let polls = [];
let currentPollIndex = -1;
let currentPoll = null;
const hostEmail = 'host@growthboss.com';
let hostVoterId = null;
let pollingInterval = null;
let completedPolls = []; // Store results of completed polls

document.getElementById('sessionId').textContent = sessionId;

async function initializeHost() {
  try {
    const response = await fetch('/api/session/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, email: hostEmail })
    });

    const data = await response.json();
    if (data.success) {
      hostVoterId = data.voterId;
    }
  } catch (error) {
    console.error('Error initializing host:', error);
  }
}

initializeHost();

const hostRatingSlider = document.getElementById('hostRatingSlider');
const hostRatingInput = document.getElementById('hostRatingInput');

hostRatingSlider.addEventListener('input', (e) => {
  hostRatingInput.value = e.target.value;
});

hostRatingInput.addEventListener('input', (e) => {
  let value = parseInt(e.target.value);
  if (value < 0) value = 0;
  if (value > 10) value = 10;
  hostRatingInput.value = value;
  hostRatingSlider.value = value;
});

document.getElementById('pollForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('pollTitle').value;
  const mediaFile = document.getElementById('mediaFile').files[0];

  if (!mediaFile) {
    alert('Please select a video or image file');
    return;
  }

  try {
    const reader = new FileReader();
    reader.onload = async function(event) {
      const base64Data = event.target.result.split(',')[1];

      const response = await fetch(`/api/session/${sessionId}/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          mediaData: base64Data,
          mediaType: mediaFile.type,
          fileName: mediaFile.name
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add poll');
      }

      const data = await response.json();

      if (!data.poll) {
        throw new Error('Invalid response from server');
      }

      polls.push(data.poll);
      updatePollsList();
      document.getElementById('pollForm').reset();
      document.getElementById('startVotingBtn').disabled = false;
    };
    reader.readAsDataURL(mediaFile);
  } catch (error) {
    console.error('Error adding poll:', error);
    alert('Error adding poll: ' + error.message);
  }
});

function updatePollsList() {
  const container = document.getElementById('pollsContainer');
  container.innerHTML = polls.map((poll, index) => `
    <div class="poll-item">
      <strong>Poll ${index + 1}:</strong> ${poll.title}
      <span style="margin-left: 10px; color: #666;">(${poll.mediaType})</span>
    </div>
  `).join('');
}

document.getElementById('startVotingBtn').addEventListener('click', async () => {
  if (polls.length === 0) {
    alert('Please add at least one poll');
    return;
  }

  document.getElementById('setupSection').classList.add('hidden');
  document.getElementById('votingSection').classList.remove('hidden');

  await startPoll(0);
});

async function startPoll(pollIndex) {
  try {
    const response = await fetch(`/api/session/${sessionId}/start/${pollIndex}`, {
      method: 'POST'
    });

    if (!response.ok) throw new Error('Failed to start poll');

    currentPollIndex = pollIndex;
    currentPoll = polls[pollIndex];

    document.getElementById('currentPollTitle').textContent = currentPoll.title;

    const mediaContainer = document.getElementById('currentPollMedia');
    if (currentPoll.mediaType === 'video') {
      mediaContainer.innerHTML = `
        <video controls autoplay style="max-width: 100%; max-height: 500px;">
          <source src="${currentPoll.mediaUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      `;
    } else if (currentPoll.mediaType === 'image') {
      mediaContainer.innerHTML = `
        <img src="${currentPoll.mediaUrl}" alt="${currentPoll.title}" style="max-width: 100%; max-height: 500px;">
      `;
    }

    hostRatingSlider.value = 5;
    hostRatingInput.value = 5;
    hostRatingSlider.disabled = false;
    hostRatingInput.disabled = false;
    document.getElementById('hostSubmitBtn').disabled = false;
    document.getElementById('hostVoteMessage').classList.add('hidden');

    document.getElementById('totalVotes').textContent = '0';
    document.getElementById('averageRating').textContent = '-';
    document.getElementById('ratingsList').innerHTML = '';
    document.getElementById('pollProgress').textContent = `Poll ${pollIndex + 1} of ${polls.length}`;

    startPolling();

    const nextBtn = document.getElementById('nextPollBtn');
    if (pollIndex >= polls.length - 1) {
      nextBtn.textContent = 'Finish Session';
      nextBtn.onclick = async () => {
        stopPolling();
        await saveCompletedPoll();
        showSessionResults();
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

document.getElementById('hostSubmitBtn').addEventListener('click', async () => {
  if (!currentPoll || !hostVoterId) {
    alert('Unable to submit vote');
    return;
  }

  const rating = parseInt(hostRatingInput.value);

  try {
    const response = await fetch(`/api/session/${sessionId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId: currentPoll.id,
        voterId: hostVoterId,
        rating: rating
      })
    });

    if (!response.ok) throw new Error('Failed to submit vote');

    const messageDiv = document.getElementById('hostVoteMessage');
    messageDiv.textContent = 'Your vote submitted successfully!';
    messageDiv.className = 'submit-message success';
    messageDiv.classList.remove('hidden');

    hostRatingSlider.disabled = true;
    hostRatingInput.disabled = true;
    document.getElementById('hostSubmitBtn').disabled = true;

    updateResults();

  } catch (error) {
    const messageDiv = document.getElementById('hostVoteMessage');
    messageDiv.textContent = 'Error submitting vote: ' + error.message;
    messageDiv.className = 'submit-message error';
    messageDiv.classList.remove('hidden');
  }
});

async function saveCompletedPoll() {
  if (!currentPoll) return;

  try {
    const response = await fetch(`/api/session/${sessionId}/results/${currentPoll.id}`);
    const data = await response.json();

    completedPolls.push({
      title: currentPoll.title,
      pollId: currentPoll.id,
      totalVotes: data.totalVotes,
      average: data.average,
      votesWithEmails: data.votesWithEmails || []
    });
  } catch (error) {
    console.error('Error saving completed poll:', error);
  }
}

function showSessionResults() {
  document.getElementById('votingSection').classList.add('hidden');

  const container = document.querySelector('.host-dashboard');

  const resultsSection = document.createElement('div');
  resultsSection.className = 'session-results';
  resultsSection.innerHTML = `
    <h2>Session Complete - Final Results</h2>
    <p>All polls have been completed. Click on each poll to see detailed results.</p>
    <div id="completedPollsContainer"></div>
    <button onclick="window.location.href='/'" class="btn btn-primary" style="margin-top: 20px;">Back to Home</button>
  `;

  container.appendChild(resultsSection);

  const completedContainer = document.getElementById('completedPollsContainer');
  completedContainer.innerHTML = completedPolls.map((poll, index) => `
    <div class="completed-poll-card">
      <div class="completed-poll-header" onclick="togglePollDetails(${index})">
        <h3>Poll ${index + 1}: ${poll.title}</h3>
        <div class="poll-summary">
          <span>Total Votes: ${poll.totalVotes}</span>
          <span>Average: ${poll.average}/10</span>
          <span class="dropdown-arrow" id="arrow-${index}">▼</span>
        </div>
      </div>
      <div class="completed-poll-details hidden" id="details-${index}">
        ${poll.votesWithEmails.length > 0 ? `
          <h4>Individual Votes:</h4>
          ${poll.votesWithEmails.map(vote => `
            <div class="vote-detail">
              <strong>${vote.email}</strong>: ${vote.rating}/10
            </div>
          `).join('')}
        ` : '<p>No votes recorded for this poll.</p>'}
      </div>
    </div>
  `).join('');
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
