const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const sessions = new Map();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/host-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'host-login.html'));
});

app.get('/join-session', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'join-session.html'));
});

app.get('/host/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'host.html'));
});

app.get('/vote/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'voter.html'));
});

app.post('/api/host/login', (req, res) => {
  const { username, password } = req.body;

  if (username === process.env.HOST_USERNAME && password === process.env.HOST_PASSWORD) {
    const sessionId = uuidv4().substring(0, 8);
    sessions.set(sessionId, {
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

app.post('/api/session/verify', (req, res) => {
  const { sessionId, email } = req.body;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  const voterId = uuidv4();
  session.voters.set(voterId, email);

  res.json({ success: true, voterId });
});

app.post('/api/session/:sessionId/poll', upload.single('media'), (req, res) => {
  const { sessionId } = req.params;
  const { title } = req.body;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const poll = {
    id: uuidv4(),
    title,
    mediaUrl: req.file ? `/uploads/${req.file.filename}` : null,
    mediaType: req.file ? req.file.mimetype.split('/')[0] : null
  };

  session.polls.push(poll);
  res.json({ poll });
});

app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId: session.id,
    polls: session.polls,
    currentPollIndex: session.currentPollIndex
  });
});

app.get('/api/session/:sessionId/current-poll', (req, res) => {
  const { sessionId } = req.params;
  const { voterId } = req.query;
  const session = sessions.get(sessionId);

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

app.post('/api/session/:sessionId/start/:pollIndex', (req, res) => {
  const { sessionId, pollIndex } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const index = parseInt(pollIndex);
  if (index < 0 || index >= session.polls.length) {
    return res.status(400).json({ error: 'Invalid poll index' });
  }

  session.currentPollIndex = index;
  session.votes.set(session.polls[index].id, new Map());

  io.to(sessionId).emit('pollStarted', {
    poll: session.polls[index],
    pollIndex: index
  });

  res.json({ success: true });
});

app.post('/api/session/:sessionId/vote', (req, res) => {
  const { sessionId } = req.params;
  const { pollId, voterId, rating } = req.body;
  const session = sessions.get(sessionId);

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

  const ratings = Array.from(pollVotes.values());
  const average =
    ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2) : 0;

  const votesWithEmails = Array.from(pollVotes.entries()).map(([vId, rating]) => ({
    email: session.voters.get(vId) || 'Unknown',
    rating
  }));

  io.to(`host-${sessionId}`).emit('voteUpdate', {
    pollId,
    totalVotes: ratings.length,
    average,
    ratings,
    votesWithEmails
  });

  res.json({ success: true });
});

io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('joinSession', ({ sessionId, role }) => {
    socket.join(sessionId);
    if (role === 'host') {
      socket.join(`host-${sessionId}`);
    }
    console.log(`Socket ${socket.id} joined session ${sessionId} as ${role}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
