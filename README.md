# Team Polling App

A real-time polling application that allows teams to rate videos and images. Perfect for design reviews, content voting, and team feedback sessions.

## Features

- **Host Dashboard**: Create multiple polls with videos/images, see live results with averages
- **Voter Interface**: Simple rating interface (0-10 scale) for team members
- **Real-time Updates**: Live vote counting and average calculations using Socket.IO
- **Media Support**: Upload and display both images and videos
- **Session Management**: Each polling session has unique links for host and voters

## Setup Instructions

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. Open a terminal in the project directory

2. Install dependencies:

```bash
npm install
```

3. Start the server:

```bash
npm start
```

4. Open your browser and navigate to:

```
http://localhost:3000
```

## How to Use

### For the Host:

1. Go to `http://localhost:3000`
2. Click "Create New Poll Session"
3. Copy the voter link to share with your team
4. Click "Go to Host Dashboard"
5. Add polls by entering:
   - Poll question/title
   - Upload a video or image file
6. Click "Add Poll" for each question
7. Once all polls are added, click "Start Voting Session"
8. Watch live results as team members vote
9. Click "Next Poll" to move to the next question
10. Click "Finish Session" when done

### For Voters:

1. Open the voter link shared by the host
2. Wait for the host to start the poll
3. View the video/image and question
4. Use the slider or number input to select a rating (0-10)
5. Click "Submit Rating"
6. The screen will automatically update when the host moves to the next poll

## Project Structure

```
voting website/
├── server.js              # Express server and Socket.IO setup
├── package.json          # Project dependencies
├── views/                # HTML pages
│   ├── index.html       # Landing page
│   ├── host.html        # Host dashboard
│   └── voter.html       # Voter interface
├── public/
│   ├── css/
│   │   └── style.css    # Styling
│   ├── js/
│   │   ├── index.js     # Landing page logic
│   │   ├── host.js      # Host dashboard logic
│   │   └── voter.js     # Voter interface logic
│   └── uploads/         # Uploaded media files
└── README.md
```

## Technical Details

- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.IO
- **File Upload**: Multer
- **Storage**: In-memory (sessions persist until server restart)

## Notes

- Sessions are stored in memory and will be lost when the server restarts
- Maximum file upload size is 50MB
- Supported media formats: All common image and video formats
- Each voter gets a unique ID stored in localStorage to prevent duplicate votes per session

## Future Enhancements

- Add database support for persistent sessions
- Export results to CSV/Excel
- Add authentication for hosts
- Support for scheduled polls
- Mobile app version
