const express = require('express');
const { Redis } = require('@upstash/redis');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Validate environment variables
const requiredEnvVars = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing environment variables:', missingEnvVars);
  // Don't crash, but log the error
}

// Initialize Upstash Redis
let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (error) {
  console.error('Failed to initialize Redis:', error);
}

// No external media storage needed - using direct URLs

// Health check endpoint for debugging
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasRedis: !!redis
    }
  });
});

// Helper function to serve HTML files
function serveHTML(filePath, res) {
  try {
    const html = fs.readFileSync(filePath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error(`Error serving ${filePath}:`, error);
    res.status(500).send('Error loading page');
  }
}

// Serve HTML pages
app.get('/', (req, res) => {
  serveHTML(path.join(__dirname, '..', 'views', 'index.html'), res);
});

app.get('/host-login', (req, res) => {
  serveHTML(path.join(__dirname, '..', 'views', 'host-login.html'), res);
});

app.get('/session-select', (req, res) => {
  serveHTML(path.join(__dirname, '..', 'views', 'session-select.html'), res);
});

app.get('/join-session', (req, res) => {
  serveHTML(path.join(__dirname, '..', 'views', 'join-session.html'), res);
});

app.get('/host/:sessionId', (req, res) => {
  serveHTML(path.join(__dirname, '..', 'views', 'host.html'), res);
});

app.get('/vote/:sessionId', (req, res) => {
  serveHTML(path.join(__dirname, '..', 'views', 'voter.html'), res);
});

// Helper functions for Redis storage
async function getSession(sessionId) {
  const session = await redis.get(`session:${sessionId}`);
  if (session && session.votes) {
    // Convert votes object back to Map of Maps
    const votesMap = new Map();
    for (const [pollId, pollVotesObj] of Object.entries(session.votes)) {
      votesMap.set(pollId, new Map(Object.entries(pollVotesObj)));
    }
    session.votes = votesMap;
  }
  if (session && session.voters) {
    session.voters = new Map(Object.entries(session.voters));
  }
  return session;
}

async function saveSession(sessionId, session) {
  const sessionToSave = { ...session };
  if (session.votes instanceof Map) {
    // Convert Map of Maps to object of objects
    const votesObj = {};
    for (const [pollId, pollVotesMap] of session.votes.entries()) {
      votesObj[pollId] = Object.fromEntries(pollVotesMap);
    }
    sessionToSave.votes = votesObj;
  }
  if (session.voters instanceof Map) {
    sessionToSave.voters = Object.fromEntries(session.voters);
  }
  await redis.set(`session:${sessionId}`, sessionToSave, { ex: 86400 }); // 24 hour expiry
}

// Host login endpoint
app.post('/api/host/login', async (req, res) => {
  const { username, password } = req.body;

  if (username === 'GrowthBossHosting' && password === 'y&%)U#2+${QF/wG7') {
    // Generate a simple auth token (in production, use JWT)
    const token = uuidv4();
    await redis.set(`host:token:${token}`, 'authorized', { ex: 86400 }); // 24 hour token
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// Middleware to check host authorization
async function checkHostAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.substring(7);
  const auth = await redis.get(`host:token:${token}`);

  if (auth !== 'authorized') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  next();
}

// Create new session (live or saved)
app.post('/api/host/create-session', checkHostAuth, async (req, res) => {
  try {
    const { isLive, sessionName } = req.body;
    const sessionId = uuidv4().substring(0, 8);

    const sessionData = {
      id: sessionId,
      name: sessionName || `Session ${sessionId}`,
      polls: [],
      currentPollIndex: -1,
      votes: new Map(),
      voters: new Map(),
      isLive: isLive || false,
      created: new Date().toISOString(),
      status: 'draft' // draft, presenting, completed
    };

    await saveSession(sessionId, sessionData);

    // If not live, also save to saved sessions list
    if (!isLive) {
      const savedSessions = await redis.get('host:saved-sessions') || [];
      savedSessions.push({
        id: sessionId,
        name: sessionData.name,
        created: sessionData.created
      });
      await redis.set('host:saved-sessions', savedSessions);
    }

    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get saved sessions
app.get('/api/host/saved-sessions', checkHostAuth, async (req, res) => {
  try {
    const savedSessionsList = await redis.get('host:saved-sessions') || [];

    // Fetch full session data for each
    const sessions = await Promise.all(
      savedSessionsList.map(async (item) => {
        const session = await getSession(item.id);
        return session ? {
          id: session.id,
          name: session.name,
          polls: session.polls,
          created: session.created,
          status: session.status
        } : null;
      })
    );

    // Filter out null values (sessions that no longer exist)
    const validSessions = sessions.filter(s => s !== null);

    res.json({ sessions: validSessions });
  } catch (error) {
    console.error('Error fetching saved sessions:', error);
    res.status(500).json({ error: 'Failed to fetch saved sessions' });
  }
});

// Delete saved session
app.delete('/api/host/session/:sessionId', checkHostAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Remove from saved sessions list
    const savedSessions = await redis.get('host:saved-sessions') || [];
    const filtered = savedSessions.filter(s => s.id !== sessionId);
    await redis.set('host:saved-sessions', filtered);

    // Delete the session data
    await redis.del(`session:${sessionId}`);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Session verification endpoint
app.post('/api/session/verify', async (req, res) => {
  const { sessionId, email } = req.body;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  const voterId = uuidv4();
  session.voters.set(voterId, email);
  await saveSession(sessionId, session);

  res.json({ success: true, voterId });
});

// Create poll with direct URL (no upload needed)
app.post('/api/session/:sessionId/poll', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, mediaItems, timer } = req.body;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!mediaItems || mediaItems.length === 0) {
      return res.status(400).json({ error: 'At least one media item is required' });
    }

    // Validate all media URLs
    for (const item of mediaItems) {
      try {
        new URL(item.url);
      } catch (e) {
        return res.status(400).json({ error: `Invalid URL format: ${item.url}` });
      }
    }

    const poll = {
      id: uuidv4(),
      title,
      mediaItems, // Array of { url, type: 'image'|'video' }
      timer: timer || 60, // Default 60 seconds
      startTime: null // Will be set when poll starts
    };

    session.polls.push(poll);
    await saveSession(sessionId, session);

    res.json({ poll });
  } catch (error) {
    console.error('Error creating poll:', error);
    const errorMessage = error.message || 'Failed to create poll';
    res.status(500).json({ error: errorMessage });
  }
});

// Update poll
app.put('/api/session/:sessionId/poll/:pollIndex', async (req, res) => {
  try {
    const { sessionId, pollIndex } = req.params;
    const { title, mediaItems, timer } = req.body;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const index = parseInt(pollIndex);
    if (index < 0 || index >= session.polls.length) {
      return res.status(400).json({ error: 'Invalid poll index' });
    }

    if (!mediaItems || mediaItems.length === 0) {
      return res.status(400).json({ error: 'At least one media item is required' });
    }

    // Validate all media URLs
    for (const item of mediaItems) {
      try {
        new URL(item.url);
      } catch (e) {
        return res.status(400).json({ error: `Invalid URL format: ${item.url}` });
      }
    }

    // Keep the existing poll ID
    const existingPollId = session.polls[index].id;

    const updatedPoll = {
      id: existingPollId,
      title,
      mediaItems,
      timer: timer || 60,
      startTime: null
    };

    session.polls[index] = updatedPoll;
    await saveSession(sessionId, session);

    res.json({ poll: updatedPoll });
  } catch (error) {
    console.error('Error updating poll:', error);
    const errorMessage = error.message || 'Failed to update poll';
    res.status(500).json({ error: errorMessage });
  }
});

// Delete poll
app.delete('/api/session/:sessionId/poll/:pollIndex', async (req, res) => {
  try {
    const { sessionId, pollIndex } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const index = parseInt(pollIndex);
    if (index < 0 || index >= session.polls.length) {
      return res.status(400).json({ error: 'Invalid poll index' });
    }

    // Remove the poll
    session.polls.splice(index, 1);

    // If current poll index is affected, reset it
    if (session.currentPollIndex >= session.polls.length) {
      session.currentPollIndex = -1;
    }

    await saveSession(sessionId, session);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting poll:', error);
    const errorMessage = error.message || 'Failed to delete poll';
    res.status(500).json({ error: errorMessage });
  }
});

// Get session info
app.get('/api/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId: session.id,
    polls: session.polls,
    currentPollIndex: session.currentPollIndex
  });
});

// Get current poll
app.get('/api/session/:sessionId/current-poll', async (req, res) => {
  const { sessionId } = req.params;
  const { voterId } = req.query;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.currentPollIndex === -1 || session.currentPollIndex >= session.polls.length) {
    return res.json({ currentPoll: null });
  }

  const currentPoll = session.polls[session.currentPollIndex];
  const pollVotes = session.votes.get(currentPoll.id);
  const hasVoted = pollVotes && voterId ? pollVotes.has(voterId) : false;
  const voterRating = hasVoted ? pollVotes.get(voterId) : null;

  res.json({
    currentPoll,
    pollIndex: session.currentPollIndex,
    hasVoted,
    voterRating
  });
});

// Start poll
app.post('/api/session/:sessionId/start/:pollIndex', async (req, res) => {
  const { sessionId, pollIndex } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const index = parseInt(pollIndex);
  if (index < 0 || index >= session.polls.length) {
    return res.status(400).json({ error: 'Invalid poll index' });
  }

  session.currentPollIndex = index;
  session.polls[index].startTime = Date.now(); // Set start time for timer
  session.votes.set(session.polls[index].id, new Map());
  await saveSession(sessionId, session);

  res.json({ success: true });
});

// Submit vote
app.post('/api/session/:sessionId/vote', async (req, res) => {
  const { sessionId } = req.params;
  const { pollId, voterId, rating } = req.body;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const pollVotes = session.votes.get(pollId);
  if (!pollVotes) {
    return res.status(400).json({ error: 'Poll not active' });
  }

  const ratingValue = parseInt(rating);
  if (ratingValue < 0 || ratingValue > 10) {
    return res.status(400).json({ error: 'Rating must be between 0 and 10' });
  }

  pollVotes.set(voterId, ratingValue);
  session.votes.set(pollId, pollVotes);
  await saveSession(sessionId, session);

  res.json({ success: true });
});

// Get live results (for polling)
app.get('/api/session/:sessionId/results/:pollId', async (req, res) => {
  const { sessionId, pollId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const pollVotes = session.votes.get(pollId);
  if (!pollVotes) {
    return res.json({
      totalVotes: 0,
      average: 0,
      votesWithEmails: []
    });
  }

  const ratings = Array.from(pollVotes.values());
  const average = ratings.length > 0
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)
    : 0;

  const votesWithEmails = Array.from(pollVotes.entries()).map(([vId, rating]) => ({
    email: session.voters.get(vId) || 'Unknown',
    rating
  }));

  res.json({
    totalVotes: ratings.length,
    average,
    ratings,
    votesWithEmails
  });
});

module.exports = app;
