# Voting Website - Technical Documentation

## Overview

This is a **real-time team polling/voting website** that allows a host to present polls with media (images/videos) to multiple voters, collect ratings (0-10 scale), and display live results. It's deployed on **Vercel** as a serverless application.

---

## Technology Stack

### Backend:
- **Node.js** with **Express.js** (serverless functions)
- **Upstash Redis** (cloud-based Redis database)
- **UUID** library (generating unique IDs)

### Frontend:
- **Vanilla JavaScript** (no frameworks like React/Vue)
- **HTML5** with semantic markup
- **CSS3** with custom styling
- **Drag-and-Drop API** for poll reordering
- **Fetch API** for HTTP requests

### Hosting:
- **Vercel** (serverless deployment platform)
- **GitHub** (version control and deployment source)

### External Services:
- **YouTube** (video embedding via iframe)
- **Imgur** (image hosting)

---

## Architecture Overview

```
┌─────────────┐         HTTP/HTTPS          ┌──────────────┐
│   Browser   │ ◄──────────────────────────►│   Vercel     │
│  (Voter/    │    Fetch API Requests       │  (Serverless)│
│   Host)     │                             │              │
└─────────────┘                             └──────┬───────┘
                                                   │
                                                   │ REST API
                                                   │
                                            ┌──────▼───────┐
                                            │   Upstash    │
                                            │    Redis     │
                                            │  (Database)  │
                                            └──────────────┘
```

---

## Backend Architecture (api/index.js)

### 1. Serverless Functions

The backend is a single Express.js application that runs as **Vercel serverless functions**. Each HTTP endpoint becomes a serverless function that:
- Spins up on-demand when a request arrives
- Executes the handler code
- Shuts down after sending the response

**Example endpoint:**
```javascript
app.post('/api/session/:sessionId/vote', async (req, res) => {
  // This entire function runs as a serverless invocation
  const session = await getSession(sessionId);
  // Process vote...
  await saveSession(sessionId, session);
  res.json({ success: true });
});
```

### 2. Data Storage with Upstash Redis

**Why Redis?**
- Fast key-value storage (perfect for real-time data)
- Serverless-compatible (no persistent connection required)
- Built-in TTL (time-to-live) for automatic cleanup

**Data Structure:**

```javascript
// Session data stored at key: "session:{sessionId}"
{
  id: "abc-123",
  polls: [
    {
      id: "poll-uuid-1",
      title: "Rate this design",
      mediaItems: [
        { url: "https://i.imgur.com/xyz.jpg", type: "image" },
        { url: "https://youtube.com/embed/abc", type: "video" }
      ],
      timer: 60,          // seconds
      startTime: 1234567890  // Unix timestamp
    }
  ],
  currentPollIndex: 0,  // Which poll is active
  votes: {
    "poll-uuid-1": {
      "voter-uuid-1": 8,
      "voter-uuid-2": 9
    }
  },
  voters: {
    "voter-uuid-1": "john@example.com",
    "voter-uuid-2": "jane@example.com"
  }
}

// Host authentication token: "host:token:{uuid}"
"authorized"

// Saved sessions list: "host:saved-sessions"
[
  { id: "session-1", name: "Q1 Review", createdAt: 1234567890 },
  { id: "session-2", name: "Product Demo", createdAt: 1234567891 }
]
```

**TTL (Time-to-Live):**
```javascript
await redis.set(`session:${sessionId}`, sessionData, { ex: 86400 });
// Expires after 24 hours (86400 seconds)
```

### 3. Key API Endpoints

#### Authentication
```javascript
POST /api/host/login
// Input: { username, password }
// Output: { success: true, token: "uuid" }
// Creates: host:token:{token} → "authorized"
```

#### Session Management
```javascript
POST /api/host/create-session
// Creates new session with empty polls array
// Returns: { sessionId: "uuid" }

GET /api/session/:sessionId
// Returns: { sessionId, polls, currentPollIndex }
```

#### Poll Operations
```javascript
POST /api/session/:sessionId/poll
// Input: { title, mediaItems, timer }
// Action: Adds poll to session.polls array
// Returns: { poll: {...} }

PUT /api/session/:sessionId/poll/:pollIndex
// Updates existing poll at index
// Preserves poll ID to maintain vote data

DELETE /api/session/:sessionId/poll/:pollIndex
// Removes poll from array
// Adjusts currentPollIndex if needed

PUT /api/session/:sessionId/reorder-polls
// Input: { polls: [...] }
// Validates all poll IDs match (prevents data loss)
// Replaces entire polls array with new order
```

#### Voting Flow
```javascript
POST /api/session/:sessionId/start/:pollIndex
// Sets: session.currentPollIndex = index
//       session.polls[index].startTime = Date.now()
//       session.votes[pollId] = new Map()

POST /api/session/:sessionId/vote
// Input: { pollId, voterId, rating }
// Validates: timer hasn't expired
// Stores: votes[pollId][voterId] = rating

GET /api/session/:sessionId/current-poll?voterId=X
// Returns: { currentPoll, hasVoted, voterRating }
// Checks if voter has already voted

GET /api/session/:sessionId/results/:pollId
// Calculates: totalVotes, average, votesWithEmails
// Returns live results for host dashboard
```

### 4. Map Serialization

**Problem:** Redis stores JSON, but JavaScript Maps aren't JSON-serializable.

**Solution:** Convert Maps to objects when saving, restore when loading:

```javascript
async function saveSession(sessionId, session) {
  const sessionToSave = { ...session };

  // Convert Map of Maps to nested objects
  const votesObj = {};
  for (const [pollId, pollVotesMap] of session.votes.entries()) {
    votesObj[pollId] = Object.fromEntries(pollVotesMap);
  }
  sessionToSave.votes = votesObj;

  await redis.set(`session:${sessionId}`, sessionToSave);
}

async function getSession(sessionId) {
  const session = await redis.get(`session:${sessionId}`);

  // Restore Maps from objects
  const votesMap = new Map();
  for (const [pollId, pollVotesObj] of Object.entries(session.votes)) {
    votesMap.set(pollId, new Map(Object.entries(pollVotesObj)));
  }
  session.votes = votesMap;

  return session;
}
```

---

## Frontend Architecture

### 1. HTML Pages

**Page Flow:**
```
index.html (Homepage)
    ↓
    ├─→ host-login.html → session-select.html → host.html?mode=edit/present
    │
    └─→ join-session.html → voter.html
```

**Key HTML Files:**

- **index.html**: Landing page with "Host Session" and "Join Session" buttons
- **host-login.html**: Authentication (username: GrowthBossHosting, password: y&%)U#2+${QF/wG7)
- **session-select.html**: Choose to create new or load saved session
- **host.html**: Host dashboard with two sections:
  - Setup section: Create/edit/delete/reorder polls
  - Voting section: Display current poll, live results, timer
- **join-session.html**: Voters enter session ID and email
- **voter.html**: Voter interface showing poll, media carousel, rating controls

### 2. Client-Side JavaScript

#### Host Dashboard (host.js)

**State Management:**
```javascript
let polls = [];              // Array of poll objects
let currentPollIndex = -1;   // Which poll is active
let currentPoll = null;      // Active poll object
let pollingInterval = null;  // HTTP polling interval ID
let completedPolls = [];     // Results after session ends
let timerInterval = null;    // Countdown timer interval
```

**Poll Creation Flow:**
```javascript
1. User fills form (title, timer, media URLs)
2. Parse URLs line-by-line
3. Detect YouTube URLs and convert to embed format:
   youtube.com/watch?v=ABC → youtube.com/embed/ABC
4. Send POST to /api/session/:sessionId/poll
5. Add returned poll to polls array
6. Update UI list
```

**Drag-and-Drop Reordering:**
```javascript
1. Each poll item has draggable="true" attribute
2. Event listeners: dragstart, dragover, drop, dragend
3. On drop:
   - Reorder local polls array
   - Send PUT to /api/session/:sessionId/reorder-polls
   - Re-render list with new order
```

**Live Results Polling:**
```javascript
// Every 2 seconds while poll is active
setInterval(async () => {
  const data = await fetch(`/api/session/${sessionId}/results/${pollId}`);
  // Update vote count and average rating
  document.getElementById('totalVotes').textContent = data.totalVotes;
  document.getElementById('averageRating').textContent = data.average;
}, 2000);
```

**Timer Implementation:**
```javascript
function startTimer(duration) {
  let timeLeft = duration;
  setInterval(() => {
    timeLeft--;
    updateTimerDisplay(timeLeft);

    // Change colors
    if (timeLeft <= 10) background = red;
    else if (timeLeft <= 30) background = orange;
    else background = green;

    if (timeLeft <= 0) {
      clearInterval();
      // Timer expired (host only sees this, doesn't disable anything)
    }
  }, 1000);
}
```

**Media Carousel (Multiple Items):**
```javascript
if (poll.mediaItems.length > 1) {
  // Render carousel container with arrows
  container.innerHTML = `
    <button onclick="hostCarouselPrev()">‹</button>
    <div id="hostCarouselContent"></div>
    <button onclick="hostCarouselNext()">›</button>
    <div id="hostCarouselIndicators"></div>
  `;

  window.hostCarouselIndex = 0;
  window.hostCarouselItems = poll.mediaItems;
  renderHostCarouselItem(0);
}

function renderHostCarouselItem(index) {
  const item = window.hostCarouselItems[index];
  if (item.type === 'video') {
    // Render YouTube iframe
  } else {
    // Render image
  }
  // Update dot indicators
}
```

#### Voter Interface (voter.js)

**State Management:**
```javascript
let currentPoll = null;
let voterId = localStorage.getItem(`voterId_${sessionId}`);
let pollingInterval = null;
let lastPollId = null;
let timerInterval = null;
```

**HTTP Polling for New Polls:**
```javascript
// Check every 2 seconds for poll updates
setInterval(async () => {
  const data = await fetch(
    `/api/session/${sessionId}/current-poll?voterId=${voterId}`
  );

  if (data.currentPoll && data.currentPoll.id !== lastPollId) {
    // New poll detected!
    lastPollId = data.currentPoll.id;
    displayPoll(data.currentPoll, data.hasVoted, data.voterRating);
  } else if (!data.currentPoll) {
    // Host ended poll - show waiting screen
    showWaitingScreen();
  }
}, 2000);
```

**Timer with Voting Lockout:**
```javascript
function displayPoll(poll, hasVoted, voterRating) {
  // Calculate time remaining
  const elapsed = (Date.now() - poll.startTime) / 1000;
  const timeLeft = Math.max(0, poll.timer - elapsed);

  // Reset timer display
  timerText.innerHTML = 'Time remaining: <strong id="timerValue">60</strong>s';

  // Start countdown
  startTimer(timeLeft);

  // Check if already expired
  if (timeLeft <= 0) {
    disableVotingControls();
  } else if (!hasVoted) {
    enableVotingControls();
  }
}

function startTimer(duration) {
  let timeLeft = duration;

  if (timeLeft === 0) {
    // Already expired - don't start interval
    disableVotingControls();
    timerText.innerHTML = '⏱️ <strong>Voting Closed</strong>';
    return;
  }

  timerInterval = setInterval(() => {
    timeLeft--;
    updateDisplay(timeLeft);

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      disableVotingControls();  // Lock voting
      timerText.innerHTML = '⏱️ <strong>Voting Closed</strong>';
    }
  }, 1000);
}

function disableVotingControls() {
  ratingSlider.disabled = true;
  ratingInput.disabled = true;
  submitBtn.disabled = true;
  // Content (media) remains visible!
}
```

**Vote Submission with Validation:**
```javascript
submitBtn.addEventListener('click', async () => {
  // Client-side timer check
  const elapsed = (Date.now() - currentPoll.startTime) / 1000;
  const timeLeft = Math.max(0, currentPoll.timer - elapsed);

  if (timeLeft <= 0) {
    alert('Voting period has ended');
    return;
  }

  // Submit vote
  await fetch('/api/session/${sessionId}/vote', {
    method: 'POST',
    body: JSON.stringify({
      pollId: currentPoll.id,
      voterId: voterId,
      rating: parseInt(ratingInput.value)
    })
  });

  // Disable controls after voting
  ratingSlider.dataset.hasVoted = 'true';
  ratingSlider.disabled = true;
});
```

**Carousel Navigation:**
```javascript
function voterCarouselNext() {
  window.voterCarouselIndex =
    (window.voterCarouselIndex + 1) % window.voterCarouselItems.length;
  renderVoterCarouselItem(window.voterCarouselIndex);
}

// Circular navigation (wraps around)
// index 0 → 1 → 2 → 0 → 1 → ...
```

### 3. CSS Architecture

**Key Styling Features:**
- **Gradient background** with pattern overlay
- **Glassmorphism** card effects (backdrop-filter)
- **Smooth transitions** (0.3s ease)
- **Responsive design** with media queries
- **Drag-and-drop visual feedback** (opacity, highlights)
- **Timer color coding** (green → orange → red)

**Example - Timer Colors:**
```css
.timer-display {
  background: #48bb78;  /* Green by default */
  transition: background 0.3s ease;
}

/* JavaScript changes background dynamically:
   timeLeft <= 30: #ed8936 (orange)
   timeLeft <= 10: #e53e3e (red)
   timeLeft = 0:   #718096 (gray)
*/
```

**Carousel Styling:**
```css
.carousel-container {
  position: relative;
  background: #000;
  padding: 20px 60px;
}

.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  cursor: pointer;
}

.carousel-arrow:hover {
  transform: translateY(-50%) scale(1.1);
}

.carousel-dot.active {
  background: #667eea;
  transform: scale(1.3);
}
```

---

## Real-Time Communication

### HTTP Polling (Not WebSockets)

This app uses **HTTP polling** instead of WebSockets:

**Voter polling:**
```javascript
// Checks every 2 seconds
setInterval(async () => {
  const response = await fetch('/api/session/:sessionId/current-poll');
  // If poll changed, update UI
}, 2000);
```

**Host polling:**
```javascript
// Checks every 2 seconds for new votes
setInterval(async () => {
  const response = await fetch('/api/session/:sessionId/results/:pollId');
  // Update vote count and average
}, 2000);
```

**Why not WebSockets?**
- Serverless functions are stateless (can't maintain persistent connections)
- Vercel has limited WebSocket support
- HTTP polling is simpler and works well for this use case (not ultra-high frequency)

---

## Data Flow Examples

### Example 1: Creating a Poll

```
1. Host enters poll data in form
   ↓
2. JavaScript parses URLs, detects YouTube links
   ↓
3. POST /api/session/abc-123/poll
   Body: {
     title: "Rate this design",
     mediaItems: [
       { url: "https://youtube.com/embed/xyz", type: "video" }
     ],
     timer: 60
   }
   ↓
4. Express handler:
   - Generates poll ID (UUID)
   - Adds poll to session.polls
   - Saves to Redis
   ↓
5. Response: { poll: { id, title, mediaItems, timer, startTime: null } }
   ↓
6. JavaScript updates polls array and re-renders list
```

### Example 2: Voting Flow

```
1. Host clicks "Start Voting Session"
   ↓
2. POST /api/session/abc-123/start/0
   - Sets currentPollIndex = 0
   - Sets polls[0].startTime = Date.now()
   - Initializes votes map for this poll
   ↓
3. Voter's polling detects new poll (every 2 seconds)
   GET /api/session/abc-123/current-poll?voterId=voter-1
   Response: { currentPoll: {...}, hasVoted: false }
   ↓
4. Voter sees poll, media carousel, timer starts
   ↓
5. Voter moves slider to 8, clicks "Submit"
   ↓
6. POST /api/session/abc-123/vote
   Body: { pollId: "poll-1", voterId: "voter-1", rating: 8 }
   ↓
7. Server validates timer hasn't expired:
   elapsed = (Date.now() - poll.startTime) / 1000
   if (elapsed > poll.timer) return 403 error
   ↓
8. Server stores: votes[poll-1][voter-1] = 8
   ↓
9. Host's polling sees new vote (every 2 seconds)
   GET /api/session/abc-123/results/poll-1
   Response: { totalVotes: 1, average: 8.0 }
   ↓
10. Host dashboard updates: "Total Votes: 1", "Average: 8.0/10"
```

### Example 3: Timer Expiration

```
1. Poll starts with 60 second timer
   startTime = Date.now()
   ↓
2. Voter joins 50 seconds later
   elapsed = 50
   timeLeft = 60 - 50 = 10 seconds
   Timer displays 10 seconds, starts countdown
   ↓
3. Timer reaches 0
   - JavaScript clears interval
   - Disables slider, input, submit button
   - Shows "Voting Closed - Time expired"
   - Media carousel still works
   ↓
4. Voter tries to submit anyway
   - Client checks: timeLeft <= 0 → alert("Voting ended")
   - If bypassed, server validates:
     elapsed = (Date.now() - startTime) / 1000
     if (elapsed > timer) return 403
   ↓
5. Host moves to next poll
   ↓
6. Voter's polling detects new poll
   - displayPoll() resets timer HTML
   - Timer shows new poll's duration
   - Controls re-enabled (if not voted yet)
```

---

## Security Considerations

### 1. Host Authentication
```javascript
// Hardcoded credentials (not ideal for production)
if (username === 'GrowthBossHosting' &&
    password === 'y&%)U#2+${QF/wG7') {
  // Generate session token
  const token = uuidv4();
  await redis.set(`host:token:${token}`, 'authorized', { ex: 86400 });
}

// Middleware checks token on protected routes
async function checkHostAuth(req, res, next) {
  const token = req.headers.authorization?.substring(7);
  const auth = await redis.get(`host:token:${token}`);
  if (auth !== 'authorized') return res.status(401);
  next();
}
```

### 2. Voter Identification
```javascript
// Voters identified by UUID stored in localStorage
let voterId = localStorage.getItem(`voterId_${sessionId}`);

// Server tracks which voters voted on which polls
session.votes[pollId].has(voterId)  // Returns true if already voted
```

### 3. Timer Validation
```javascript
// Client-side (UX)
if (timeLeft <= 0) {
  alert('Voting ended');
  return;
}

// Server-side (security)
const elapsed = (Date.now() - poll.startTime) / 1000;
if (elapsed > poll.timer) {
  return res.status(403).json({ error: 'Voting period ended' });
}
```

### 4. Input Validation
```javascript
// URL validation
try {
  new URL(mediaUrl);  // Throws if invalid
} catch (e) {
  alert('Invalid URL');
}

// Rating validation (client + server)
if (rating < 0 || rating > 10) {
  return res.status(400).json({ error: 'Rating must be 0-10' });
}
```

---

## Deployment (Vercel)

### 1. Project Structure
```
voting-website/
├── api/
│   └── index.js          ← Express app (becomes serverless functions)
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── host.js
│   │   ├── voter.js
│   │   └── music-player.js
│   └── images/
├── views/
│   ├── index.html
│   ├── host.html
│   └── voter.html
├── package.json
└── vercel.json           ← Deployment config
```

### 2. vercel.json Configuration
```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" }
  ]
}
```

All API routes go through `/api/index.js` which runs as serverless functions.

### 3. Environment Variables
Set in Vercel dashboard:
```
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

### 4. Deployment Process
```
1. Push code to GitHub
   ↓
2. Vercel detects push (via webhook)
   ↓
3. Vercel builds project:
   - Installs dependencies (npm install)
   - Bundles serverless functions
   - Deploys static files to CDN
   ↓
4. Live at: https://voting-website.vercel.app
```

---

## Performance Optimizations

### 1. HTTP Polling Intervals
```javascript
// 2 seconds is a good balance:
// - Feels "real-time" to users
// - Doesn't overload server with requests
setInterval(checkForPoll, 2000);
```

### 2. Redis TTL
```javascript
// Auto-cleanup after 24 hours
await redis.set(key, value, { ex: 86400 });
```

### 3. Conditional Updates
```javascript
// Only update UI if poll actually changed
if (data.currentPoll.id !== lastPollId) {
  displayPoll(data.currentPoll);
}
```

### 4. Static Asset Caching
Vercel's CDN caches CSS/JS/images automatically.

---

## Limitations & Trade-offs

### 1. No WebSocket = Slight Delay
- 2-second polling means updates aren't instant
- Acceptable for voting use case
- Could switch to WebSockets for truly real-time

### 2. Serverless Cold Starts
- First request after idle period may be slow (~1-2 seconds)
- Subsequent requests are fast
- Mitigated by Vercel's edge network

### 3. 24-Hour Session Limit
- Redis TTL = 86400 seconds
- Sessions automatically deleted after 24 hours
- Good for temporary voting, not permanent storage

### 4. Single Redis Instance
- All data in one Upstash Redis instance
- No sharding or replication
- Fine for moderate traffic, may need scaling for high volume

---

## Summary

This voting website is a **serverless, real-time polling application** that:

**Backend:**
- Uses Express.js serverless functions on Vercel
- Stores data in Upstash Redis with 24-hour TTL
- Implements RESTful API for CRUD operations
- Validates timer expiration server-side

**Frontend:**
- Uses vanilla JavaScript (no framework)
- Implements HTTP polling for real-time updates
- Features drag-and-drop poll reordering
- Supports media carousels with YouTube embed and Imgur images
- Locks voting after timer expires while keeping content viewable

**Real-Time:**
- HTTP polling every 2 seconds (voters check for new polls, hosts check for new votes)
- Timer countdown synchronized via timestamps
- Instant UI updates when changes detected

**Security:**
- Host authentication with bearer tokens
- Voter identification via UUID
- Client + server-side validation
- Timer expiration enforcement

The architecture is simple, scalable, and well-suited for temporary team polling sessions with moderate traffic. The serverless approach means zero server maintenance and automatic scaling.
