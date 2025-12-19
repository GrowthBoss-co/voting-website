const express = require('express');
const { Redis } = require('@upstash/redis');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ImgBB API Key for images (get from https://api.imgbb.com/)
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// Cloudinary for videos (get from https://cloudinary.com/)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Serve HTML pages
app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, '..', 'views', 'index.html'));
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send('Error loading page');
  }
});

app.get('/host-login', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, '..', 'views', 'host-login.html'));
  } catch (error) {
    console.error('Error serving host-login.html:', error);
    res.status(500).send('Error loading page');
  }
});

app.get('/join-session', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, '..', 'views', 'join-session.html'));
  } catch (error) {
    console.error('Error serving join-session.html:', error);
    res.status(500).send('Error loading page');
  }
});

app.get('/host/:sessionId', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, '..', 'views', 'host.html'));
  } catch (error) {
    console.error('Error serving host.html:', error);
    res.status(500).send('Error loading page');
  }
});

app.get('/vote/:sessionId', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, '..', 'views', 'voter.html'));
  } catch (error) {
    console.error('Error serving voter.html:', error);
    res.status(500).send('Error loading page');
  }
});

// Helper functions for Redis storage
async function getSession(sessionId) {
  const session = await redis.get(`session:${sessionId}`);
  if (session && session.votes) {
    session.votes = new Map(Object.entries(session.votes));
  }
  if (session && session.voters) {
    session.voters = new Map(Object.entries(session.voters));
  }
  return session;
}

async function saveSession(sessionId, session) {
  const sessionToSave = { ...session };
  if (session.votes instanceof Map) {
    sessionToSave.votes = Object.fromEntries(session.votes);
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
    const sessionId = uuidv4().substring(0, 8);
    await saveSession(sessionId, {
      id: sessionId,
      polls: [],
      currentPollIndex: -1,
      votes: new Map(),
      voters: new Map()
    });
    res.json({ success: true, sessionId });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
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

// Create poll with hybrid upload (ImgBB for images, Cloudinary for videos)
app.post('/api/session/:sessionId/poll', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { title, mediaData, mediaType, fileName } = req.body;
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let mediaUrl = null;
    if (mediaData && mediaType) {
      const isVideo = mediaType.startsWith('video');

      if (isVideo) {
        // Upload videos to Cloudinary with compression
        const uploadResult = await cloudinary.uploader.upload(
          `data:${mediaType};base64,${mediaData}`,
          {
            resource_type: 'video',
            folder: 'polling-app',
            public_id: `${sessionId}_${Date.now()}`,
            // Automatic compression and optimization
            quality: 'auto:good',
            fetch_format: 'auto',
            transformation: [
              { width: 1280, height: 720, crop: 'limit' }, // Max 720p
              { quality: 'auto:good' },
              { fetch_format: 'auto' }
            ]
          }
        );
        mediaUrl = uploadResult.secure_url;
      } else {
        // Upload images to ImgBB (unlimited)
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', mediaData);
        formData.append('name', `${sessionId}_${Date.now()}`);

        const uploadResult = await axios.post(
          'https://api.imgbb.com/1/upload',
          formData,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        mediaUrl = uploadResult.data.data.url;
      }
    }

    const poll = {
      id: uuidv4(),
      title,
      mediaUrl,
      mediaType: mediaType ? mediaType.split('/')[0] : null
    };

    session.polls.push(poll);
    await saveSession(sessionId, session);

    res.json({ poll });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({ error: 'Failed to create poll' });
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
