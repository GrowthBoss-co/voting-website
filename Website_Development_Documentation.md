# Content Production Team Polling Website - Complete Development Documentation

## Table of Contents

1. [Application Overview](#application-overview)
2. [File Structure](#file-structure)
3. [Server Architecture](#server-architecture)
4. [Database Implementation](#database-implementation)
5. [Application Routing](#application-routing)
6. [Session Management & Authentication](#session-management--authentication)
7. [File Upload Handling](#file-upload-handling)
8. [Real-time Polling Mechanism](#real-time-polling-mechanism)
9. [Client-Side JavaScript](#client-side-javascript)
10. [CSS Styling](#css-styling)
11. [HTML Views](#html-views)
12. [Application Workflow](#application-workflow)
13. [Deployment](#deployment)
14. [Security & Performance](#security--performance)

---

## Application Overview

This is a **real-time polling/voting application** designed for team content reviews. It allows a host to create voting sessions where team members can rate videos and images on a 0-10 scale.

### Key Features

- **Host Dashboard**: Create polls with YouTube videos or images
- **Voter Interface**: Rate content on a 0-10 scale with real-time slider
- **Live Results**: See voting statistics as they come in
- **Session Types**: Live (one-time) or Saved (reusable) sessions
- **Background Music**: Persistent music player across all pages
- **Serverless Architecture**: Deployed on Vercel with Upstash Redis

### Technology Stack

- **Backend**: Express.js (serverless on Vercel)
- **Database**: Upstash Redis (24-hour TTL)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time**: HTTP polling (2-second intervals)
- **Media**: YouTube embeds, direct image URLs
- **Deployment**: Vercel serverless functions

---

## File Structure

```
C:\Users\KonTr\OneDrive\Desktop\voting website\
├── api/
│   └── index.js                    # Serverless API handler (Vercel)
├── public/
│   ├── css/
│   │   └── style.css              # Complete application styling
│   ├── js/
│   │   ├── index.js               # Landing page navigation
│   │   ├── host-login.js          # Host authentication
│   │   ├── session-select.js      # Session management UI
│   │   ├── host.js                # Host dashboard logic
│   │   ├── voter.js               # Voter interface logic
│   │   └── music-player.js        # Background music player
│   ├── images/
│   │   └── background-pattern.png # Background image
│   └── audio/
│       └── background-music.mp3   # Background music file
├── views/
│   ├── index.html                 # Landing page
│   ├── host-login.html            # Host login page
│   ├── session-select.html        # Session type selection
│   ├── host.html                  # Host dashboard
│   ├── join-session.html          # Voter session join
│   └── voter.html                 # Voter interface
├── server.js                      # Local development server (Socket.IO)
├── vercel.json                    # Vercel configuration
├── package.json                   # Dependencies
└── .env                           # Environment variables (Upstash)
```

---

## Server Architecture

### Two Server Implementations

The application has evolved through two server implementations:

#### 1. Local Development Server (`server.js`)

**Purpose**: Local testing and development

**Technology**:

- Express.js web framework
- Socket.IO for WebSocket connections
- Multer for file uploads
- In-memory storage (Maps)

**Key Characteristics**:

- Real-time updates via WebSockets
- File uploads saved to `public/uploads/`
- Data lost on server restart
- Runs on port 3000

**Code Structure**:

```javascript
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// In-memory storage
const sessions = new Map();
const hostTokens = new Map();
```

#### 2. Production Server (`api/index.js`)

**Purpose**: Production deployment on Vercel

**Technology**:

- Express.js (serverless function)
- Upstash Redis for persistence
- HTTP polling instead of WebSockets
- URL-based media (no file uploads)

**Key Characteristics**:

- Serverless execution (no persistent connections)
- 24-hour data retention via Redis TTL
- Stateless request/response model
- Supports unlimited concurrent sessions

**Code Structure**:

```javascript
const express = require('express');
const { Redis } = require('@upstash/redis');
const { v4: uuidv4 } = require('uuid');

const app = express();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});
```

### Why Two Servers?

**Transition Reason**: Vercel's serverless environment doesn't support:

- Persistent WebSocket connections
- File system storage
- Long-running processes

**Migration Changes**:

1. Socket.IO → HTTP polling (2-second intervals)
2. File uploads → Direct URL input
3. In-memory Maps → Redis storage
4. Persistent connections → Stateless requests

---

## Database Implementation

### Upstash Redis

Upstash is a serverless Redis service that provides:

- REST API (no persistent connection needed)
- Automatic scaling
- Global edge network
- Simple pricing

### Data Structure

#### Session Data

**Key**: `session:{sessionId}`
**Value**: JSON object
**TTL**: 86400 seconds (24 hours)

```javascript
{
  id: "abc12345",                    // 8-character session ID
  name: "Friday Roundtable",         // Custom session name
  isLive: true,                      // Live vs saved session
  status: "presenting",              // draft | presenting | completed
  created: "2024-01-15T10:30:00Z",   // ISO timestamp
  currentPollIndex: 0,               // Active poll (-1 = none)

  polls: [                           // Array of poll objects
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Rate this video",
      mediaUrl: "https://youtube.com/embed/xxxxx",
      mediaType: "video"
    }
  ],

  votes: {                           // Map of poll votes
    "pollId": {
      "voterId": 8                   // Rating value (0-10)
    }
  },

  voters: {                          // Map of registered voters
    "voterId": "user@example.com"
  }
}
```

#### Host Authentication Token

**Key**: `host:token:{token}`
**Value**: `"authorized"`
**TTL**: 86400 seconds (24 hours)

```javascript
// Example
await redis.set('host:token:550e8400-e29b-41d4', 'authorized', { ex: 86400 });
```

#### Saved Sessions List

**Key**: `host:saved-sessions`
**Value**: JSON array
**TTL**: None (persists indefinitely)

```javascript
[
  {
    id: 'session123',
    name: 'Monday Team Meeting',
    created: '2024-01-15T10:30:00Z'
  },
  {
    id: 'session456',
    name: 'Product Review',
    created: '2024-01-16T14:20:00Z'
  }
];
```

### Redis Helper Functions

#### Converting Maps for Storage

Redis only stores JSON, but JavaScript uses Map objects. The API includes conversion functions:

```javascript
// Save session (convert Maps to Objects)
async function saveSession(session) {
  const serialized = {
    ...session,
    votes: Object.fromEntries(
      Array.from(session.votes.entries()).map(([pollId, voteMap]) => [
        pollId,
        Object.fromEntries(voteMap)
      ])
    ),
    voters: Object.fromEntries(session.voters)
  };

  await redis.set(`session:${session.id}`, JSON.stringify(serialized), { ex: 86400 });
}

// Get session (convert Objects to Maps)
async function getSession(sessionId) {
  const data = await redis.get(`session:${sessionId}`);
  if (!data) return null;

  const session = typeof data === 'string' ? JSON.parse(data) : data;

  // Convert votes object back to Map
  session.votes = new Map(
    Object.entries(session.votes || {}).map(([pollId, votes]) => [
      pollId,
      new Map(Object.entries(votes))
    ])
  );

  // Convert voters object back to Map
  session.voters = new Map(Object.entries(session.voters || {}));

  return session;
}
```

### Data Lifecycle

1. **Session Creation**: Host creates session → stored in Redis
2. **Voter Registration**: Voter joins → added to `session.voters` Map
3. **Poll Creation**: Host adds polls → added to `session.polls` array
4. **Vote Submission**: Voter rates → stored in `session.votes` Map
5. **Session Completion**: Results viewable for 24 hours
6. **Automatic Cleanup**: Redis deletes session after TTL expires

---

## Application Routing

### HTML Routes

The server serves static HTML pages for different parts of the application:

| Route              | File                        | Description                                 |
| ------------------ | --------------------------- | ------------------------------------------- |
| `/`                | `views/index.html`          | Landing page with Host/Join buttons         |
| `/host-login`      | `views/host-login.html`     | Host authentication form                    |
| `/session-select`  | `views/session-select.html` | Choose live or saved session                |
| `/join-session`    | `views/join-session.html`   | Voter enters email + session ID             |
| `/host/:sessionId` | `views/host.html`           | Host dashboard (create polls, view results) |
| `/vote/:sessionId` | `views/voter.html`          | Voter interface (rate content)              |

**Implementation**:

```javascript
// Serve HTML views
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/index.html'));
});

app.get('/host/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/host.html'));
});
```

### API Routes

All API routes are prefixed with `/api/` and return JSON responses.

#### Authentication Routes

**POST `/api/host/login`**

- **Purpose**: Authenticate host user
- **Body**: `{ username: string, password: string }`
- **Response**: `{ success: boolean, token?: string, error?: string }`
- **Credentials**:
  - Username: `GrowthBossHosting`
  - Password: `y&%)U#2+${QF/wG7`

```javascript
app.post('/api/host/login', async (req, res) => {
  const { username, password } = req.body;

  if (username === 'GrowthBossHosting' && password === 'y&%)U#2+${QF/wG7') {
    const token = uuidv4();
    await redis.set(`host:token:${token}`, 'authorized', { ex: 86400 });
    res.json({ success: true, token });
  } else {
    res.json({ success: false, error: 'Invalid credentials' });
  }
});
```

#### Session Management Routes

**POST `/api/host/create-session`** (requires auth)

- **Purpose**: Create new voting session
- **Headers**: `Authorization: Bearer {token}`
- **Body**: `{ isLive: boolean, sessionName?: string }`
- **Response**: `{ success: boolean, sessionId: string }`

```javascript
app.post('/api/host/create-session', checkHostAuth, async (req, res) => {
  const { isLive, sessionName } = req.body;
  const sessionId = generateSessionId(); // 8 random chars

  const session = {
    id: sessionId,
    name: sessionName || `Session ${sessionId}`,
    isLive,
    polls: [],
    currentPollIndex: -1,
    votes: new Map(),
    voters: new Map(),
    status: 'draft',
    created: new Date().toISOString()
  };

  await saveSession(session);

  if (!isLive) {
    // Add to saved sessions list
    const savedSessions = (await redis.get('host:saved-sessions')) || [];
    savedSessions.push({
      id: sessionId,
      name: session.name,
      created: session.created
    });
    await redis.set('host:saved-sessions', savedSessions);
  }

  res.json({ success: true, sessionId });
});
```

**GET `/api/host/saved-sessions`** (requires auth)

- **Purpose**: Retrieve all saved sessions
- **Response**: `{ sessions: Array<{id, name, created}> }`

**DELETE `/api/host/session/:sessionId`** (requires auth)

- **Purpose**: Delete a saved session
- **Response**: `{ success: boolean }`

**POST `/api/session/verify`**

- **Purpose**: Verify session exists and register voter
- **Body**: `{ sessionId: string, email: string }`
- **Response**: `{ success: boolean, voterId?: string }`

```javascript
app.post('/api/session/verify', async (req, res) => {
  const { sessionId, email } = req.body;
  const session = await getSession(sessionId);

  if (!session) {
    return res.json({ success: false, error: 'Session not found' });
  }

  const voterId = uuidv4();
  session.voters.set(voterId, email);
  await saveSession(session);

  res.json({ success: true, voterId });
});
```

#### Poll Management Routes

**POST `/api/session/:sessionId/poll`**

- **Purpose**: Add poll to session
- **Body**: `{ title: string, mediaUrl: string, mediaType: 'video'|'image' }`
- **Response**: `{ success: boolean, poll?: object }`

```javascript
app.post('/api/session/:sessionId/poll', async (req, res) => {
  const { sessionId } = req.params;
  const { title, mediaUrl, mediaType } = req.body;

  const session = await getSession(sessionId);
  if (!session) {
    return res.json({ success: false, error: 'Session not found' });
  }

  // Convert YouTube watch URL to embed URL
  let finalUrl = mediaUrl;
  if (mediaType === 'video') {
    const youtubeId = extractYouTubeId(mediaUrl);
    if (youtubeId) {
      finalUrl = `https://www.youtube.com/embed/${youtubeId}`;
    }
  }

  const poll = {
    id: uuidv4(),
    title,
    mediaUrl: finalUrl,
    mediaType
  };

  session.polls.push(poll);
  await saveSession(session);

  res.json({ success: true, poll });
});
```

**GET `/api/session/:sessionId`**

- **Purpose**: Get session information
- **Response**: `{ success: boolean, session: object }`

**POST `/api/session/:sessionId/start/:pollIndex`**

- **Purpose**: Start specific poll by index
- **Response**: `{ success: boolean }`

```javascript
app.post('/api/session/:sessionId/start/:pollIndex', async (req, res) => {
  const { sessionId, pollIndex } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.json({ success: false, error: 'Session not found' });
  }

  const index = parseInt(pollIndex);
  if (index >= session.polls.length) {
    return res.json({ success: false, error: 'Invalid poll index' });
  }

  session.currentPollIndex = index;
  session.status = 'presenting';

  // Initialize votes Map for this poll
  const poll = session.polls[index];
  if (!session.votes.has(poll.id)) {
    session.votes.set(poll.id, new Map());
  }

  await saveSession(session);
  res.json({ success: true });
});
```

#### Voting Routes

**GET `/api/session/:sessionId/current-poll?voterId={id}`**

- **Purpose**: Get currently active poll
- **Query**: `voterId` (to check if already voted)
- **Response**: `{ currentPoll?: object, hasVoted?: boolean, voterRating?: number }`

```javascript
app.get('/api/session/:sessionId/current-poll', async (req, res) => {
  const { sessionId } = req.params;
  const { voterId } = req.query;

  const session = await getSession(sessionId);
  if (!session || session.currentPollIndex === -1) {
    return res.json({});
  }

  const currentPoll = session.polls[session.currentPollIndex];
  const pollVotes = session.votes.get(currentPoll.id);
  const hasVoted = pollVotes && pollVotes.has(voterId);
  const voterRating = hasVoted ? pollVotes.get(voterId) : null;

  res.json({ currentPoll, hasVoted, voterRating });
});
```

**POST `/api/session/:sessionId/vote`**

- **Purpose**: Submit vote for current poll
- **Body**: `{ pollId: string, voterId: string, rating: number }`
- **Response**: `{ success: boolean }`

```javascript
app.post('/api/session/:sessionId/vote', async (req, res) => {
  const { sessionId } = req.params;
  const { pollId, voterId, rating } = req.body;

  // Validate rating
  if (rating < 0 || rating > 10) {
    return res.json({ success: false, error: 'Rating must be 0-10' });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return res.json({ success: false, error: 'Session not found' });
  }

  // Get or create votes Map for this poll
  let pollVotes = session.votes.get(pollId);
  if (!pollVotes) {
    pollVotes = new Map();
    session.votes.set(pollId, pollVotes);
  }

  // Store vote
  pollVotes.set(voterId, rating);
  await saveSession(session);

  res.json({ success: true });
});
```

**GET `/api/session/:sessionId/results/:pollId`**

- **Purpose**: Get voting results for specific poll
- **Response**: `{ totalVotes, average, ratings, votesWithEmails }`

```javascript
app.get('/api/session/:sessionId/results/:pollId', async (req, res) => {
  const { sessionId, pollId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.json({ totalVotes: 0, average: 0, ratings: [] });
  }

  const pollVotes = session.votes.get(pollId);
  if (!pollVotes || pollVotes.size === 0) {
    return res.json({ totalVotes: 0, average: 0, ratings: [] });
  }

  const ratings = Array.from(pollVotes.values());
  const totalVotes = ratings.length;
  const average = ratings.reduce((a, b) => a + b, 0) / totalVotes;

  // Include voter emails with ratings
  const votesWithEmails = Array.from(pollVotes.entries()).map(([voterId, rating]) => ({
    email: session.voters.get(voterId),
    rating
  }));

  res.json({ totalVotes, average, ratings, votesWithEmails });
});
```

#### Utility Routes

**GET `/api/health`**

- **Purpose**: Health check for monitoring
- **Response**: `{ status: 'ok', timestamp, env: { hasRedis } }`

### Authentication Middleware

```javascript
async function checkHostAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const isValid = await redis.get(`host:token:${token}`);

  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  next();
}
```

---

## Session Management & Authentication

### Host Authentication Flow

#### 1. Login Process

```
User → Enter Credentials → POST /api/host/login → Token Generated
     ↓
Token stored in Redis (24h TTL)
     ↓
Token stored in sessionStorage
     ↓
Redirect to /session-select
```

**Client-side (host-login.js)**:

```javascript
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const response = await fetch('/api/host/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();

  if (data.success) {
    sessionStorage.setItem('hostToken', data.token);
    window.location.href = '/session-select';
  } else {
    showError(data.error);
  }
}
```

#### 2. Token Persistence

- **Storage**: `sessionStorage` (cleared when browser tab closes)
- **Lifetime**: 24 hours in Redis, until tab close in browser
- **Format**: UUID v4 (e.g., `550e8400-e29b-41d4-a716-446655440000`)

#### 3. Protected Requests

```javascript
async function createSession(isLive, sessionName) {
  const token = sessionStorage.getItem('hostToken');

  const response = await fetch('/api/host/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ isLive, sessionName })
  });

  return response.json();
}
```

### Voter Authentication Flow

#### 1. Session Join Process

```
User → Enter Email + Session ID → POST /api/session/verify
     ↓
Session exists? → Generate voterId (UUID)
     ↓
Store voterId in session.voters Map
     ↓
Return voterId to client
     ↓
Store in localStorage (persistent)
     ↓
Redirect to /vote/:sessionId
```

**Client-side (join-session.js)**:

```javascript
async function joinSession() {
  const email = document.getElementById('voterEmail').value;
  const sessionId = document.getElementById('sessionId').value.toUpperCase();

  const response = await fetch('/api/session/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, email })
  });

  const data = await response.json();

  if (data.success) {
    localStorage.setItem(`voterId_${sessionId}`, data.voterId);
    localStorage.setItem(`voterEmail_${sessionId}`, email);
    window.location.href = `/vote/${sessionId}`;
  } else {
    showError(data.error);
  }
}
```

#### 2. Voter Identification

- **Storage**: `localStorage` (persists until cleared)
- **Keys**:
  - `voterId_{sessionId}` - UUID for this voter in this session
  - `voterEmail_{sessionId}` - Email address
- **Purpose**: Prevent duplicate voting, track who voted

#### 3. Vote Verification

```javascript
async function checkCurrentPoll() {
  const voterId = localStorage.getItem(`voterId_${sessionId}`);

  const response = await fetch(`/api/session/${sessionId}/current-poll?voterId=${voterId}`);

  const data = await response.json();

  if (data.hasVoted) {
    // Show voted state with their rating
    displayVotedState(data.voterRating);
  } else {
    // Show voting interface
    displayVotingInterface(data.currentPoll);
  }
}
```

### Session ID Generation

```javascript
function generateSessionId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 1, 0
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}
```

**Format**: 8 uppercase alphanumeric characters (e.g., `ABC12345`)
**Collision Probability**: Very low (34^8 = 1.8 trillion combinations)

---

## File Upload Handling

### Evolution from Local to Cloud

The application went through a significant change in how media is handled.

#### Original Implementation (server.js - Local Development)

**Technology**: Multer middleware for Express

```javascript
const multer = require('multer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

app.post('/api/session/:sessionId/poll', upload.single('media'), (req, res) => {
  const { title, mediaType } = req.body;
  const mediaUrl = req.file ? `/uploads/${req.file.filename}` : null;

  // Create poll with local file path
});
```

**Process**:

1. Client uploads file via FormData
2. Multer saves to `public/uploads/` directory
3. File accessible at `/uploads/filename.ext`
4. Server serves file with Express static middleware

**Limitations**:

- ❌ Vercel serverless has no persistent file system
- ❌ Large files consume bandwidth
- ❌ No CDN acceleration
- ❌ Files lost on server restart

#### Current Implementation (api/index.js - Production)

**Technology**: Direct URL input

```javascript
app.post('/api/session/:sessionId/poll', async (req, res) => {
  const { title, mediaUrl, mediaType } = req.body;

  let finalUrl = mediaUrl;

  if (mediaType === 'video') {
    // Convert YouTube watch URL to embed URL
    const youtubeId = extractYouTubeId(mediaUrl);
    if (youtubeId) {
      finalUrl = `https://www.youtube.com/embed/${youtubeId}`;
    } else {
      return res.json({ success: false, error: 'Invalid YouTube URL' });
    }
  } else if (mediaType === 'image') {
    // Validate image URL
    if (!isValidImageUrl(mediaUrl)) {
      return res.json({ success: false, error: 'Invalid image URL' });
    }
  }

  const poll = {
    id: uuidv4(),
    title,
    mediaUrl: finalUrl,
    mediaType
  };

  session.polls.push(poll);
  await saveSession(session);

  res.json({ success: true, poll });
});
```

### URL Validation Functions

#### YouTube URL Extraction

```javascript
function extractYouTubeId(url) {
  // Supports multiple YouTube URL formats:
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID

  try {
    const urlObj = new URL(url);

    // Standard watch URL
    if (urlObj.hostname.includes('youtube.com') && urlObj.searchParams.has('v')) {
      return urlObj.searchParams.get('v');
    }

    // Short URL
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.substring(1);
    }

    // Embed URL
    if (urlObj.pathname.includes('/embed/')) {
      return urlObj.pathname.split('/embed/')[1];
    }

    return null;
  } catch (e) {
    return null;
  }
}
```

#### Image URL Validation

```javascript
function isValidImageUrl(url) {
  try {
    const urlObj = new URL(url);
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const pathname = urlObj.pathname.toLowerCase();

    return validExtensions.some(ext => pathname.endsWith(ext));
  } catch (e) {
    return false;
  }
}
```

### Supported Media Sources

#### Videos (YouTube only)

- **Input**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- **Converted**: `https://www.youtube.com/embed/dQw4w9WgXcQ`
- **Rendered**: `<iframe>` element

**Benefits**:

- ✅ YouTube's CDN handles streaming
- ✅ Adaptive quality based on connection
- ✅ No bandwidth cost to server
- ✅ Mobile-friendly player

#### Images (Direct URLs)

- **Supported**: Imgur, direct image links, CDN URLs
- **Format**: Must end in `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- **Rendered**: `<img>` element

**Example URLs**:

- `https://i.imgur.com/abc123.jpg`
- `https://example.com/image.png`
- `https://cdn.example.com/photo.webp`

**Benefits**:

- ✅ Instant loading
- ✅ No server storage needed
- ✅ Leverage existing CDNs

### Client-Side Implementation

**Host Interface (host.html)**:

```html
<div class="form-group">
  <label for="pollMedia">Media URL:</label>
  <input type="text" id="pollMedia" placeholder="YouTube URL or direct image URL" />
  <small>
    For videos: Use YouTube URLs (e.g., https://youtube.com/watch?v=xxxxx)<br />
    For images: Use direct URLs (e.g., https://i.imgur.com/xxxxx.jpg)
  </small>
</div>
```

**JavaScript (host.js)**:

```javascript
async function addPoll() {
  const title = document.getElementById('pollTitle').value;
  const mediaUrl = document.getElementById('pollMedia').value;

  // Determine media type
  let mediaType = 'image';
  if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
    mediaType = 'video';
  }

  const response = await fetch(`/api/session/${sessionId}/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, mediaUrl, mediaType })
  });

  const data = await response.json();

  if (data.success) {
    displayPoll(data.poll);
  } else {
    alert(data.error);
  }
}
```

---

## Real-time Polling Mechanism

The application needs real-time updates so voters see new polls immediately and hosts see votes as they come in. Two approaches were used.

### Local Development: Socket.IO (WebSockets)

**Server (server.js)**:

```javascript
const io = socketIo(server);

io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  // Voter joins session room
  socket.on('joinSession', sessionId => {
    socket.join(sessionId);
    console.log(`Voter joined session: ${sessionId}`);
  });

  // Host joins dedicated host room
  socket.on('joinHostSession', sessionId => {
    socket.join(`host-${sessionId}`);
    console.log(`Host joined session: ${sessionId}`);
  });

  // When host starts poll, notify all voters
  socket.on('startPoll', ({ sessionId, poll, pollIndex }) => {
    io.to(sessionId).emit('pollStarted', { poll, pollIndex });
  });

  // When voter submits, notify host
  socket.on('voteSubmitted', ({ sessionId, pollId }) => {
    const session = sessions.get(sessionId);
    const results = calculateResults(session, pollId);
    io.to(`host-${sessionId}`).emit('voteUpdate', results);
  });
});
```

**Client - Voter (voter.js)**:

```javascript
const socket = io();

// Join session room
socket.emit('joinSession', sessionId);

// Listen for new polls
socket.on('pollStarted', ({ poll, pollIndex }) => {
  currentPoll = poll;
  displayPoll(poll);
  showVotingInterface();
});

// Submit vote
function submitVote(rating) {
  socket.emit('voteSubmitted', { sessionId, pollId: currentPoll.id, voterId, rating });
  showSuccessMessage();
}
```

**Client - Host (host.js)**:

```javascript
const socket = io();

// Join host room
socket.emit('joinHostSession', sessionId);

// Start poll
function startPoll(pollIndex) {
  const poll = polls[pollIndex];
  socket.emit('startPoll', { sessionId, poll, pollIndex });
}

// Listen for vote updates
socket.on('voteUpdate', results => {
  updateResultsDisplay(results);
});
```

**Benefits**:

- ✅ Instant updates (< 100ms latency)
- ✅ Push-based (server pushes to clients)
- ✅ Efficient (one connection per client)

**Limitations**:

- ❌ Requires persistent server connection
- ❌ Not compatible with serverless (Vercel)
- ❌ Harder to scale horizontally

### Production: HTTP Polling

Since Vercel doesn't support WebSockets, the production version uses HTTP polling.

**Client - Voter (voter.js)**:

```javascript
let pollCheckInterval;

// Start polling when page loads
window.addEventListener('DOMContentLoaded', () => {
  checkForPoll(); // Check immediately
  pollCheckInterval = setInterval(checkForPoll, 2000); // Then every 2 seconds
});

async function checkForPoll() {
  const voterId = localStorage.getItem(`voterId_${sessionId}`);

  try {
    const response = await fetch(`/api/session/${sessionId}/current-poll?voterId=${voterId}`);
    const data = await response.json();

    if (data.currentPoll) {
      // New poll available
      currentPoll = data.currentPoll;

      if (data.hasVoted) {
        // Already voted, show locked state
        displayVotedState(data.voterRating);
      } else {
        // Can vote, show interface
        displayVotingInterface(data.currentPoll);
      }

      hideWaitingScreen();
    } else {
      // No active poll
      showWaitingScreen();
    }
  } catch (error) {
    console.error('Error checking poll:', error);
  }
}

// Clean up interval when leaving page
window.addEventListener('beforeunload', () => {
  clearInterval(pollCheckInterval);
});
```

**Client - Host (host.js)**:

```javascript
let resultsInterval;

function startPoll(pollIndex) {
  currentPollIndex = pollIndex;
  currentPoll = polls[pollIndex];

  // Tell server to start this poll
  await fetch(`/api/session/${sessionId}/start/${pollIndex}`, {
    method: 'POST'
  });

  // Show poll and start checking for results
  displayCurrentPoll();
  resultsInterval = setInterval(updateResults, 2000);
}

async function updateResults() {
  if (!currentPoll) return;

  try {
    const response = await fetch(
      `/api/session/${sessionId}/results/${currentPoll.id}`
    );
    const data = await response.json();

    // Update UI
    document.getElementById('totalVotes').textContent = data.totalVotes;
    document.getElementById('averageRating').textContent =
      data.average.toFixed(2);

    // Update voter list
    updateVoterList(data.votesWithEmails);
  } catch (error) {
    console.error('Error fetching results:', error);
  }
}

function stopResultsPolling() {
  clearInterval(resultsInterval);
}
```

### Comparison

| Feature        | Socket.IO                 | HTTP Polling               |
| -------------- | ------------------------- | -------------------------- |
| Latency        | < 100ms                   | ~2 seconds                 |
| Server Load    | Low (push-based)          | Higher (constant requests) |
| Scalability    | Complex (sticky sessions) | Simple (stateless)         |
| Serverless     | ❌ Not compatible         | ✅ Compatible              |
| Battery Impact | Low                       | Moderate                   |
| Implementation | Complex                   | Simple                     |

### Optimization Strategies

#### Exponential Backoff on Errors

```javascript
let pollInterval = 2000; // Start at 2 seconds
let consecutiveErrors = 0;

async function checkForPoll() {
  try {
    const response = await fetch(/* ... */);
    consecutiveErrors = 0; // Reset on success
    pollInterval = 2000;
  } catch (error) {
    consecutiveErrors++;
    pollInterval = Math.min(pollInterval * 2, 30000); // Max 30 seconds
  }
}
```

#### Stop Polling When Tab Hidden

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(pollCheckInterval);
  } else {
    pollCheckInterval = setInterval(checkForPoll, 2000);
    checkForPoll(); // Check immediately when tab becomes visible
  }
});
```

---

## Client-Side JavaScript

### Overview of JavaScript Files

The application has 6 main JavaScript files that handle different pages:

1. **index.js** - Landing page navigation
2. **host-login.js** - Host authentication
3. **session-select.js** - Session type selection
4. **host.js** - Host dashboard (370 lines)
5. **voter.js** - Voter interface (153 lines)
6. **music-player.js** - Background music (167 lines)

### 1. index.js - Landing Page

**Purpose**: Simple navigation to host or join flows

```javascript
// public/js/index.js

document.getElementById('hostBtn').addEventListener('click', () => {
  window.location.href = '/host-login';
});

document.getElementById('joinBtn').addEventListener('click', () => {
  window.location.href = '/join-session';
});
```

**File**: 8 lines
**Complexity**: Simple

---

### 2. host-login.js - Host Authentication

**Purpose**: Authenticate host and store token

```javascript
// public/js/host-login.js

const loginForm = document.getElementById('loginForm');
const errorDiv = document.getElementById('errorMessage');

loginForm.addEventListener('submit', async e => {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/host/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      // Store token in sessionStorage
      sessionStorage.setItem('hostToken', data.token);
      window.location.href = '/session-select';
    } else {
      // Show error
      errorDiv.textContent = data.error;
      errorDiv.classList.remove('hidden');
    }
  } catch (error) {
    errorDiv.textContent = 'Login failed. Please try again.';
    errorDiv.classList.remove('hidden');
  }
});

// Back button
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = '/';
});
```

**File**: ~40 lines
**Key Features**:

- Form validation
- Error handling
- Token storage
- Redirect on success

---

### 3. session-select.js - Session Management

**Purpose**: Create or manage voting sessions

**Key Features**:

- Create live session (instant)
- Create saved session (with custom name)
- View saved sessions list
- Edit/Present/Delete saved sessions
- Modal UI for session management

```javascript
// public/js/session-select.js

// Check authentication
const token = sessionStorage.getItem('hostToken');
if (!token) {
  window.location.href = '/host-login';
}

// Create live session (immediate)
document.getElementById('liveSessionBtn').addEventListener('click', async () => {
  const response = await fetch('/api/host/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ isLive: true })
  });

  const data = await response.json();
  if (data.success) {
    window.location.href = `/host/${data.sessionId}`;
  }
});

// Show saved sessions modal
document.getElementById('savedSessionsBtn').addEventListener('click', async () => {
  const modal = document.getElementById('savedSessionsModal');
  modal.classList.remove('hidden');

  // Fetch saved sessions
  const response = await fetch('/api/host/saved-sessions', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await response.json();
  displaySavedSessions(data.sessions);
});

// Create new saved session
document.getElementById('createSavedBtn').addEventListener('click', () => {
  const name = prompt('Enter session name:');
  if (!name) return;

  await fetch('/api/host/create-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ isLive: false, sessionName: name })
  });

  // Refresh list
  refreshSavedSessions();
});

function displaySavedSessions(sessions) {
  const container = document.getElementById('sessionsList');
  container.innerHTML = '';

  sessions.forEach(session => {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.innerHTML = `
      <div>
        <strong>${session.name}</strong>
        <small>${new Date(session.created).toLocaleString()}</small>
      </div>
      <div class="session-actions">
        <button onclick="editSession('${session.id}')">Edit</button>
        <button onclick="presentSession('${session.id}')">Present</button>
        <button onclick="deleteSession('${session.id}')">Delete</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function editSession(sessionId) {
  window.location.href = `/host/${sessionId}?mode=edit`;
}

function presentSession(sessionId) {
  window.location.href = `/host/${sessionId}?mode=present`;
}

async function deleteSession(sessionId) {
  if (!confirm('Delete this session?')) return;

  await fetch(`/api/host/session/${sessionId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  refreshSavedSessions();
}
```

**File**: ~150 lines
**Key Concepts**:

- Token-based auth
- Modal UI
- Session CRUD operations
- Query parameters for modes

---

### 4. host.js - Host Dashboard (370 lines)

**Purpose**: Main host interface for creating and presenting polls

**Key Sections**:

#### A. Initialization

```javascript
const sessionId = window.location.pathname.split('/').pop().split('?')[0];
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'live'; // live, edit, or present

let currentPollIndex = -1;
let currentPoll = null;
let polls = [];
let resultsInterval;

// Fetch session data on load
window.addEventListener('DOMContentLoaded', async () => {
  await loadSession();

  if (mode === 'edit') {
    showEditMode();
  } else if (mode === 'present') {
    showPresentMode();
  } else {
    showLiveMode();
  }
});
```

#### B. Poll Creation

```javascript
async function addPoll() {
  const title = document.getElementById('pollTitle').value;
  const mediaUrl = document.getElementById('pollMedia').value;

  if (!title || !mediaUrl) {
    alert('Please fill in all fields');
    return;
  }

  // Determine media type
  let mediaType = 'image';
  if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
    mediaType = 'video';
  }

  // Validate URL
  try {
    new URL(mediaUrl);
  } catch (e) {
    alert('Invalid URL');
    return;
  }

  const response = await fetch(`/api/session/${sessionId}/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, mediaUrl, mediaType })
  });

  const data = await response.json();

  if (data.success) {
    polls.push(data.poll);
    displayPollInList(data.poll);
    clearPollForm();
  } else {
    alert(data.error);
  }
}

function displayPollInList(poll) {
  const container = document.getElementById('pollsContainer');
  const div = document.createElement('div');
  div.className = 'poll-item';
  div.innerHTML = `
    <strong>${poll.title}</strong>
    <small>${poll.mediaType === 'video' ? '📹 Video' : '🖼️ Image'}</small>
  `;
  container.appendChild(div);
}
```

#### C. Starting Voting Session

```javascript
async function startVotingSession() {
  if (polls.length === 0) {
    alert('Add at least one poll first');
    return;
  }

  // Hide setup, show voting interface
  document.getElementById('pollSetup').classList.add('hidden');
  document.getElementById('votingSection').classList.remove('hidden');

  // Start first poll
  await startPoll(0);
}

async function startPoll(pollIndex) {
  currentPollIndex = pollIndex;
  currentPoll = polls[pollIndex];

  // Tell server to activate this poll
  await fetch(`/api/session/${sessionId}/start/${pollIndex}`, {
    method: 'POST'
  });

  // Display poll
  displayCurrentPoll();

  // Start polling for results
  updateResults(); // Get initial results
  resultsInterval = setInterval(updateResults, 2000);

  // Update progress
  updateProgress();
}

function displayCurrentPoll() {
  document.getElementById('pollTitle').textContent = currentPoll.title;

  const mediaContainer = document.getElementById('mediaContainer');
  mediaContainer.innerHTML = '';

  if (currentPoll.mediaType === 'video') {
    // YouTube embed
    const iframe = document.createElement('iframe');
    iframe.src = currentPoll.mediaUrl;
    iframe.width = '100%';
    iframe.height = '500';
    iframe.frameBorder = '0';
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    mediaContainer.appendChild(iframe);
  } else {
    // Image
    const img = document.createElement('img');
    img.src = currentPoll.mediaUrl;
    img.alt = currentPoll.title;
    mediaContainer.appendChild(img);
  }
}
```

#### D. Results Polling

```javascript
async function updateResults() {
  if (!currentPoll) return;

  try {
    const response = await fetch(`/api/session/${sessionId}/results/${currentPoll.id}`);
    const data = await response.json();

    // Update stats
    document.getElementById('totalVotes').textContent = data.totalVotes;
    document.getElementById('averageRating').textContent = data.average
      ? data.average.toFixed(2)
      : '0.00';

    // Update voter list
    const ratingsList = document.getElementById('ratingsList');
    ratingsList.innerHTML = '';

    data.votesWithEmails.forEach(vote => {
      const div = document.createElement('div');
      div.className = 'rating-item';
      div.textContent = `${vote.email}: ${vote.rating}/10`;
      ratingsList.appendChild(div);
    });
  } catch (error) {
    console.error('Error updating results:', error);
  }
}
```

#### E. Poll Navigation

```javascript
async function nextPoll() {
  // Stop results polling
  clearInterval(resultsInterval);

  // Check if more polls exist
  if (currentPollIndex + 1 < polls.length) {
    await startPoll(currentPollIndex + 1);
  } else {
    finishSession();
  }
}

function finishSession() {
  clearInterval(resultsInterval);

  // Hide voting section
  document.getElementById('votingSection').classList.add('hidden');

  // Show completed polls summary
  displayCompletedPolls();
}

async function displayCompletedPolls() {
  const container = document.getElementById('completedPollsContainer');
  container.innerHTML = '';

  for (const poll of polls) {
    const response = await fetch(`/api/session/${sessionId}/results/${poll.id}`);
    const data = await response.json();

    const card = createCompletedPollCard(poll, data);
    container.appendChild(card);
  }

  document.getElementById('sessionResults').classList.remove('hidden');
}

function createCompletedPollCard(poll, results) {
  const card = document.createElement('div');
  card.className = 'completed-poll-card';

  const header = document.createElement('div');
  header.className = 'completed-poll-header';
  header.innerHTML = `
    <h3>${poll.title}</h3>
    <div class="poll-summary">
      <span>📊 ${results.totalVotes} votes</span>
      <span>⭐ ${results.average.toFixed(2)} average</span>
      <span class="dropdown-arrow">▼</span>
    </div>
  `;

  const details = document.createElement('div');
  details.className = 'completed-poll-details hidden';
  details.innerHTML = `
    <h4>Individual Ratings:</h4>
    ${results.votesWithEmails
      .map(
        v =>
          `<div class="vote-detail">
        <strong>${v.email}:</strong> ${v.rating}/10
      </div>`
      )
      .join('')}
  `;

  // Toggle details on click
  header.addEventListener('click', () => {
    details.classList.toggle('hidden');
    const arrow = header.querySelector('.dropdown-arrow');
    arrow.textContent = details.classList.contains('hidden') ? '▼' : '▲';
  });

  card.appendChild(header);
  card.appendChild(details);
  return card;
}
```

#### F. Mode Handling

```javascript
function showEditMode() {
  // Show poll creation
  document.getElementById('pollSetup').classList.remove('hidden');

  // Add "Save Session" button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Session';
  saveBtn.className = 'btn btn-success';
  saveBtn.onclick = () => {
    alert('Session saved!');
    window.location.href = '/session-select';
  };
  document.getElementById('pollSetup').appendChild(saveBtn);
}

function showPresentMode() {
  // Hide poll creation (can't edit while presenting)
  document.getElementById('pollCreation').classList.add('hidden');

  // Show "Start Presenting" button
  const startBtn = document.createElement('button');
  startBtn.textContent = 'Start Presenting';
  startBtn.className = 'btn btn-primary btn-large';
  startBtn.onclick = startVotingSession;
  document.getElementById('pollSetup').appendChild(startBtn);
}

function showLiveMode() {
  // Show everything, start immediately when ready
  document.getElementById('pollSetup').classList.remove('hidden');
}
```

**File**: 370 lines
**Key Features**:

- Poll CRUD
- Media rendering (YouTube/images)
- Real-time results
- Progress tracking
- Session completion summary
- Three modes (live, edit, present)

---

### 5. voter.js - Voter Interface (153 lines)

**Purpose**: Allow voters to rate content

**Key Sections**:

#### A. Initialization

```javascript
const sessionId = window.location.pathname.split('/').pop();
const voterId = localStorage.getItem(`voterId_${sessionId}`);
const voterEmail = localStorage.getItem(`voterEmail_${sessionId}`);

let currentPoll = null;
let pollCheckInterval;

// Redirect if not authenticated
if (!voterId || !voterEmail) {
  window.location.href = '/join-session';
}

// Start checking for polls
window.addEventListener('DOMContentLoaded', () => {
  checkForPoll(); // Check immediately
  pollCheckInterval = setInterval(checkForPoll, 2000); // Every 2 seconds
});
```

#### B. Poll Checking

```javascript
async function checkForPoll() {
  try {
    const response = await fetch(`/api/session/${sessionId}/current-poll?voterId=${voterId}`);
    const data = await response.json();

    if (data.currentPoll) {
      currentPoll = data.currentPoll;

      if (data.hasVoted) {
        // Already voted
        displayVotedState(data.voterRating);
      } else {
        // Can vote
        displayPoll(currentPoll);
      }

      // Hide waiting screen
      document.getElementById('waitingScreen').classList.add('hidden');
      document.getElementById('votingScreen').classList.remove('hidden');
    } else {
      // No active poll
      document.getElementById('waitingScreen').classList.remove('hidden');
      document.getElementById('votingScreen').classList.add('hidden');
    }
  } catch (error) {
    console.error('Error checking for poll:', error);
  }
}
```

#### C. Poll Display

```javascript
function displayPoll(poll) {
  // Set title
  document.getElementById('pollTitle').textContent = poll.title;

  // Render media
  const mediaContainer = document.getElementById('mediaContainer');
  mediaContainer.innerHTML = '';

  if (poll.mediaType === 'video') {
    const iframe = document.createElement('iframe');
    iframe.src = poll.mediaUrl;
    iframe.width = '100%';
    iframe.height = '400';
    iframe.frameBorder = '0';
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    mediaContainer.appendChild(iframe);
  } else {
    const img = document.createElement('img');
    img.src = poll.mediaUrl;
    img.alt = poll.title;
    mediaContainer.appendChild(img);
  }

  // Enable voting UI
  document.getElementById('ratingSlider').disabled = false;
  document.getElementById('ratingInput').disabled = false;
  document.getElementById('submitVote').disabled = false;
  document.getElementById('submitMessage').classList.add('hidden');
}
```

#### D. Rating Input Synchronization

```javascript
const slider = document.getElementById('ratingSlider');
const input = document.getElementById('ratingInput');

// Slider → Input
slider.addEventListener('input', e => {
  input.value = e.target.value;
});

// Input → Slider
input.addEventListener('input', e => {
  let value = parseInt(e.target.value);

  // Validate range
  if (value < 0) value = 0;
  if (value > 10) value = 10;

  slider.value = value;
  input.value = value;
});
```

#### E. Vote Submission

```javascript
document.getElementById('submitVote').addEventListener('click', async () => {
  const rating = parseInt(document.getElementById('ratingInput').value);

  if (rating < 0 || rating > 10) {
    showMessage('Please enter a rating between 0 and 10', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/session/${sessionId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId: currentPoll.id,
        voterId,
        rating
      })
    });

    const data = await response.json();

    if (data.success) {
      showMessage('Vote submitted successfully!', 'success');
      displayVotedState(rating);
    } else {
      showMessage(data.error, 'error');
    }
  } catch (error) {
    showMessage('Failed to submit vote', 'error');
  }
});

function displayVotedState(rating) {
  // Disable inputs
  document.getElementById('ratingSlider').disabled = true;
  document.getElementById('ratingInput').disabled = true;
  document.getElementById('submitVote').disabled = true;

  // Set to voted value
  document.getElementById('ratingSlider').value = rating;
  document.getElementById('ratingInput').value = rating;

  // Show locked message
  showMessage(`You rated this ${rating}/10. Waiting for next poll...`, 'success');
}

function showMessage(text, type) {
  const messageDiv = document.getElementById('submitMessage');
  messageDiv.textContent = text;
  messageDiv.className = `submit-message ${type}`;
  messageDiv.classList.remove('hidden');
}
```

**File**: 153 lines
**Key Features**:

- Automatic poll detection
- Media rendering
- Synchronized slider/input
- Vote submission
- Locked state after voting
- Waiting screen

---

### 6. music-player.js - Background Music (167 lines)

**Purpose**: Persistent background music across all pages

**Key Features**:

- Auto-play on page load
- Persistent playback position across pages
- Compact UI (expands on hover)
- Volume control
- Mute toggle
- Settings saved to localStorage

#### A. Player Injection

```javascript
(function () {
  const playerHTML = `
    <div class="music-player" id="musicPlayer">
      <audio id="bgMusic" loop autoplay>
        <source src="/audio/background-music.mp3" type="audio/mpeg">
      </audio>
      <div class="music-controls">
        <button class="music-btn" id="playPauseBtn" title="Play/Pause">⏸️</button>
        <button class="music-btn" id="muteBtn" title="Mute/Unmute">🔊</button>
      </div>
      <div class="volume-control">
        <input type="range" id="volumeSlider" class="volume-slider"
               min="0" max="100" value="50">
        <span class="music-info" id="volumeDisplay">50%</span>
      </div>
    </div>
  `;

  // Inject into page
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayer);
  } else {
    initPlayer();
  }

  function initPlayer() {
    document.body.insertAdjacentHTML('beforeend', playerHTML);
    setupPlayer();
  }
})();
```

#### B. Settings Persistence

```javascript
function setupPlayer() {
  const audio = document.getElementById('bgMusic');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const muteBtn = document.getElementById('muteBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeDisplay = document.getElementById('volumeDisplay');

  // Load saved settings
  const savedVolume = localStorage.getItem('musicVolume') || 50;
  const wasMuted = localStorage.getItem('musicMuted') === 'true';
  const savedTime = parseFloat(localStorage.getItem('musicTime') || 0);

  // Apply settings
  audio.volume = savedVolume / 100;
  volumeSlider.value = savedVolume;
  volumeDisplay.textContent = savedVolume + '%';

  if (wasMuted) {
    audio.muted = true;
    muteBtn.textContent = '🔇';
  }

  // Restore playback position
  audio.addEventListener('loadedmetadata', () => {
    if (savedTime > 0) {
      audio.currentTime = savedTime;
    }
  });

  audio.load();
}
```

#### C. Autoplay Logic

```javascript
// Try to autoplay
setTimeout(() => {
  const playAttempt = audio.play();

  if (playAttempt !== undefined) {
    playAttempt
      .then(() => {
        console.log('Audio playing successfully');
        playPauseBtn.textContent = '⏸️';
        localStorage.setItem('musicPlaying', 'true');
      })
      .catch(err => {
        console.log('Auto-play prevented:', err);
        playPauseBtn.textContent = '▶️';
      });
  }
}, 100);

// Fallback: Start on any user interaction
const handleFirstInteraction = () => {
  if (audio.paused) {
    console.log('Starting playback on user interaction');
    audio.play().catch(err => console.log('Play failed:', err));
  }
  document.removeEventListener('click', handleFirstInteraction);
  document.removeEventListener('keydown', handleFirstInteraction);
};

document.addEventListener('click', handleFirstInteraction, { once: true });
document.addEventListener('keydown', handleFirstInteraction, { once: true });
```

#### D. Controls

```javascript
// Play/Pause
playPauseBtn.addEventListener('click', e => {
  e.stopPropagation();

  if (audio.paused) {
    audio.play();
    playPauseBtn.textContent = '⏸️';
    localStorage.setItem('musicPlaying', 'true');
  } else {
    audio.pause();
    playPauseBtn.textContent = '▶️';
    localStorage.setItem('musicPlaying', 'false');
  }
});

// Mute
muteBtn.addEventListener('click', () => {
  audio.muted = !audio.muted;
  muteBtn.textContent = audio.muted ? '🔇' : '🔊';
  localStorage.setItem('musicMuted', audio.muted);
});

// Volume
volumeSlider.addEventListener('input', e => {
  const volume = e.target.value;
  audio.volume = volume / 100;
  volumeDisplay.textContent = volume + '%';
  localStorage.setItem('musicVolume', volume);

  // Unmute if adjusting volume
  if (audio.muted && volume > 0) {
    audio.muted = false;
    muteBtn.textContent = '🔊';
    localStorage.setItem('musicMuted', 'false');
  }
});
```

#### E. Position Saving

```javascript
// Save position every second
setInterval(() => {
  if (!audio.paused) {
    localStorage.setItem('musicTime', audio.currentTime);
  }
}, 1000);

// Save before page unload
window.addEventListener('beforeunload', () => {
  localStorage.setItem('musicTime', audio.currentTime);
  localStorage.setItem('musicPlaying', !audio.paused);
});
```

**File**: 167 lines
**Key Features**:

- IIFE (Immediately Invoked Function Expression) pattern
- Cross-page persistence
- Autoplay with fallback
- Compact hover UI
- localStorage integration

---

## CSS Styling

### Design System

The application uses a cohesive design system with consistent colors, typography, and spacing.

#### Color Palette

```css
/* Primary Colors */
--primary: #667eea; /* Purple-blue for primary actions */
--primary-hover: #5568d3; /* Darker on hover */

/* Success */
--success: #48bb78; /* Green for confirmation */
--success-hover: #38a169;

/* Secondary */
--secondary: #718096; /* Gray for secondary actions */
--secondary-hover: #4a5568;

/* Background Gradient */
--gradient-start: #e91e8c; /* Pink */
--gradient-end: #764ba2; /* Purple */

/* Text */
--text-dark: #333;
--text-medium: #555;
--text-light: #666;

/* Backgrounds */
--bg-light: #f7fafc;
--bg-white: #ffffff;

/* Borders */
--border-light: #ddd;
--border-medium: #e2e8f0;
```

#### Typography

```css
/* Font Stack */
font-family:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;

/* Headings */
h1 {
  font-size: 2.5em;
} /* 40px */
h2 {
  font-size: 1.8em;
} /* ~29px */
h3 {
  font-size: 1.3em;
} /* ~21px */

/* Subtitle */
.subtitle {
  font-size: 1.8em;
  font-weight: 600;
}
```

#### Spacing System

```css
/* Padding */
--spacing-xs: 10px;
--spacing-sm: 15px;
--spacing-md: 20px;
--spacing-lg: 40px;

/* Border Radius */
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 50%;
```

### Global Styles

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: linear-gradient(135deg, #e91e8c 0%, #764ba2 100%);
  background-image:
    url('/images/background-pattern.png'), linear-gradient(135deg, #e91e8c 0%, #764ba2 100%);
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  min-height: 100vh;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**Key Features**:

- Gradient background with pattern overlay
- `background-size: cover` - scales image to fill viewport
- `background-attachment: fixed` - parallax effect
- Flexbox centering - centers content vertically and horizontally

### Card Styles

```css
.welcome-card,
.host-dashboard,
.voter-view {
  background: white;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}

.welcome-card {
  text-align: center;
}

.welcome-card .subtitle {
  font-size: 1.8em;
  font-weight: 600;
  color: #555;
  margin-bottom: 20px;
}
```

### Button Styles

```css
.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-success {
  background: #48bb78;
  color: white;
  margin-top: 20px;
}

.btn-success:hover {
  background: #38a169;
  transform: translateY(-2px);
}

.btn-secondary {
  background: #718096;
  color: white;
  margin-left: 10px;
}

.btn-secondary:hover {
  background: #4a5568;
}

.btn:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
}

.btn-large {
  padding: 16px 32px;
  font-size: 18px;
  margin: 10px;
}

.btn-small {
  padding: 8px 16px;
  font-size: 14px;
}
```

**Key Features**:

- Hover lift effect (`translateY(-2px)`)
- Shadow on hover for depth
- Disabled state styling
- Size variants

### Music Player Styles

```css
.music-player {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 0;
  border-radius: 50%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  z-index: 1000;
  width: 60px;
  height: 60px;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.music-player:hover {
  width: 300px;
  border-radius: 12px;
  padding: 15px 20px;
  gap: 15px;
}
```

**Key Features**:

- **Glassmorphism**: `backdrop-filter: blur(10px)` for frosted glass effect
- **Compact by default**: 60px circle
- **Expands on hover**: 300px wide with smooth transition
- **Cubic-bezier easing**: Professional animation curve

#### Hidden Controls (Expand on Hover)

```css
.music-player #playPauseBtn {
  opacity: 0;
  width: 0;
  padding: 0;
  margin: 0;
  transition: all 0.3s ease;
}

.music-player:hover #playPauseBtn {
  opacity: 1;
  width: 40px;
  padding: 8px;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  width: 0;
  transition: all 0.3s ease;
}

.music-player:hover .volume-control {
  opacity: 1;
  width: auto;
}
```

### Form Styles

```css
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #555;
  font-weight: 600;
}

.form-group input[type='text'],
.form-group input[type='file'] {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}
```

### Rating Slider Styles

```css
#ratingSlider {
  flex: 1;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: #ddd;
  border-radius: 4px;
  outline: none;
}

#ratingSlider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  background: #667eea;
  border-radius: 50%;
  cursor: pointer;
}

#ratingSlider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  background: #667eea;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

#ratingInput {
  width: 80px;
  padding: 10px;
  border: 2px solid #667eea;
  border-radius: 6px;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
}
```

### Media Container

```css
.media-container {
  margin: 20px 0;
  text-align: center;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.media-container img,
.media-container video {
  max-width: 100%;
  max-height: 700px;
  display: block;
  margin: 0 auto;
}
```

### Results Panel

```css
.results-panel {
  background: #f7fafc;
  padding: 25px;
  border-radius: 8px;
  margin: 30px 0;
}

.stats {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.stat-box {
  flex: 1;
  background: white;
  padding: 20px;
  border-radius: 6px;
  text-align: center;
}

.stat-label {
  display: block;
  color: #666;
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-value {
  display: block;
  color: #667eea;
  font-size: 32px;
  font-weight: bold;
}
```

### Completed Poll Cards

```css
.completed-poll-card {
  background: #f7fafc;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.completed-poll-header {
  padding: 20px;
  cursor: pointer;
  transition: background 0.2s;
}

.completed-poll-header:hover {
  background: #edf2f7;
}

.dropdown-arrow {
  margin-left: auto;
  font-size: 16px;
  color: #667eea;
  font-weight: bold;
}

.completed-poll-details {
  padding: 0 20px 20px 20px;
  background: white;
}

.vote-detail {
  padding: 10px;
  background: #f7fafc;
  margin-bottom: 8px;
  border-radius: 6px;
  border-left: 3px solid #667eea;
}
```

### Responsive Design

```css
@media (max-width: 768px) {
  .welcome-card,
  .host-dashboard,
  .voter-view {
    padding: 20px;
  }

  h1 {
    font-size: 1.8em;
  }

  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 15px;
  }

  .stats {
    flex-direction: column;
  }

  .rating-input-group {
    flex-direction: column;
    align-items: stretch;
  }

  #ratingInput {
    width: 100%;
  }

  .poll-summary {
    flex-wrap: wrap;
  }

  .music-player {
    bottom: 10px;
    right: 10px;
    width: 50px;
    height: 50px;
  }

  .music-player:hover {
    width: 250px;
  }

  .volume-slider {
    width: 60px;
  }
}
```

---

## HTML Views

### 1. index.html - Landing Page

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Team Polling App</title>
    <link rel="stylesheet" href="/css/style.css" />
  </head>
  <body>
    <div class="container">
      <div class="welcome-card">
        <h1>Content Production Team Roundtable</h1>
        <p class="subtitle">🎊 It's Friday! 🎊</p>

        <div class="action-section">
          <div class="button-group">
            <button id="hostBtn" class="btn btn-primary btn-large">Host Session</button>
            <button id="joinBtn" class="btn btn-primary btn-large">Join Session</button>
          </div>
        </div>
      </div>
    </div>

    <script src="/js/music-player.js"></script>
    <script src="/js/index.js"></script>
  </body>
</html>
```

**Key Features**:

- Centered layout (via CSS flexbox on body)
- Two call-to-action buttons
- Music player auto-injected via script
- Simple, clean design

---

### 2. host-login.html - Host Authentication

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Host Login</title>
    <link rel="stylesheet" href="/css/style.css" />
  </head>
  <body>
    <div class="container">
      <div class="welcome-card">
        <h1>Host Login</h1>

        <form id="loginForm" class="login-form">
          <div id="errorMessage" class="error-message hidden"></div>

          <div class="form-group">
            <label for="username">Username:</label>
            <input type="text" id="username" required />
          </div>

          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" required />
          </div>

          <button type="submit" class="btn btn-primary">Login</button>
          <button type="button" id="backBtn" class="btn btn-secondary">Back</button>
        </form>
      </div>
    </div>

    <script src="/js/music-player.js"></script>
    <script src="/js/host-login.js"></script>
  </body>
</html>
```

**Key Features**:

- Standard login form
- Error message display
- Back button for navigation

---

### 3. session-select.html - Session Type Selection

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Select Session Type</title>
    <link rel="stylesheet" href="/css/style.css" />
    <style>
      .session-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-top: 30px;
      }

      .session-card {
        background: #f7fafc;
        padding: 30px;
        border-radius: 12px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        border: 2px solid transparent;
      }

      .session-card:hover {
        background: white;
        border-color: #667eea;
        transform: translateY(-5px);
        box-shadow: 0 8px 20px rgba(102, 126, 234, 0.2);
      }

      .modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        align-items: center;
        justify-content: center;
      }

      .modal:not(.hidden) {
        display: flex;
      }

      .modal-content {
        background: white;
        padding: 40px;
        border-radius: 12px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="host-dashboard">
        <h1>Select Session Type</h1>

        <div class="session-options">
          <div class="session-card" id="liveSessionBtn">
            <h2>🎬 Start Live Session</h2>
            <p>Create and present polls immediately</p>
          </div>

          <div class="session-card" id="savedSessionsBtn">
            <h2>💾 Saved Sessions</h2>
            <p>Create, edit, or present saved sessions</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal for saved sessions -->
    <div id="savedSessionsModal" class="modal hidden">
      <div class="modal-content">
        <h2>Saved Sessions</h2>
        <button id="createSavedBtn" class="btn btn-primary">Create New Saved Session</button>
        <div id="sessionsList"></div>
        <button id="closeModal" class="btn btn-secondary">Close</button>
      </div>
    </div>

    <script src="/js/music-player.js"></script>
    <script src="/js/session-select.js"></script>
  </body>
</html>
```

**Key Features**:

- Card-based UI for options
- Modal overlay for saved sessions
- Embedded styles for custom components

---

### 4. host.html - Host Dashboard

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Host Dashboard</title>
    <link rel="stylesheet" href="/css/style.css" />
  </head>
  <body>
    <div class="container">
      <div class="host-dashboard">
        <!-- Header -->
        <div class="header">
          <div class="session-info">
            <h1>Host Dashboard</h1>
            <div class="session-id-box">
              <div class="id-display">
                <span>Session ID:</span>
                <strong id="sessionIdDisplay"></strong>
                <button class="btn btn-small" id="copyIdBtn">Copy</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Poll Setup Section -->
        <div id="pollSetup">
          <div id="pollCreation" class="poll-form">
            <h2>Create Polls</h2>

            <div class="form-group">
              <label for="pollTitle">Poll Question:</label>
              <input type="text" id="pollTitle" placeholder="What would you like to ask?" />
            </div>

            <div class="form-group">
              <label for="pollMedia">Media URL:</label>
              <input type="text" id="pollMedia" placeholder="YouTube URL or direct image URL" />
              <small>
                For videos: Use YouTube URLs (e.g., https://youtube.com/watch?v=xxxxx)<br />
                For images: Use direct image URLs (e.g., https://i.imgur.com/xxxxx.jpg)
              </small>
            </div>

            <button id="addPollBtn" class="btn btn-primary">Add Poll</button>
          </div>

          <!-- Created Polls List -->
          <div class="polls-list">
            <h3>Created Polls</h3>
            <div id="pollsContainer"></div>
          </div>

          <button id="startSessionBtn" class="btn btn-success btn-large">
            Start Voting Session
          </button>
        </div>

        <!-- Voting Section (hidden initially) -->
        <div id="votingSection" class="hidden">
          <div class="host-vote-section">
            <h2 id="currentPollTitle"></h2>

            <!-- Media Display -->
            <div id="mediaContainer" class="media-container"></div>

            <!-- Results Panel -->
            <div class="results-panel">
              <h3>Live Results</h3>

              <div class="stats">
                <div class="stat-box">
                  <span class="stat-label">Total Votes</span>
                  <span class="stat-value" id="totalVotes">0</span>
                </div>
                <div class="stat-box">
                  <span class="stat-label">Average Rating</span>
                  <span class="stat-value" id="averageRating">0.00</span>
                </div>
              </div>

              <h4>Individual Ratings:</h4>
              <div class="ratings-list" id="ratingsList"></div>
            </div>

            <!-- Poll Controls -->
            <div class="poll-controls">
              <span id="pollProgress"></span>
              <div>
                <button id="nextPollBtn" class="btn btn-primary">Next Poll</button>
                <button id="finishBtn" class="btn btn-success">Finish Session</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Completed Polls Summary -->
        <div id="sessionResults" class="session-results hidden">
          <h2>Session Complete!</h2>
          <p>All polls have been completed. Here are the results:</p>
          <div id="completedPollsContainer"></div>
        </div>
      </div>
    </div>

    <script src="/js/music-player.js"></script>
    <script src="/js/host.js"></script>
  </body>
</html>
```

**Key Sections**:

1. **Header**: Session ID display with copy button
2. **Poll Setup**: Form to create polls
3. **Voting Section**: Live results during presentation
4. **Completed Summary**: Final results after session

---

### 5. join-session.html - Voter Join

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Join Session</title>
    <link rel="stylesheet" href="/css/style.css" />
  </head>
  <body>
    <div class="container">
      <div class="welcome-card">
        <h1>Join Voting Session</h1>

        <div class="login-form">
          <div id="errorMessage" class="error-message hidden"></div>

          <div class="form-group">
            <label for="voterEmail">Your Email:</label>
            <input type="email" id="voterEmail" required />
          </div>

          <div class="form-group">
            <label for="sessionId">Session ID:</label>
            <input
              type="text"
              id="sessionId"
              placeholder="ABC12345"
              style="text-transform: uppercase"
              required
            />
          </div>

          <button id="joinBtn" class="btn btn-primary">Join Session</button>
          <button id="backBtn" class="btn btn-secondary">Back</button>
        </div>
      </div>
    </div>

    <script src="/js/music-player.js"></script>
    <script src="/js/join-session.js"></script>
  </body>
</html>
```

**Key Features**:

- Email input for identification
- Session ID input (auto-uppercase)
- Error handling

---

### 6. voter.html - Voter Interface

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vote</title>
    <link rel="stylesheet" href="/css/style.css" />
  </head>
  <body>
    <div class="container">
      <div class="voter-view">
        <!-- Waiting Screen -->
        <div id="waitingScreen" class="waiting-screen">
          <div class="waiting-message">
            <h2>Waiting for host to start the poll...</h2>
            <div class="spinner"></div>
          </div>
        </div>

        <!-- Voting Screen (hidden initially) -->
        <div id="votingScreen" class="hidden">
          <h2 id="pollTitle"></h2>

          <!-- Media Display -->
          <div id="mediaContainer" class="media-container"></div>

          <!-- Rating Section -->
          <div class="rating-section">
            <label>Rate this content (0-10):</label>

            <div class="rating-input-group">
              <input type="range" id="ratingSlider" min="0" max="10" value="5" />
              <input type="number" id="ratingInput" min="0" max="10" value="5" />
            </div>

            <button id="submitVote" class="btn btn-success">Submit Vote</button>

            <div id="submitMessage" class="submit-message hidden"></div>
          </div>
        </div>
      </div>
    </div>

    <script src="/js/music-player.js"></script>
    <script src="/js/voter.js"></script>
  </body>
</html>
```

**Key Sections**:

1. **Waiting Screen**: Shown when no active poll
2. **Voting Screen**: Poll display and rating interface

---

## Application Workflow

### Complete User Journeys

#### Host Journey (Detailed)

**Step 1: Landing Page**

- User visits `/`
- Sees title: "Content Production Team Roundtable"
- Subtitle: "🎊 It's Friday! 🎊"
- Clicks "Host Session" button

**Step 2: Authentication**

- Redirected to `/host-login`
- Enters credentials:
  - Username: `GrowthBossHosting`
  - Password: `y&%)U#2+${QF/wG7`
- JavaScript sends POST to `/api/host/login`
- Server validates, generates UUID token
- Token stored in:
  - Redis: `host:token:{token}` (24h TTL)
  - sessionStorage: `hostToken`
- Redirected to `/session-select`

**Step 3: Session Type Selection**

- Page checks for `hostToken` in sessionStorage
- If missing, redirects to login
- Two options presented:

**Option A: Live Session**

1. Click "Start Live Session" card
2. JavaScript calls `POST /api/host/create-session { isLive: true }`
3. Server creates session with 8-char ID (e.g., `ABC12345`)
4. Session saved to Redis
5. Redirect to `/host/ABC12345`

**Option B: Saved Session**

1. Click "Saved Sessions" card
2. Modal opens showing existing saved sessions
3. Can choose to:
   - **Create New**: Prompt for name → `POST /api/host/create-session { isLive: false, sessionName }`
   - **Edit Existing**: Click "Edit" → `/host/{id}?mode=edit`
   - **Present Existing**: Click "Present" → `/host/{id}?mode=present`
   - **Delete**: Click "Delete" → `DELETE /api/host/session/{id}`

**Step 4: Host Dashboard (Live Mode)**

- Page loads with session ID: `ABC12345`
- Poll creation form shown:
  - Poll Question input
  - Media URL input (with guidance)
- Host adds polls:
  1. Enter title: "Rate this video"
  2. Enter URL: `https://youtube.com/watch?v=dQw4w9WgXcQ`
  3. Click "Add Poll"
  4. JavaScript:
     - Determines mediaType (video vs image)
     - Sends `POST /api/session/ABC12345/poll`
  5. Server:
     - Extracts YouTube ID: `dQw4w9WgXcQ`
     - Converts to embed: `https://youtube.com/embed/dQw4w9WgXcQ`
     - Creates poll object with UUID
     - Adds to session.polls array
     - Saves to Redis
  6. Poll appears in "Created Polls" list
  7. Repeat for more polls

**Step 5: Share Session**

- Session ID displayed at top: `ABC12345`
- "Copy" button copies to clipboard
- Host shares ID with team (Slack, email, etc.)

**Step 6: Start Voting**

- Host clicks "Start Voting Session" button
- Poll setup section hides
- Voting section shows
- First poll activated:
  1. JavaScript calls `POST /api/session/ABC12345/start/0`
  2. Server sets `session.currentPollIndex = 0`
  3. Server initializes votes Map for this poll
  4. Poll title displayed
  5. Media rendered:
     - Video: YouTube iframe
     - Image: `<img>` tag
  6. Results panel shown (initially 0 votes)

**Step 7: Monitor Votes**

- JavaScript polls `/api/session/ABC12345/results/{pollId}` every 2 seconds
- Updates displayed:
  - Total Votes: 0 → 1 → 2 → ...
  - Average Rating: updates in real-time
  - Individual Ratings list: shows email + rating
- Host watches votes come in live

**Step 8: Move to Next Poll**

- Host clicks "Next Poll" button
- Current results polling stops
- Next poll activated (index 1)
- Process repeats

**Step 9: Finish Session**

- After last poll, "Next Poll" disabled
- Host clicks "Finish Session"
- Voting section hides
- Completed polls summary shows:
  - Each poll as expandable card
  - Click to see detailed results
  - Individual voter ratings listed

**Step 10: Session Ends**

- Session remains in Redis for 24 hours
- After TTL expires, data automatically deleted

---

#### Voter Journey (Detailed)

**Step 1: Join Session**

- User visits `/`
- Clicks "Join Session" button
- Redirected to `/join-session`

**Step 2: Enter Credentials**

- Enter email: `voter@example.com`
- Enter session ID: `ABC12345` (from host)
- Click "Join Session"
- JavaScript:
  1. Calls `POST /api/session/verify { sessionId: "ABC12345", email: "voter@example.com" }`
  2. Server checks if session exists
  3. If valid:
     - Generates UUID for voter: `550e8400...`
     - Adds to session.voters Map: `{ voterId: email }`
     - Saves to Redis
     - Returns `{ success: true, voterId }`
  4. JavaScript stores in localStorage:
     - `voterId_ABC12345`: UUID
     - `voterEmail_ABC12345`: email
  5. Redirect to `/vote/ABC12345`

**Step 3: Waiting Screen**

- Voter page loads
- Checks localStorage for voterId
- If missing, redirects to join page
- Shows waiting screen:
  - Message: "Waiting for host to start the poll..."
  - Animated spinner
- JavaScript starts polling:
  - `GET /api/session/ABC12345/current-poll?voterId={id}` every 2 seconds
  - Initially returns empty (no active poll)

**Step 4: Poll Starts**

- Host activates poll on their end
- Voter's next poll check returns:
  ```json
  {
    "currentPoll": {
      "id": "uuid",
      "title": "Rate this video",
      "mediaUrl": "https://youtube.com/embed/dQw4w9WgXcQ",
      "mediaType": "video"
    },
    "hasVoted": false
  }
  ```
- JavaScript:
  1. Hides waiting screen
  2. Shows voting screen
  3. Renders poll title
  4. Renders media (YouTube iframe)
  5. Enables rating controls

**Step 5: Submit Vote**

- Voter adjusts slider: 0 → 8
- Number input updates simultaneously
- Click "Submit Vote"
- JavaScript:
  1. Gets rating value: `8`
  2. Calls `POST /api/session/ABC12345/vote`
     ```json
     {
       "pollId": "uuid",
       "voterId": "550e8400...",
       "rating": 8
     }
     ```
  3. Server:
     - Validates rating (0-10)
     - Adds to session.votes Map
     - Saves to Redis
     - Returns success
  4. UI updates:
     - Slider/input disabled
     - Set to voted value (8)
     - Success message: "You rated this 8/10. Waiting for next poll..."

**Step 6: Next Poll**

- Host moves to next poll
- Voter's polling detects new poll:
  ```json
  {
    "currentPoll": {
      /* new poll */
    },
    "hasVoted": false
  }
  ```
- UI updates:
  - New poll title
  - New media
  - Rating reset to 5
  - Controls enabled

**Step 7: Already Voted Check**

- If voter refreshes page mid-poll
- Polling returns:
  ```json
  {
    "currentPoll": {
      /* current poll */
    },
    "hasVoted": true,
    "voterRating": 8
  }
  ```
- UI shows locked state with their previous vote

**Step 8: Session Ends**

- Host finishes all polls
- Voter's polling returns empty
- Waiting screen shown again
- Message: "Session complete. Thank you for voting!"

---

### Session Lifecycle States

```
┌─────────────────┐
│  draft          │  Created but not presenting
│  (edit mode)    │  Host can add/edit polls
└────────┬────────┘
         │ Host clicks "Start Presenting"
         ▼
┌─────────────────┐
│  presenting     │  Active session
│                 │  Voters can join and vote
│                 │  currentPollIndex >= 0
└────────┬────────┘
         │ Host clicks "Finish Session"
         ▼
┌─────────────────┐
│  completed      │  All polls finished
│                 │  Results viewable
│                 │  currentPollIndex = -1
└────────┬────────┘
         │ 24 hours later
         ▼
┌─────────────────┐
│  deleted        │  Redis TTL expired
│  (automatic)    │  Data removed
└─────────────────┘
```

---

## Deployment

### Vercel Configuration

**File: vercel.json**

```json
{
  "functions": {
    "api/index.js": {
      "maxDuration": 60
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index.js"
    }
  ]
}
```

**Key Settings**:

- **maxDuration**: 60 seconds (maximum function execution time)
- **rewrites**: All routes handled by single serverless function

### Deployment Process

**1. Connect Repository**

- Link GitHub repo to Vercel
- Vercel auto-detects Node.js project

**2. Environment Variables**

- Add in Vercel dashboard:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

**3. Build Settings**

- Build Command: `npm install` (automatic)
- Output Directory: Not needed (serverless)
- Install Command: `npm install`

**4. Deploy**

- Push to main branch → Auto-deploy
- Or click "Deploy" in Vercel dashboard

**5. Custom Domain (optional)**

- Add custom domain in Vercel settings
- Vercel provides SSL automatically

### Static Asset Serving

Vercel automatically serves files from `public/`:

- `/css/style.css` → `public/css/style.css`
- `/js/host.js` → `public/js/host.js`
- `/images/background-pattern.png` → `public/images/background-pattern.png`
- `/audio/background-music.mp3` → `public/audio/background-music.mp3`

### How Serverless Functions Work

**Traditional Server**:

```
Request → Express App (always running) → Response
```

**Vercel Serverless**:

```
Request → Spin up function → Express App → Response → Shutdown
```

**Benefits**:

- ✅ Auto-scaling (handles any traffic)
- ✅ Pay per request (not per server)
- ✅ Zero maintenance
- ✅ Global edge network

**Limitations**:

- ❌ No persistent connections (WebSockets)
- ❌ No file system storage
- ❌ Cold start latency (~100-500ms first request)
- ❌ 60-second max execution time

### Environment Setup

**Local Development**:

```bash
# .env file
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here

# Run local server
npm run dev   # Uses server.js (Socket.IO)
```

**Production**:

```bash
# Environment variables set in Vercel dashboard
# Runs api/index.js (serverless)
```

---

## Security & Performance

### Security Considerations

#### Current Implementation

**1. Authentication**

- ❌ **Hardcoded Credentials**: Password stored in source code
- ❌ **Plaintext Storage**: No hashing
- ✅ **Token-based**: UUID tokens with 24h expiration
- ❌ **sessionStorage**: Vulnerable to XSS attacks

**2. Authorization**

- ✅ **Token Verification**: All host endpoints check token
- ❌ **No Rate Limiting**: API can be spammed
- ❌ **No CORS**: Accepts requests from any origin

**3. Input Validation**

- ✅ **Rating Range**: Validates 0-10
- ✅ **URL Validation**: Checks format
- ❌ **No Sanitization**: User input not sanitized
- ❌ **No SQL Injection Protection**: (Not applicable - using Redis)

**4. Data Protection**

- ✅ **HTTPS**: Vercel provides SSL
- ❌ **No Encryption**: Data stored in plain text in Redis
- ✅ **TTL**: Auto-delete after 24 hours

#### Recommended Improvements

**1. Move Credentials to Environment Variables**

```javascript
// Instead of:
if (username === 'GrowthBossHosting' && password === 'y&%)U#2+${QF/wG7')

// Use:
if (username === process.env.HOST_USERNAME &&
    password === process.env.HOST_PASSWORD)
```

**2. Use JWT Instead of Plain Tokens**

```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign({ role: 'host' }, process.env.JWT_SECRET, { expiresIn: '24h' });
```

**3. Add Rate Limiting**

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

**4. Configure CORS**

```javascript
const cors = require('cors');

app.use(
  cors({
    origin: 'https://your-domain.com',
    credentials: true
  })
);
```

**5. Sanitize User Input**

```javascript
const validator = require('validator');

const title = validator.escape(req.body.title);
```

**6. Add CSRF Protection**

```javascript
const csrf = require('csurf');

const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);
```

---

### Performance Characteristics

#### Redis Performance

**Read Operations** (voter checks poll):

- Latency: ~10-50ms (Upstash edge network)
- Frequency: Every 2 seconds per voter
- Load: 10 voters = 5 req/sec

**Write Operations** (vote submission):

- Latency: ~10-50ms
- Frequency: Once per poll per voter
- Load: Minimal (batch updates)

**TTL Management**:

- Automatic cleanup after 24 hours
- No manual deletion needed
- Prevents database bloat

#### HTTP Polling Impact

**Voter Polling**:

```
1 voter × 1 request/2s = 0.5 req/sec
10 voters = 5 req/sec
100 voters = 50 req/sec
```

**Host Polling**:

```
1 host × 1 request/2s = 0.5 req/sec
(Only polls while viewing results)
```

**Total Load** (typical session):

- 10 voters + 1 host = ~6 req/sec
- Well within Vercel/Upstash free tier limits

#### Optimization Strategies

**1. Exponential Backoff on Errors**

```javascript
let pollInterval = 2000;
let consecutiveErrors = 0;

async function poll() {
  try {
    await fetchData();
    consecutiveErrors = 0;
    pollInterval = 2000;
  } catch (error) {
    consecutiveErrors++;
    pollInterval = Math.min(pollInterval * 2, 30000);
  }
  setTimeout(poll, pollInterval);
}
```

**2. Stop Polling When Tab Hidden**

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(pollInterval);
  } else {
    pollInterval = setInterval(checkPoll, 2000);
    checkPoll(); // Immediate check
  }
});
```

**3. Batch Updates (Future Enhancement)**
Instead of individual vote updates, could batch:

```javascript
// Client buffers votes
const voteBatch = [];
voteBatch.push({ pollId, voterId, rating });

// Send every 5 seconds
setInterval(() => {
  if (voteBatch.length > 0) {
    fetch('/api/session/vote-batch', {
      method: 'POST',
      body: JSON.stringify({ votes: voteBatch })
    });
    voteBatch.length = 0;
  }
}, 5000);
```

**4. Server-Sent Events (Alternative to Polling)**

```javascript
// Server
app.get('/api/session/:sessionId/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const intervalId = setInterval(async () => {
    const data = await getSessionData();
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }, 2000);

  req.on('close', () => clearInterval(intervalId));
});

// Client
const eventSource = new EventSource(`/api/session/${sessionId}/stream`);
eventSource.onmessage = event => {
  const data = JSON.parse(event.data);
  updateUI(data);
};
```

#### Media Loading Performance

**YouTube Embeds**:

- Loaded from YouTube's CDN
- Adaptive streaming (quality adjusts to bandwidth)
- No server bandwidth used
- Caching handled by browser + YouTube

**Images**:

- Loaded from source CDN (Imgur, etc.)
- Browser caching applies
- No server bandwidth used
- Lazy loading possible:
  ```javascript
  <img src="..." loading="lazy">
  ```

#### Bundle Size

**CSS**: ~10 KB (uncompressed)
**JavaScript**:

- index.js: ~1 KB
- host-login.js: ~2 KB
- session-select.js: ~4 KB
- join-session.js: ~2 KB
- host.js: ~15 KB
- voter.js: ~6 KB
- music-player.js: ~7 KB

**Total**: ~47 KB JavaScript + 10 KB CSS = **57 KB**

**Optimization Opportunities**:

- Minification (could reduce by ~40%)
- Gzip compression (automatic on Vercel)
- Code splitting (load only needed JS per page)

---

## Technical Concepts Explained

### 1. Serverless Architecture

**What is Serverless?**

- Code runs in stateless compute containers
- Spins up on request, shuts down after
- Billed per execution, not per hour
- Auto-scales infinitely

**How it Works in This App**:

1. User requests `https://yourapp.vercel.app/host/ABC123`
2. Vercel receives request
3. Spins up Node.js container
4. Loads `api/index.js`
5. Executes Express route handler
6. Returns response
7. Container shuts down (or stays warm for ~5 min)

**Trade-offs**:

- ✅ Zero ops, auto-scaling, pay-per-use
- ❌ Cold starts, no persistent state, timeout limits

### 2. Redis as Database

**Why Redis?**

- In-memory (extremely fast reads/writes)
- Simple key-value store
- Built-in TTL (auto-expiration)
- Serverless-friendly (REST API)

**Data Structure Choices**:

- **Sessions**: JSON blobs (easy serialization)
- **Votes**: Nested Maps (logical grouping)
- **Tokens**: Simple strings (fast lookup)

**TTL Strategy**:

```javascript
await redis.set(key, value, { ex: 86400 }); // 24 hours
```

- Automatic cleanup
- No database bloat
- Suitable for temporary voting sessions

### 3. HTTP Polling vs WebSockets

**WebSockets** (server.js):

```
Client ←──────────→ Server
   (persistent connection)

Server pushes updates to client
Instant notification (< 100ms)
Requires long-lived connection
```

**HTTP Polling** (api/index.js):

```
Client → Request → Server
       ← Response ←

Client: "Any updates?"
Server: "Here's the data"
Repeat every 2 seconds

2-second delay
No persistent connection needed
```

**Why Polling for Production?**

- Vercel serverless can't maintain connections
- Simpler to implement and debug
- 2-second delay acceptable for voting app

### 4. localStorage vs sessionStorage

**localStorage**:

- Persists until manually cleared
- Survives browser close/reopen
- Used for: voterId (want to remember user)

**sessionStorage**:

- Cleared when tab closes
- Survives page refresh within tab
- Used for: hostToken (session-specific auth)

### 5. IIFE Pattern

**Immediately Invoked Function Expression**:

```javascript
(function () {
  // Code here runs immediately
  // Variables are scoped to this function
  const privateVar = 'hidden';
})();

// privateVar is not accessible here
```

**Why Used in music-player.js?**

- Avoids polluting global namespace
- Encapsulates player logic
- Prevents variable conflicts with other scripts

### 6. Async/Await

**Promise-based Asynchronous Code**:

```javascript
// Old way (callback hell)
fetch('/api/data', (error, data) => {
  if (error) {
    handleError(error);
  } else {
    processData(data, (error, result) => {
      // ...nested callbacks
    });
  }
});

// Modern way (async/await)
async function getData() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    return processData(data);
  } catch (error) {
    handleError(error);
  }
}
```

**Used Throughout App**:

- API requests (fetch)
- Redis operations
- Sequential operations (must wait for response)

### 7. REST API Design

**RESTful Principles**:

- Resources identified by URLs (`/api/session/:id`)
- HTTP methods convey action (GET, POST, DELETE)
- Stateless (each request independent)
- JSON for data exchange

**Example Route**:

```
POST /api/session/ABC123/vote
{
  "pollId": "uuid",
  "voterId": "uuid",
  "rating": 8
}

→ Creates a vote resource
→ Returns { success: true }
```

### 8. Flexbox Layout

**CSS Flexbox** (for centering):

```css
body {
  display: flex;
  align-items: center; /* Vertical center */
  justify-content: center; /* Horizontal center */
  min-height: 100vh; /* Full viewport height */
}
```

**How it Works**:

- `display: flex` makes body a flex container
- Children (container) become flex items
- `align-items: center` centers vertically
- `justify-content: center` centers horizontally

### 9. Event Delegation

**Pattern**:

```javascript
// Instead of adding listener to each button
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('click', handler);
});

// Add one listener to parent
document.getElementById('container').addEventListener('click', e => {
  if (e.target.classList.contains('btn')) {
    handler(e);
  }
});
```

**Benefits**:

- Fewer event listeners
- Works with dynamically added elements
- Better performance

### 10. CSS Transitions

**Smooth Animations**:

```css
.music-player {
  width: 60px;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.music-player:hover {
  width: 300px;
}
```

**How it Works**:

- Browser animates property changes
- `transition: all 0.4s` - animate all properties over 0.4 seconds
- `cubic-bezier()` - easing function (speed curve)

**Cubic Bezier**:

- (0.4, 0, 0.2, 1) = ease-out curve
- Starts fast, slows at end
- Creates natural motion

---

## Conclusion

This voting website is a well-architected real-time polling application that successfully demonstrates modern web development practices:

**Key Achievements**:

- ✅ Serverless deployment (zero ops, infinite scale)
- ✅ Persistent data with Redis (24-hour TTL)
- ✅ Real-time updates (HTTP polling)
- ✅ Multimedia support (YouTube, images)
- ✅ Responsive design (mobile-friendly)
- ✅ Persistent background music
- ✅ Session management (live + saved)

**Architecture Highlights**:

- Clean separation of concerns (client/server)
- RESTful API design
- Stateless serverless functions
- Efficient Redis data modeling
- Vanilla JavaScript (no framework bloat)

**Learning Outcomes**:

- Serverless vs traditional architecture
- WebSockets vs HTTP polling
- Redis data structures
- Session management strategies
- Modern CSS techniques
- Async JavaScript patterns

This documentation should give you a complete understanding of how every piece of the application works, from the high-level architecture down to individual functions and CSS properties. The application serves as an excellent example of building real-time collaborative tools with serverless technology.

---

**Document Version**: 1.0
**Last Updated**: 2024
**Application**: Content Production Team Polling Website
**Technologies**: Express.js, Upstash Redis, Vercel, Vanilla JavaScript, HTML5, CSS3
