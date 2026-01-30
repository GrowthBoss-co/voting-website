require('dotenv').config();

const express = require('express');
const { Redis } = require('@upstash/redis');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Validate environment variables
const requiredEnvVars = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];

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
    token: process.env.UPSTASH_REDIS_REST_TOKEN
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
  await redis.set(`session:${sessionId}`, sessionToSave, { ex: 2592000 }); // 30 day expiry
}

// Host login endpoint
app.post('/api/host/login', async (req, res) => {
  const { username, password } = req.body;

  if (username === process.env.HOST_USERNAME && password === process.env.HOST_PASSWORD) {
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
      status: 'draft', // draft, presenting, paused, completed
      pausedAtPollIndex: -1 // Track which poll was active when paused
    };

    await saveSession(sessionId, sessionData);

    // If not live, also save to saved sessions list
    if (!isLive) {
      const savedSessions = (await redis.get('host:saved-sessions')) || [];
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
    const savedSessionsList = (await redis.get('host:saved-sessions')) || [];

    // Fetch full session data for each
    const sessions = await Promise.all(
      savedSessionsList.map(async item => {
        const session = await getSession(item.id);
        return session
          ? {
              id: session.id,
              name: session.name,
              polls: session.polls,
              created: session.created,
              status: session.status
            }
          : null;
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
    const savedSessions = (await redis.get('host:saved-sessions')) || [];
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

// Duplicate session
app.post('/api/host/session/:sessionId/duplicate', checkHostAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get the original session
    const originalSession = await getSession(sessionId);
    if (!originalSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Generate new session ID
    const newSessionId = Math.random().toString(36).substring(2, 10);

    // Create duplicate session with new ID and reset state
    const duplicatedSession = {
      id: newSessionId,
      name: originalSession.name ? `${originalSession.name} (Copy)` : `Session ${newSessionId}`,
      polls: originalSession.polls.map(poll => ({
        ...poll,
        id: require('uuid').v4(), // Generate new poll IDs
        startTime: null,
        lastVoter: null,
        exposeThemV2: false
      })),
      currentPollIndex: -1,
      status: 'waiting',
      voters: new Map(),
      votes: new Map(),
      exposeVotes: {},
      readyVoters: [],
      expectedAttendance: originalSession.expectedAttendance || 10,
      autoAdvanceOn: false,
      timerPaused: false,
      countdownStarted: false,
      created: new Date().toISOString()
    };

    // Save the new session
    await saveSession(newSessionId, duplicatedSession);

    // Add to saved sessions list
    const savedSessions = (await redis.get('host:saved-sessions')) || [];
    savedSessions.push({
      id: newSessionId,
      name: duplicatedSession.name,
      created: duplicatedSession.created,
      polls: duplicatedSession.polls
    });
    await redis.set('host:saved-sessions', savedSessions);

    res.json({
      success: true,
      sessionId: newSessionId,
      session: {
        id: newSessionId,
        name: duplicatedSession.name,
        polls: duplicatedSession.polls,
        created: duplicatedSession.created
      }
    });
  } catch (error) {
    console.error('Error duplicating session:', error);
    res.status(500).json({ error: 'Failed to duplicate session' });
  }
});

// Session verification endpoint
app.post('/api/session/verify', async (req, res) => {
  const { sessionId, email } = req.body;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  // Check if voter with same email/name already exists, reuse their voterId
  let voterId = null;
  for (const [existingId, existingName] of session.voters.entries()) {
    if (existingName === email) {
      voterId = existingId;
      break;
    }
  }

  // Only create new voterId if voter doesn't exist
  if (!voterId) {
    voterId = uuidv4();
    session.voters.set(voterId, email);
    await saveSession(sessionId, session);
  }

  res.json({ success: true, voterId });
});

// Create poll with direct URL (no upload needed)
app.post('/api/session/:sessionId/poll', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { creator, company, mediaItems, timer, exposeThem } = req.body;
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
      creator,
      company,
      mediaItems, // Array of { url, type: 'image'|'video' }
      timer: timer || 60, // Default 60 seconds
      startTime: null, // Will be set when poll starts
      exposeThem: exposeThem || false, // Track if we should expose last voter
      lastVoter: null, // Will store { email, timestamp } of last voter if exposeThem is true
      exposeThemV2: false // Track if we should expose who didn't vote (set during live poll)
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

// N8N Automation endpoint - Add poll via automation with API key
app.post('/api/automation/add-poll', async (req, res) => {
  try {
    // Check API key for authentication
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.N8N_API_KEY || 'your-secret-api-key-here';

    console.log('Received API Key:', apiKey);
    console.log('Expected API Key:', validApiKey);
    console.log('All headers:', req.headers);

    if (!apiKey || apiKey !== validApiKey) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    }

    let { sessionId, creator, company, driveLinks, timer, exposeThem } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!creator || !company) {
      return res.status(400).json({ error: 'creator and company are required' });
    }

    if (!driveLinks) {
      return res.status(400).json({ error: 'driveLinks is required' });
    }

    // Handle both string (comma-separated) and array formats
    console.log('Received driveLinks (raw):', JSON.stringify(driveLinks));
    console.log('Type:', typeof driveLinks);
    console.log('String length:', typeof driveLinks === 'string' ? driveLinks.length : 'N/A');

    let linksArray;
    if (typeof driveLinks === 'string') {
      const splitParts = driveLinks.split(',');
      console.log('After split by comma:', splitParts.length, 'parts');
      console.log('Each part:', splitParts.map((p, i) => `${i}: "${p.substring(0, 50)}..."`));

      // Parse comma-separated string (with or without quotes)
      linksArray = splitParts
        .map(link => link.trim())
        .map(link => link.replace(/^["']|["']$/g, '')) // Remove quotes
        .filter(link => link.length > 0);

      console.log('After trim and filter:', linksArray.length, 'links');
    } else if (Array.isArray(driveLinks)) {
      linksArray = driveLinks;
    } else {
      return res.status(400).json({ error: 'driveLinks must be an array or comma-separated string' });
    }

    console.log('Final parsed linksArray:', linksArray);
    console.log('Number of final links:', linksArray.length);

    if (linksArray.length === 0) {
      return res.status(400).json({ error: 'At least one drive link is required' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Process links into mediaItems (supports Google Drive, YouTube, and image URLs)
    const mediaItems = linksArray.map(link => {
      // Check for YouTube embed URL
      if (link.includes('youtube.com/embed/')) {
        return {
          url: link,
          type: 'video'
        };
      }

      // Check for YouTube watch URL - convert to embed
      const ytWatchMatch = link.match(/youtube\.com\/watch\?v=([^&]+)/);
      if (ytWatchMatch) {
        return {
          url: `https://www.youtube.com/embed/${ytWatchMatch[1]}`,
          type: 'video'
        };
      }

      // Check for YouTube short URL - convert to embed
      const ytShortMatch = link.match(/youtu\.be\/([^?]+)/);
      if (ytShortMatch) {
        return {
          url: `https://www.youtube.com/embed/${ytShortMatch[1]}`,
          type: 'video'
        };
      }

      // Check for image URLs (imgur, etc.)
      if (link.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) || link.includes('i.imgur.com')) {
        return {
          url: link,
          type: 'image'
        };
      }

      // Handle Google Drive URLs
      let fileId = null;

      // Extract file ID from various Google Drive URL formats
      // Format 1: /file/d/FILE_ID/view or /file/d/FILE_ID?usp=...
      const match1 = link.match(/\/file\/d\/([^\/\?]+)/);
      if (match1) {
        fileId = match1[1];
      }

      // Format 2: ?id=FILE_ID or &id=FILE_ID
      const match2 = link.match(/[?&]id=([^&]+)/);
      if (match2) {
        fileId = match2[1];
      }

      if (fileId) {
        return {
          url: `https://drive.google.com/file/d/${fileId}/preview`,
          type: 'video'
        };
      }

      // If no pattern matched, assume it's a direct URL and try to detect type
      const isVideo = link.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i);
      return {
        url: link,
        type: isVideo ? 'video' : 'image'
      };
    });

    // Capitalize company name
    const formattedCompany = company
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const poll = {
      id: uuidv4(),
      creator,
      company: formattedCompany,
      mediaItems,
      timer: timer || 60,
      startTime: null,
      exposeThem: exposeThem || false,
      lastVoter: null
    };

    session.polls.push(poll);
    await saveSession(sessionId, session);

    res.json({
      success: true,
      poll,
      message: `Poll added successfully to session ${sessionId}`
    });
  } catch (error) {
    console.error('Error in automation endpoint:', error);
    res.status(500).json({ error: error.message || 'Failed to add poll' });
  }
});

// Automation endpoint - Get session data
app.get('/api/automation/session/:sessionId', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.N8N_API_KEY || 'your-secret-api-key-here';

    if (apiKey !== validApiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Convert Maps to objects for JSON serialization
    const sessionData = {
      ...session,
      votes: session.votes ? Object.fromEntries(
        Array.from(session.votes.entries()).map(([pollId, votes]) => [
          pollId,
          Object.fromEntries(votes.entries())
        ])
      ) : {},
      voters: session.voters ? Object.fromEntries(session.voters.entries()) : {}
    };

    res.json({ success: true, session: sessionData });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: error.message || 'Failed to get session' });
  }
});

// Automation endpoint - Convert YouTube URLs to Shorts format
app.post('/api/automation/convert-to-shorts/:sessionId', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.N8N_API_KEY || 'your-secret-api-key-here';

    if (apiKey !== validApiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let convertedCount = 0;

    // Convert YouTube embed URLs to Shorts format
    for (const poll of session.polls) {
      if (poll.mediaItems) {
        for (const item of poll.mediaItems) {
          if (item.type === 'video' && item.url && item.url.includes('youtube.com/embed/')) {
            // Extract video ID from embed URL
            const videoIdMatch = item.url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
            if (videoIdMatch) {
              // Convert to shorts URL format
              item.url = `https://www.youtube.com/shorts/${videoIdMatch[1]}`;
              convertedCount++;
            }
          }
        }
      }
    }

    await saveSession(sessionId, session);

    res.json({
      success: true,
      message: `Converted ${convertedCount} YouTube URLs to Shorts format`,
      convertedCount
    });
  } catch (error) {
    console.error('Error converting to shorts:', error);
    res.status(500).json({ error: error.message || 'Failed to convert URLs' });
  }
});

// Update poll
app.put('/api/session/:sessionId/poll/:pollIndex', async (req, res) => {
  try {
    const { sessionId, pollIndex } = req.params;
    const { creator, company, mediaItems, timer, exposeThem, exposeThemV2 } = req.body;
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

    // Keep the existing poll ID and preserve lastVoter if exists
    const existingPollId = session.polls[index].id;
    const existingLastVoter = session.polls[index].lastVoter;

    const updatedPoll = {
      id: existingPollId,
      creator,
      company,
      mediaItems,
      timer: timer || 60,
      startTime: null,
      exposeThem: exposeThem || false,
      lastVoter: existingLastVoter || null,
      exposeThemV2: exposeThemV2 || false
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

// Reorder polls
app.put('/api/session/:sessionId/reorder-polls', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { polls: reorderedPolls } = req.body;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!reorderedPolls || !Array.isArray(reorderedPolls)) {
      return res.status(400).json({ error: 'Invalid polls array' });
    }

    // Validate that all poll IDs match
    const existingIds = session.polls.map(p => p.id).sort();
    const newIds = reorderedPolls.map(p => p.id).sort();

    if (JSON.stringify(existingIds) !== JSON.stringify(newIds)) {
      return res.status(400).json({ error: 'Poll IDs do not match' });
    }

    // Update the polls order
    session.polls = reorderedPolls;
    await saveSession(sessionId, session);

    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering polls:', error);
    const errorMessage = error.message || 'Failed to reorder polls';
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
    currentPollIndex: session.currentPollIndex,
    status: session.status,
    pausedAtPollIndex: session.pausedAtPollIndex,
    totalVoters: session.voters.size,
    expectedAttendance: session.expectedAttendance || 0
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

  // Check if session is completed - return null poll so voters see end screen
  if (session.status === 'completed') {
    return res.json({
      currentPoll: null,
      sessionStarted: true,
      totalPolls: session.polls.length,
      status: 'completed'
    });
  }

  // Check if session is paused
  if (session.status === 'paused') {
    return res.json({
      currentPoll: null,
      sessionStarted: true,
      totalPolls: session.polls.length,
      status: 'paused',
      pausedAtPollIndex: session.pausedAtPollIndex
    });
  }

  if (session.currentPollIndex === -1 || session.currentPollIndex >= session.polls.length) {
    return res.json({
      currentPoll: null,
      sessionStarted: session.currentPollIndex !== -1,
      totalPolls: session.polls.length,
      status: session.status || 'draft'
    });
  }

  const currentPoll = session.polls[session.currentPollIndex];
  const pollVotes = session.votes.get(currentPoll.id);
  const hasVoted = pollVotes && voterId ? pollVotes.has(voterId) : false;
  const voterRating = hasVoted ? pollVotes.get(voterId) : null;

  res.json({
    currentPoll,
    pollIndex: session.currentPollIndex,
    hasVoted,
    voterRating,
    sessionStarted: true,
    totalPolls: session.polls.length,
    status: session.status || 'presenting'
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

  // Only initialize votes if this poll hasn't been voted on yet (preserve existing votes when resuming)
  if (!session.votes.has(session.polls[index].id)) {
    session.votes.set(session.polls[index].id, new Map());
  }

  session.status = 'presenting'; // Mark as presenting
  await saveSession(sessionId, session);

  res.json({ success: true });
});

// Pause session
app.post('/api/session/:sessionId/pause', async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = 'paused';
  session.pausedAtPollIndex = session.currentPollIndex;
  await saveSession(sessionId, session);

  res.json({ success: true });
});

// Resume session (with option to restart or continue)
app.post('/api/session/:sessionId/resume', async (req, res) => {
  const { sessionId } = req.params;
  const { restart } = req.body;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (restart) {
    // Restart from beginning - clear ALL votes
    session.currentPollIndex = -1;
    session.status = 'draft';
    session.pausedAtPollIndex = -1;
    session.votes = new Map(); // Clear all votes
  } else {
    // Continue from where left off - clear votes from paused poll onwards
    const pausedIndex = session.pausedAtPollIndex;
    if (pausedIndex >= 0) {
      for (let i = pausedIndex; i < session.polls.length; i++) {
        const pollId = session.polls[i].id;
        session.votes.delete(pollId);
      }
    }
    session.status = 'presenting';
  }

  await saveSession(sessionId, session);

  res.json({ success: true, pausedAtPollIndex: session.pausedAtPollIndex });
});

// Clear all votes for a session
app.post('/api/session/:sessionId/clear-votes', async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Clear all votes
  session.votes = new Map();

  // Clear expose votes too
  session.exposeVotes = {};

  // Reset countdown state
  session.countdownStarted = false;

  await saveSession(sessionId, session);

  res.json({ success: true });
});

// Mark session as completed
app.post('/api/session/:sessionId/complete', async (req, res) => {
  const { sessionId } = req.params;
  const session = await getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.status = 'completed';
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

  // Find the poll to check timer
  const poll = session.polls.find(p => p.id === pollId);
  if (poll && poll.timer && poll.startTime) {
    // Skip timer check if auto-advance is ON and countdown hasn't started
    // In auto-advance mode, voting is open until the 10-second countdown finishes
    const isAutoAdvanceOn = session.autoAdvanceOn || false;
    const countdownStarted = session.countdownStarted || false;

    if (!isAutoAdvanceOn || countdownStarted) {
      // Normal mode or countdown has started - check timer
      const elapsed = Math.floor((Date.now() - poll.startTime) / 1000);
      const timeLeft = Math.max(0, poll.timer - elapsed);

      if (timeLeft <= 0) {
        return res.status(403).json({ error: 'Voting period has ended for this poll' });
      }
    }
    // If auto-advance is ON and countdown hasn't started, allow voting
  }

  const ratingValue = parseInt(rating);
  if (ratingValue < 0 || ratingValue > 10) {
    return res.status(400).json({ error: 'Rating must be between 0 and 10' });
  }

  pollVotes.set(voterId, ratingValue);
  session.votes.set(pollId, pollVotes);

  // Always track the last voter for the reveal feature
  if (poll) {
    const voterEmail = session.voters.get(voterId);
    poll.lastVoter = {
      email: voterEmail || 'Unknown',
      timestamp: Date.now()
    };
  }

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
  const average =
    ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : 0;

  const votesWithEmails = Array.from(pollVotes.entries()).map(([vId, rating]) => ({
    email: session.voters.get(vId) || 'Unknown',
    rating
  }));

  // Find the poll to get lastVoter and exposeThemV2 info
  const poll = session.polls.find(p => p.id === pollId);

  // Calculate who didn't vote if exposeThemV2 is true
  let nonVoters = [];
  if (poll?.exposeThemV2) {
    // Get names of voters who HAVE voted (by voterId)
    const voterIds = Array.from(pollVotes.keys());
    const votedNames = new Set();
    for (const vId of voterIds) {
      const name = session.voters.get(vId);
      if (name) votedNames.add(name);
    }

    // Get unique voter names from session.voters (deduplicate)
    const allUniqueNames = [...new Set(Array.from(session.voters.values()))];

    // Filter to only names that haven't voted
    nonVoters = allUniqueNames.filter(name => !votedNames.has(name));
  }

  res.json({
    totalVotes: ratings.length,
    average,
    ratings,
    votesWithEmails,
    lastVoter: poll?.lastVoter || null,
    nonVoters: nonVoters
  });
});

// Get creator and company lists
app.get('/api/host/lists', checkHostAuth, async (req, res) => {
  try {
    const defaultCreators = [
      'Crizan Leone',
      'Isaac Brito',
      'Vinicius Freitas'
    ];
    const storedCreators = await redis.get('host:creators');
    const creators = (storedCreators && storedCreators.length > 0) ? storedCreators : defaultCreators;
    const companies = (await redis.get('host:companies')) || [];

    res.json({ creators, companies });
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

// Add creator
app.post('/api/host/creators', checkHostAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Creator name is required' });
    }

    const defaultCreators = [
      'Crizan Leone',
      'Isaac Brito',
      'Vinicius Freitas'
    ];
    const storedCreators = await redis.get('host:creators');
    const creators = (storedCreators && storedCreators.length > 0) ? storedCreators : defaultCreators;

    const trimmedName = name.trim();

    // Check if already exists (case-insensitive)
    if (creators.some(c => c.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'Creator already exists' });
    }

    creators.push(trimmedName);
    await redis.set('host:creators', creators);

    res.json({ success: true, creators });
  } catch (error) {
    console.error('Error adding creator:', error);
    res.status(500).json({ error: 'Failed to add creator' });
  }
});

// Delete creator
app.delete('/api/host/creators/:name', checkHostAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const defaultCreators = [
      'Crizan Leone',
      'Isaac Brito',
      'Vinicius Freitas'
    ];
    const storedCreators = await redis.get('host:creators');
    const creators = (storedCreators && storedCreators.length > 0) ? storedCreators : defaultCreators;

    const filtered = creators.filter(c => c !== decodeURIComponent(name));

    if (filtered.length === creators.length) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    await redis.set('host:creators', filtered);
    res.json({ success: true, creators: filtered });
  } catch (error) {
    console.error('Error deleting creator:', error);
    res.status(500).json({ error: 'Failed to delete creator' });
  }
});

// Add company
app.post('/api/host/companies', checkHostAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const companies = (await redis.get('host:companies')) || [];

    // Capitalize company name (first letter of each word)
    const formattedName = name
      .trim()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Check if already exists (case-insensitive)
    if (companies.some(c => c.toLowerCase() === formattedName.toLowerCase())) {
      return res.status(400).json({ error: 'Company already exists' });
    }

    companies.push(formattedName);
    await redis.set('host:companies', companies);

    res.json({ success: true, companies });
  } catch (error) {
    console.error('Error adding company:', error);
    res.status(500).json({ error: 'Failed to add company' });
  }
});

// Delete company
app.delete('/api/host/companies/:name', checkHostAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const companies = (await redis.get('host:companies')) || [];

    const filtered = companies.filter(c => c !== decodeURIComponent(name));

    if (filtered.length === companies.length) {
      return res.status(404).json({ error: 'Company not found' });
    }

    await redis.set('host:companies', filtered);
    res.json({ success: true, companies: filtered });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// Get voter names list
app.get('/api/host/voters', checkHostAuth, async (req, res) => {
  try {
    const defaultVoters = [
      'Karol Trojanowski',
      'Leonardo Urnauer',
      'Amanda Foster',
      'Cesar Batista',
      'Yasmin Vieira',
      'Isaac Brito',
      'Adrielle Silva',
      'Crizan Leone',
      'Henry Dutra',
      'Thamires Martins',
      'Vinicius Freitas'
    ];
    const storedVoters = await redis.get('host:voter-names');
    const voters = (storedVoters && storedVoters.length > 0) ? storedVoters : defaultVoters;
    res.json({ voters });
  } catch (error) {
    console.error('Error fetching voter names:', error);
    res.status(500).json({ error: 'Failed to fetch voter names' });
  }
});

// Get voter names list (public - for join session page)
app.get('/api/voter-names', async (req, res) => {
  try {
    const defaultVoters = [
      'Karol Trojanowski',
      'Leonardo Urnauer',
      'Amanda Foster',
      'Cesar Batista',
      'Yasmin Vieira',
      'Isaac Brito',
      'Adrielle Silva',
      'Crizan Leone',
      'Henry Dutra',
      'Thamires Martins',
      'Vinicius Freitas'
    ];
    const storedVoters = await redis.get('host:voter-names');
    const voters = (storedVoters && storedVoters.length > 0) ? storedVoters : defaultVoters;
    res.json({ voters });
  } catch (error) {
    console.error('Error fetching voter names:', error);
    res.status(500).json({ error: 'Failed to fetch voter names' });
  }
});

// Add voter name
app.post('/api/host/voters', checkHostAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Voter name is required' });
    }

    const defaultVoters = [
      'Karol Trojanowski',
      'Leonardo Urnauer',
      'Amanda Foster',
      'Cesar Batista',
      'Yasmin Vieira',
      'Isaac Brito',
      'Adrielle Silva',
      'Crizan Leone',
      'Henry Dutra',
      'Thamires Martins',
      'Vinicius Freitas'
    ];
    const storedVoters = await redis.get('host:voter-names');
    const voters = (storedVoters && storedVoters.length > 0) ? storedVoters : defaultVoters;

    const trimmedName = name.trim();

    // Check if already exists (case-insensitive)
    if (voters.some(v => v.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'Voter name already exists' });
    }

    voters.push(trimmedName);
    await redis.set('host:voter-names', voters);

    res.json({ success: true, voters });
  } catch (error) {
    console.error('Error adding voter name:', error);
    res.status(500).json({ error: 'Failed to add voter name' });
  }
});

// Delete voter name
app.delete('/api/host/voters/:name', checkHostAuth, async (req, res) => {
  try {
    const { name } = req.params;
    const defaultVoters = [
      'Karol Trojanowski',
      'Leonardo Urnauer',
      'Amanda Foster',
      'Cesar Batista',
      'Yasmin Vieira',
      'Isaac Brito',
      'Adrielle Silva',
      'Crizan Leone',
      'Henry Dutra',
      'Thamires Martins',
      'Vinicius Freitas'
    ];
    const storedVoters = await redis.get('host:voter-names');
    const voters = (storedVoters && storedVoters.length > 0) ? storedVoters : defaultVoters;

    const filtered = voters.filter(v => v !== decodeURIComponent(name));

    if (filtered.length === voters.length) {
      return res.status(404).json({ error: 'Voter name not found' });
    }

    await redis.set('host:voter-names', filtered);
    res.json({ success: true, voters: filtered });
  } catch (error) {
    console.error('Error deleting voter name:', error);
    res.status(500).json({ error: 'Failed to delete voter name' });
  }
});

// Get opening page settings (public - for index page)
app.get('/api/opening-page-settings', async (req, res) => {
  try {
    const settings = await redis.get('host:opening-page-settings');
    res.json({
      title: settings?.title || 'Content Production Team Roundtable',
      subtitle: settings?.subtitle || "🎊 It's Friday! 🎊"
    });
  } catch (error) {
    console.error('Error fetching opening page settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update opening page settings (host only)
app.put('/api/host/opening-page-settings', checkHostAuth, async (req, res) => {
  try {
    const { title, subtitle } = req.body;

    const settings = {
      title: title || 'Content Production Team Roundtable',
      subtitle: subtitle || "🎊 It's Friday! 🎊"
    };

    await redis.set('host:opening-page-settings', settings);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error updating opening page settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Set session as "This Week's Session"
app.post('/api/host/set-active-session', checkHostAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // Verify session exists
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Store the active session ID
    await redis.set('host:active-session', sessionId);

    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Error setting active session:', error);
    res.status(500).json({ error: 'Failed to set active session' });
  }
});

// Get "This Week's Session" (active session)
app.get('/api/active-session', async (req, res) => {
  try {
    const activeSessionId = await redis.get('host:active-session');

    if (!activeSessionId) {
      return res.json({ active: false, session: null });
    }

    const session = await getSession(activeSessionId);
    if (!session) {
      return res.json({ active: false, session: null });
    }

    res.json({
      active: true,
      sessionId: activeSessionId,
      session: {
        id: session.id,
        name: session.name,
        expectedAttendance: session.expectedAttendance || 0,
        readyVoters: session.readyVoters || [],
        status: session.status
      }
    });
  } catch (error) {
    console.error('Error getting active session:', error);
    res.status(500).json({ error: 'Failed to get active session' });
  }
});

// Clear active session
app.post('/api/host/clear-active-session', checkHostAuth, async (req, res) => {
  try {
    await redis.del('host:active-session');
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing active session:', error);
    res.status(500).json({ error: 'Failed to clear active session' });
  }
});

// Voter marks themselves as ready
app.post('/api/session/:sessionId/ready', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { voterName } = req.body;

    if (!voterName) {
      return res.status(400).json({ error: 'voterName is required' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Initialize readyVoters if not exists
    if (!session.readyVoters) {
      session.readyVoters = [];
    }

    // Check if name is already taken by someone in the ready list
    if (session.readyVoters.includes(voterName)) {
      return res.status(409).json({
        error: 'Name already taken',
        message: `Someone named "${voterName}" has already joined. Please choose a different name.`
      });
    }

    // Add voter to ready list
    session.readyVoters.push(voterName);

    // Create new voterId for this voter
    const voterId = uuidv4();
    session.voters.set(voterId, voterName);

    await saveSession(sessionId, session);

    // Check if threshold reached (80%)
    const expectedAttendance = session.expectedAttendance || 10;
    const readyCount = session.readyVoters.length;
    const thresholdReached = readyCount >= Math.ceil(expectedAttendance * 0.8);

    res.json({
      success: true,
      voterId,
      readyCount,
      expectedAttendance,
      thresholdReached,
      sessionStatus: session.status
    });
  } catch (error) {
    console.error('Error marking voter ready:', error);
    res.status(500).json({ error: 'Failed to mark voter ready' });
  }
});

// Get ready status for a session
app.get('/api/session/:sessionId/ready-status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const expectedAttendance = session.expectedAttendance || 10;
    const readyVoters = session.readyVoters || [];
    const readyCount = readyVoters.length;
    const thresholdReached = readyCount >= Math.ceil(expectedAttendance * 0.8);

    res.json({
      readyCount,
      expectedAttendance,
      thresholdReached,
      readyVoters,
      sessionStatus: session.status,
      countdownStarted: session.countdownStarted || false
    });
  } catch (error) {
    console.error('Error getting ready status:', error);
    res.status(500).json({ error: 'Failed to get ready status' });
  }
});

// Start countdown (called by host or auto when threshold reached)
app.post('/api/session/:sessionId/start-countdown', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.countdownStarted = true;
    session.countdownStartTime = Date.now();
    await saveSession(sessionId, session);

    res.json({ success: true });
  } catch (error) {
    console.error('Error starting countdown:', error);
    res.status(500).json({ error: 'Failed to start countdown' });
  }
});

// Update auto-advance state (called by host)
app.post('/api/session/:sessionId/auto-advance-state', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { autoAdvanceOn, countdownStarted } = req.body;

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.autoAdvanceOn = autoAdvanceOn || false;
    session.countdownStarted = countdownStarted || false;
    await saveSession(sessionId, session);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating auto-advance state:', error);
    res.status(500).json({ error: 'Failed to update auto-advance state' });
  }
});

// Get auto-advance state
app.get('/api/session/:sessionId/auto-advance-state', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      autoAdvanceOn: session.autoAdvanceOn || false,
      countdownStarted: session.countdownStarted || false,
      timerPaused: session.timerPaused || false,
      pausedTimeLeft: session.pausedTimeLeft || null
    });
  } catch (error) {
    console.error('Error getting auto-advance state:', error);
    res.status(500).json({ error: 'Failed to get auto-advance state' });
  }
});

// Pause timer (host or authorized voters)
app.post('/api/session/:sessionId/pause-timer', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { voterName, timeLeft } = req.body;

    // Check if voter is authorized (case-insensitive, host doesn't need voterName)
    const authorizedVoters = ['Karol Trojanowski', 'Adrielle Silva'];
    const isAuthorized = !voterName || authorizedVoters.some(
      name => name.toLowerCase().trim() === (voterName || '').toLowerCase().trim()
    );
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to pause timer' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.timerPaused = true;
    session.pausedTimeLeft = timeLeft;
    await saveSession(sessionId, session);

    res.json({ success: true, timerPaused: true });
  } catch (error) {
    console.error('Error pausing timer:', error);
    res.status(500).json({ error: 'Failed to pause timer' });
  }
});

// Resume timer (host or authorized voters)
app.post('/api/session/:sessionId/resume-timer', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { voterName } = req.body;

    // Check if voter is authorized (case-insensitive)
    const authorizedVoters = ['Karol Trojanowski', 'Adrielle Silva'];
    const isAuthorized = !voterName || authorizedVoters.some(
      name => name.toLowerCase().trim() === (voterName || '').toLowerCase().trim()
    );
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to resume timer' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.timerPaused = false;
    await saveSession(sessionId, session);

    res.json({ success: true, timerPaused: false, timeLeft: session.pausedTimeLeft });
  } catch (error) {
    console.error('Error resuming timer:', error);
    res.status(500).json({ error: 'Failed to resume timer' });
  }
});

// Skip to next poll (host or authorized voters)
app.post('/api/session/:sessionId/skip-poll', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { voterName } = req.body;

    // Check if voter is authorized (case-insensitive)
    const authorizedVoters = ['Karol Trojanowski', 'Adrielle Silva'];
    const isAuthorized = !voterName || authorizedVoters.some(
      name => name.toLowerCase().trim() === (voterName || '').toLowerCase().trim()
    );
    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to skip poll' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Actually advance to the next poll
    const nextIndex = session.currentPollIndex + 1;

    if (nextIndex >= session.polls.length) {
      // No more polls - mark session as completed
      session.status = 'completed';
      session.currentPollIndex = -1;
    } else {
      // Start the next poll
      session.currentPollIndex = nextIndex;
      session.polls[nextIndex].startTime = Date.now();

      // Initialize votes for the new poll if not exists
      if (!session.votes.has(session.polls[nextIndex].id)) {
        session.votes.set(session.polls[nextIndex].id, new Map());
      }

      session.status = 'presenting';
    }

    // Reset timer pause and countdown state
    session.timerPaused = false;
    session.countdownStarted = false;
    session.skipRequested = false;

    // Clear expose votes for the current poll
    if (session.exposeVotes && session.currentPollIndex >= 0) {
      const currentPollId = session.polls[session.currentPollIndex]?.id;
      if (currentPollId && session.exposeVotes[currentPollId]) {
        delete session.exposeVotes[currentPollId];
      }
    }

    await saveSession(sessionId, session);

    res.json({
      success: true,
      newPollIndex: session.currentPollIndex,
      sessionCompleted: session.status === 'completed'
    });
  } catch (error) {
    console.error('Error skipping poll:', error);
    res.status(500).json({ error: 'Failed to skip poll' });
  }
});

// Clear skip request
app.post('/api/session/:sessionId/clear-skip', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.skipRequested = false;
    await saveSession(sessionId, session);

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing skip:', error);
    res.status(500).json({ error: 'Failed to clear skip' });
  }
});

// Clear ready voters (for resetting)
app.post('/api/session/:sessionId/clear-ready', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.readyVoters = [];
    session.countdownStarted = false;
    session.countdownStartTime = null;
    await saveSession(sessionId, session);

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing ready voters:', error);
    res.status(500).json({ error: 'Failed to clear ready voters' });
  }
});

// Vote to expose (voter wants to reveal who hasn't voted)
app.post('/api/session/:sessionId/vote-expose', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { pollId, voterId } = req.body;

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Initialize exposeVotes for this poll if not exists
    if (!session.exposeVotes) {
      session.exposeVotes = {};
    }
    if (!session.exposeVotes[pollId]) {
      session.exposeVotes[pollId] = [];
    }

    // Add voter if not already voted to expose
    if (!session.exposeVotes[pollId].includes(voterId)) {
      session.exposeVotes[pollId].push(voterId);
    }

    await saveSession(sessionId, session);

    // Calculate if threshold reached (50% of expected attendance)
    const expectedAttendance = session.expectedAttendance || 10;
    const exposeVoteCount = session.exposeVotes[pollId].length;
    const thresholdNeeded = Math.ceil(expectedAttendance * 0.5);
    const thresholdReached = exposeVoteCount >= thresholdNeeded;

    res.json({
      success: true,
      exposeVoteCount,
      thresholdNeeded,
      thresholdReached
    });
  } catch (error) {
    console.error('Error voting to expose:', error);
    res.status(500).json({ error: 'Failed to vote to expose' });
  }
});

// Get expose status for a poll
app.get('/api/session/:sessionId/expose-status/:pollId', async (req, res) => {
  try {
    const { sessionId, pollId } = req.params;
    const { voterId } = req.query;

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const expectedAttendance = session.expectedAttendance || 10;
    const exposeVotes = session.exposeVotes?.[pollId] || [];
    const exposeVoteCount = exposeVotes.length;
    const thresholdNeeded = Math.ceil(expectedAttendance * 0.5);
    const thresholdReached = exposeVoteCount >= thresholdNeeded;
    const hasVotedToExpose = voterId ? exposeVotes.includes(voterId) : false;

    // Get poll votes to determine what to expose
    const pollVotes = session.votes.get(pollId);
    const totalVotes = pollVotes ? pollVotes.size : 0;

    // Use server-stored state for auto-advance (more reliable than client params)
    const isAutoAdvance = session.autoAdvanceOn || false;
    const isCountdownStarted = session.countdownStarted || false;

    // Determine if we should reveal based on auto-advance state
    // If auto-advance is ON: only reveal when 10-second countdown has started
    // If auto-advance is OFF: reveal immediately when threshold reached
    const shouldReveal = thresholdReached && (!isAutoAdvance || isCountdownStarted);

    let exposedData = null;
    if (shouldReveal) {
      if (totalVotes >= expectedAttendance) {
        // Everyone voted - find last voter
        const poll = session.polls.find(p => p.id === pollId);
        if (poll && poll.lastVoter) {
          exposedData = {
            type: 'lastVoter',
            name: poll.lastVoter.email
          };
        }
      } else {
        // Not everyone voted - find who didn't vote
        // Get names of voters who HAVE voted (by voterId)
        const voterIds = pollVotes ? Array.from(pollVotes.keys()) : [];
        const votedNames = new Set();
        for (const vId of voterIds) {
          const name = session.voters.get(vId);
          if (name) votedNames.add(name);
        }

        // Get unique voter names from session.voters (deduplicate)
        const allUniqueNames = [...new Set(Array.from(session.voters.values()))];

        // Filter to only names that haven't voted
        const nonVoters = allUniqueNames.filter(name => !votedNames.has(name));

        exposedData = {
          type: 'nonVoters',
          names: nonVoters
        };
      }
    }

    res.json({
      exposeVoteCount,
      thresholdNeeded,
      thresholdReached,
      hasVotedToExpose,
      exposedData,
      shouldReveal,
      totalVotes,
      expectedAttendance
    });
  } catch (error) {
    console.error('Error getting expose status:', error);
    res.status(500).json({ error: 'Failed to get expose status' });
  }
});

// Update session attendance
app.put('/api/session/:sessionId/attendance', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { attendance } = req.body;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.expectedAttendance = parseInt(attendance) || 0;
    await saveSession(sessionId, session);

    res.json({ success: true, attendance: session.expectedAttendance });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// Chat messages - Get messages for a session
app.get('/api/session/:sessionId/chat', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { since } = req.query; // Optional: only get messages after this timestamp

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Initialize chat if not exists
    if (!session.chatMessages) {
      session.chatMessages = [];
    }

    let messages = session.chatMessages;

    // Filter messages if 'since' timestamp provided
    if (since) {
      const sinceTime = parseInt(since);
      messages = messages.filter(msg => msg.timestamp > sinceTime);
    }

    res.json({
      success: true,
      messages,
      totalCount: session.chatMessages.length
    });
  } catch (error) {
    console.error('Error getting chat messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Chat messages - Send a message
app.post('/api/session/:sessionId/chat', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { voterName, message } = req.body;

    if (!voterName || !message) {
      return res.status(400).json({ error: 'voterName and message are required' });
    }

    // Limit message length
    const trimmedMessage = message.trim().substring(0, 500);
    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Initialize chat if not exists
    if (!session.chatMessages) {
      session.chatMessages = [];
    }

    // Create message object
    const chatMessage = {
      id: uuidv4(),
      voterName,
      message: trimmedMessage,
      timestamp: Date.now()
    };

    // Add message to session
    session.chatMessages.push(chatMessage);

    // Keep only last 100 messages to prevent storage bloat
    if (session.chatMessages.length > 100) {
      session.chatMessages = session.chatMessages.slice(-100);
    }

    await saveSession(sessionId, session);

    res.json({
      success: true,
      message: chatMessage
    });
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Submit anonymous feedback and create ClickUp task
app.post('/api/session/:sessionId/feedback', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { feedbackData } = req.body;

    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Validate feedback data structure
    if (!feedbackData || typeof feedbackData !== 'object') {
      return res.status(400).json({ error: 'Invalid feedback data' });
    }

    // Build task description from feedback
    const taskDescription = buildFeedbackDescription(feedbackData, session.name);

    // Create ClickUp task
    const clickupResult = await createClickUpFeedbackTask(
      session.name,
      taskDescription,
      feedbackData
    );

    // Track feedback count in session (for analytics)
    session.feedbackCount = (session.feedbackCount || 0) + 1;
    await saveSession(sessionId, session);

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      taskId: clickupResult.id
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Helper function to build feedback description
function buildFeedbackDescription(feedbackData, sessionName) {
  const lines = [
    `**Session:** ${sessionName || 'Content Team Roundtable'}`,
    `**Date:** ${new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}`,
    '',
    '---',
    ''
  ];

  if (feedbackData.rating) {
    const stars = '⭐'.repeat(feedbackData.rating);
    lines.push(`**Rating:** ${stars} (${feedbackData.rating}/5)`);
    lines.push('');
  }

  if (feedbackData.mostValuable) {
    lines.push(`**What was most valuable:**`);
    lines.push(feedbackData.mostValuable);
    lines.push('');
  }

  if (feedbackData.improvements) {
    lines.push(`**Suggested improvements:**`);
    lines.push(feedbackData.improvements);
    lines.push('');
  }

  if (feedbackData.meetingLengthAppropriate) {
    lines.push(`**Meeting length appropriate:** ${feedbackData.meetingLengthAppropriate}`);
    if (feedbackData.meetingLengthAppropriate === 'No') {
      if (feedbackData.meetingLengthReason) {
        lines.push(`**Reason:** ${feedbackData.meetingLengthReason}`);
      }
      if (feedbackData.meetingLengthSuggestion) {
        lines.push(`**Suggestion:** ${feedbackData.meetingLengthSuggestion}`);
      }
    }
    lines.push('');
  }

  if (feedbackData.additionalComments) {
    lines.push(`**Additional comments:**`);
    lines.push(feedbackData.additionalComments);
  }

  return lines.join('\n');
}

// Get top 10 content by average rating
app.get('/api/session/:sessionId/top10', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Calculate average rating for each poll
    const pollsWithRatings = session.polls.map(poll => {
      const pollVotes = session.votes.get(poll.id);
      let average = 0;
      let totalVotes = 0;

      if (pollVotes && pollVotes.size > 0) {
        const ratings = Array.from(pollVotes.values());
        totalVotes = ratings.length;
        average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      }

      return {
        id: poll.id,
        creator: poll.creator,
        company: poll.company,
        mediaItems: poll.mediaItems,
        average: parseFloat(average.toFixed(2)),
        totalVotes
      };
    });

    // Sort by average rating (descending) and take top 10
    const top10 = pollsWithRatings
      .filter(p => p.totalVotes > 0) // Only include polls with at least one vote
      .sort((a, b) => b.average - a.average)
      .slice(0, 10);

    // Calculate overall average per creator across all their content
    const creatorStats = {};
    pollsWithRatings
      .filter(p => p.totalVotes > 0)
      .forEach(poll => {
        if (!creatorStats[poll.creator]) {
          creatorStats[poll.creator] = { totalRating: 0, contentCount: 0 };
        }
        creatorStats[poll.creator].totalRating += poll.average;
        creatorStats[poll.creator].contentCount += 1;
      });

    // Find top creator(s) by overall average (handle ties)
    let topCreators = [];
    let highestOverallAverage = 0;
    for (const [creator, stats] of Object.entries(creatorStats)) {
      const overallAverage = stats.totalRating / stats.contentCount;
      const roundedAverage = parseFloat(overallAverage.toFixed(2));

      if (roundedAverage > highestOverallAverage) {
        // New highest - reset the list
        highestOverallAverage = roundedAverage;
        topCreators = [{
          name: creator,
          overallAverage: roundedAverage,
          contentCount: stats.contentCount
        }];
      } else if (roundedAverage === highestOverallAverage) {
        // Tie - add to the list
        topCreators.push({
          name: creator,
          overallAverage: roundedAverage,
          contentCount: stats.contentCount
        });
      }
    }

    // Return topCreator for backwards compatibility, and topCreators for ties
    res.json({
      success: true,
      top10,
      topCreator: topCreators.length > 0 ? topCreators[0] : null,
      topCreators: topCreators.length > 0 ? topCreators : null,
      totalPolls: session.polls.length,
      sessionName: session.name
    });
  } catch (error) {
    console.error('Error getting top 10:', error);
    res.status(500).json({ error: 'Failed to get top 10' });
  }
});

// ClickUp API integration for feedback
async function createClickUpFeedbackTask(sessionName, description, feedbackData) {
  const CLICKUP_API_TOKEN = 'pk_89331356_M4MCB2W1V5ZVIW1ZKI403ZZZOI06D31N';
  const CLICKUP_LIST_ID = '901710068500';

  // Build task name with date
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const taskName = `Session Feedback - ${dateStr}`;

  // Add tags based on feedback content
  const tags = ['feedback'];
  if (feedbackData.improvements) {
    tags.push('has-suggestions');
  }
  if (feedbackData.rating && feedbackData.rating <= 2) {
    tags.push('needs-attention');
  }

  const response = await fetch(`https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`, {
    method: 'POST',
    headers: {
      'Authorization': CLICKUP_API_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: taskName,
      description: description,
      tags: tags
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClickUp API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

module.exports = app;
