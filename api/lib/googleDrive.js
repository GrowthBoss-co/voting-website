// Google Drive helper module for syncing poll notes
const { google } = require('googleapis');

const PARENT_FOLDER_ID = '1rwoB0jfweS_xZ-Z7ydfo0nk6iFBU5emY';

/**
 * Create an authenticated OAuth2 client using refresh token.
 * The access token is obtained automatically from the refresh token.
 */
function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
  return oauth2Client;
}

/**
 * Get the Drive service instance.
 */
function getDriveService() {
  const auth = getAuthClient();
  return google.drive({ version: 'v3', auth });
}

/**
 * Find or create a subfolder under the parent folder.
 * Returns the folder ID.
 */
async function findOrCreateFolder(drive, folderName) {
  // Escape single quotes in folder name for query
  const escapedName = folderName.replace(/'/g, "\\'");
  const query = `name='${escapedName}' and '${PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive'
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create new folder
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [PARENT_FOLDER_ID]
  };
  const folder = await drive.files.create({
    resource: folderMetadata,
    fields: 'id'
  });
  return folder.data.id;
}

/**
 * Create or update a text file in a Drive folder.
 * If existingFileId is provided, updates the existing file.
 * Otherwise creates a new file and returns the new file ID.
 */
async function createOrUpdateTextFile(drive, folderId, fileName, content, existingFileId) {
  const { Readable } = require('stream');

  // Create a readable stream from the content string
  const stream = new Readable();
  stream.push(content);
  stream.push(null);

  const media = {
    mimeType: 'text/plain',
    body: stream
  };

  if (existingFileId) {
    // Update existing file content
    await drive.files.update({
      fileId: existingFileId,
      media: media
    });
    return existingFileId;
  }

  // Create new file
  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  };
  const file = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  });
  return file.data.id;
}

/**
 * Build plain text content for the poll content file.
 */
function buildPollContentText(poll, pollIndex) {
  const lines = [
    `Poll #${pollIndex + 1}`,
    '',
    `Creator: ${poll.creator}`,
    `Company: ${poll.company}`,
    `Timer: ${poll.timer}s`,
    '',
    'Media:'
  ];

  poll.mediaItems.forEach((item, i) => {
    lines.push(`  ${i + 1}. [${item.type}] ${item.url}`);
  });

  return lines.join('\n');
}

/**
 * Build plain text content for the notes file.
 */
function buildNotesText(notes, pollTitle) {
  const sorted = [...notes].sort((a, b) => a.timestamp - b.timestamp);

  const lines = [
    `Notes for: ${pollTitle}`,
    `Total notes: ${sorted.length}`,
    `Last updated: ${new Date().toISOString()}`,
    '',
    '---',
    ''
  ];

  sorted.forEach(note => {
    const time = new Date(note.timestamp).toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
    lines.push(`[${time}] ${note.content}`);
  });

  return lines.join('\n');
}

/**
 * Main sync function: syncs poll notes to Google Drive.
 *
 * @param {object} redis - Redis client instance
 * @param {string} sessionId - The session ID
 * @param {string} pollId - The poll ID (e.g., "poll-0")
 * @param {number} pollIndex - The poll index number
 * @param {object} poll - The poll object with creator, company, mediaItems
 * @param {string} pollTitle - The poll title (e.g., "Creator - Company")
 * @param {Array} notes - All notes for this poll
 */
async function syncNotesToDrive(redis, sessionId, pollId, pollIndex, poll, pollTitle, notes) {
  // Check if Drive sync is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('Google Drive sync not configured, skipping');
    return;
  }

  const drive = getDriveService();

  // 1. Get or create cached folder/file IDs from Redis
  const cacheKey = `drive:folders:${sessionId}`;
  const cache = (await redis.get(cacheKey)) || {};
  const pollCache = cache[pollId] || {};

  // 2. Find or create the subfolder
  let folderId = pollCache.folderId;
  if (!folderId) {
    // Use "Poll X - Creator - Company" format for uniqueness
    const folderName = `Poll ${pollIndex + 1} - ${poll.creator} - ${poll.company}`;
    folderId = await findOrCreateFolder(drive, folderName);
    pollCache.folderId = folderId;
  }

  // 3. Create poll content file (only once)
  if (!pollCache.contentFileId) {
    const contentText = buildPollContentText(poll, pollIndex);
    const contentFileId = await createOrUpdateTextFile(
      drive, folderId, 'poll_content.txt', contentText, null
    );
    pollCache.contentFileId = contentFileId;
  }

  // 4. Create or update the notes file
  const notesText = buildNotesText(notes, pollTitle);
  const notesFileId = await createOrUpdateTextFile(
    drive, folderId, 'notes.txt', notesText, pollCache.notesFileId || null
  );
  pollCache.notesFileId = notesFileId;

  // 5. Save updated cache to Redis
  cache[pollId] = pollCache;
  await redis.set(cacheKey, cache, { ex: 2592000 }); // 30 days

  console.log(`Drive sync complete for ${pollId}: folder=${folderId}`);
}

module.exports = {
  syncNotesToDrive
};
