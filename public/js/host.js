const sessionId = window.location.pathname.split('/')[2];

let polls = [];
let currentPollIndex = -1;
let currentPoll = null;
let pollingInterval = null;
let completedPolls = []; // Store results of completed polls

document.getElementById('sessionId').textContent = sessionId;

document.getElementById('pollForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('pollTitle').value;
  const mediaFile = document.getElementById('mediaFile').files[0];
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!mediaFile) {
    alert('Please select a video or image file');
    return;
  }

  // Validate file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
  if (!validTypes.includes(mediaFile.type)) {
    alert(`File type "${mediaFile.type}" is not supported. Please use: JPG, PNG, GIF, WEBP, MP4, MOV, or WEBM.`);
    return;
  }

  // Check file size (warn if over 50MB, block if over 100MB)
  const fileSizeMB = mediaFile.size / (1024 * 1024);
  if (fileSizeMB > 100) {
    alert('File is too large (over 100MB). Please compress the video or choose a smaller file.');
    return;
  }
  if (fileSizeMB > 50) {
    const proceed = confirm(`This file is ${fileSizeMB.toFixed(1)}MB. Large files may take 1-2 minutes to upload. Continue?`);
    if (!proceed) return;
  }

  // Show loading state
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';

  try {
    const reader = new FileReader();
    reader.onload = async function(event) {
      try {
        const base64Data = event.target.result.split(',')[1];

        // Update button to show upload progress
        submitBtn.textContent = mediaFile.type.startsWith('video/') ? 'Uploading video (this may take 30-60 seconds)...' : 'Uploading image...';

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

        // Read response as text first to avoid "body already consumed" error
        const responseText = await response.text();

        if (!response.ok) {
          let errorMessage = 'Failed to add poll';
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            console.error('Server error response:', responseText);
            errorMessage = `Server error (${response.status}): ${responseText.substring(0, 100)}`;
          }
          throw new Error(errorMessage);
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error('Invalid JSON response:', responseText);
          throw new Error('Server returned invalid response. The file may be too large or in an unsupported format.');
        }

        if (!data.poll) {
          throw new Error('Invalid response from server');
        }

        polls.push(data.poll);
        updatePollsList();
        document.getElementById('pollForm').reset();
        document.getElementById('startVotingBtn').disabled = false;

        // Show success feedback
        submitBtn.textContent = 'Poll Added!';
        setTimeout(() => {
          submitBtn.textContent = originalBtnText;
          submitBtn.disabled = false;
        }, 2000);

      } catch (error) {
        console.error('Error adding poll:', error);
        alert('Error adding poll: ' + error.message);
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }
    };

    reader.onerror = function() {
      alert('Error reading file');
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
    };

    reader.readAsDataURL(mediaFile);
  } catch (error) {
    console.error('Error adding poll:', error);
    alert('Error adding poll: ' + error.message);
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
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
        <video controls autoplay style="max-width: 100%; max-height: 700px;">
          <source src="${currentPoll.mediaUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
      `;
    } else if (currentPoll.mediaType === 'image') {
      mediaContainer.innerHTML = `
        <img src="${currentPoll.mediaUrl}" alt="${currentPoll.title}" style="max-width: 100%; max-height: 700px;">
      `;
    }

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
