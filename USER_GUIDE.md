# Voting Website - User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Host Guide](#host-guide)
3. [Voter Guide](#voter-guide)
4. [Tips & Best Practices](#tips--best-practices)
5. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Accessing the Website
Navigate to your deployed Vercel URL (e.g., `https://your-voting-website.vercel.app`)

### Homepage Options
You'll see two main options:
- **Host a Session** - For creating and managing voting sessions
- **Join a Session** - For voters to participate in a session

---

## Host Guide

### 1. Logging In

**Steps:**
1. Click **"Host a Session"** on the homepage
2. Enter credentials:
   - **Username**: `GrowthBossHosting`
   - **Password**: `y&%)U#2+${QF/wG7`
3. Click **"Login"**

**What happens:** You'll be redirected to the session selection page.

---

### 2. Creating or Loading a Session

You'll see two options:

#### Option A: Create New Session
- Click **"Create New Session"**
- Enter a session name (e.g., "Q1 Product Review")
- Click **"Create Session"**
- You'll be taken to the host dashboard in **setup mode**

#### Option B: Load Saved Session
- View the list of previously saved sessions
- For each session, you have three options:
  - **Edit** - Modify polls before presenting
  - **Present** - Start voting immediately with existing polls
  - **Delete** - Remove the session permanently

**Session List Shows:**
- Session name
- Number of polls
- Creation date
- Action buttons

---

### 3. Host Dashboard - Setup Section

This is where you create and manage your polls.

#### Creating a Poll

**Form Fields:**

1. **Poll Question/Title**
   - Enter your question (e.g., "Rate this design concept")
   - This will be displayed to voters

2. **Timer (seconds)**
   - Set voting duration: 10-600 seconds
   - Default: 60 seconds
   - Recommended: 30-90 seconds for most polls

3. **Media URLs**
   - Enter image or video URLs (one per line)
   - **For Images**: Use Imgur direct links
     - Example: `https://i.imgur.com/abc123.jpg`
   - **For Videos**: Use YouTube links (any format)
     - `https://youtube.com/watch?v=xxxxx`
     - `https://youtu.be/xxxxx`
   - **Multiple Media**: Enter one URL per line for carousel navigation

4. Click **"Add Poll"** to save

**What happens:**
- Poll appears in the "Created Polls" list below
- Each poll shows:
  - Poll number and title
  - Number of media items
  - Timer duration
  - Edit and Delete buttons

#### Managing Polls

**Editing a Poll:**
1. Click **"Edit"** on any poll in the list
2. Form fills with existing data
3. Make your changes
4. Click **"Update Poll"**
5. Or click **"Cancel"** to discard changes

**Deleting a Poll:**
1. Click **"Delete"** on any poll
2. Confirm the deletion
3. Poll is removed from the list

**Reordering Polls:**
1. Click and hold the **drag handle** (6-dot icon) on the left of any poll
2. Drag the poll up or down to reorder
3. Release to drop in new position
4. Order is saved automatically

**Visual Feedback:**
- While dragging: Poll becomes semi-transparent
- Drop target: Shows blue top border and teal background
- Polls automatically renumber after reordering

---

### 4. Starting the Voting Session

**Prerequisites:**
- At least one poll must be created
- "Start Voting Session" button will be enabled

**Steps:**
1. Review your polls (order, content, timers)
2. Click **"Start Voting Session"**
3. The view switches to **Voting Section**

**What happens:**
- Setup section disappears
- First poll becomes active
- Timer starts counting down
- Voters can now see and vote on the poll

---

### 5. Host Dashboard - Voting Section

#### Current Poll Display

You'll see:
- **Timer Display** (top)
  - Green: More than 30 seconds remaining
  - Orange: 30 seconds or less
  - Red: 10 seconds or less
  - Gray: Time expired
  - Format: "Time remaining: **XX**s"

- **Poll Title**
  - Your question displayed prominently

- **Media Display**
  - Single image/video: Displayed directly
  - Multiple items: Carousel with left/right arrows
    - Click arrows to navigate
    - Click dot indicators to jump to specific item

- **Live Results Panel**
  - **Total Votes**: Real-time count
  - **Average Rating**: Updates every 2 seconds
  - Note: Individual ratings are hidden during voting

- **Poll Controls**
  - Progress indicator (e.g., "Poll 1 of 5")
  - **"Next Poll"** button (or "Finish Session" on last poll)

#### Carousel Navigation (Multiple Media)

**Controls:**
- **Left Arrow (‹)**: Previous item
- **Right Arrow (›)**: Next item
- **Dot Indicators**: Click to jump to specific item
  - Active dot is highlighted in purple
  - Inactive dots are gray

**Features:**
- Wraps around (last item → first item)
- Images display at optimal size
- Videos play in embedded YouTube player

#### Monitoring Results

**Live Updates:**
- Results refresh every 2 seconds automatically
- Watch votes come in real-time
- Average rating recalculates with each new vote

**What Voters See:**
- They cannot see how others voted
- They only see their own submitted rating

---

### 6. Moving Between Polls

**To Next Poll:**
1. Wait for voting to complete (or don't - timer is just a guide for voters)
2. Click **"Next Poll"**

**What happens:**
- Current poll ends
- Next poll starts immediately
- New timer begins
- New media is displayed
- Results reset to 0 votes, no average
- Previous poll results are saved

**On Last Poll:**
- Button says "Finish Session" instead
- Clicking it ends the entire session

---

### 7. Session Results (After Completion)

After finishing all polls, you'll see:

**Summary Screen:**
- "Session Complete - Final Results" header
- List of all completed polls (expandable)

**For Each Poll:**
- Poll title
- Total votes received
- Average rating (X/10)
- Click to expand and see:
  - Individual voter emails
  - Each voter's rating
  - Sorted by voter

**Actions:**
- Review all results
- Click **"Back to Home"** to start a new session

**Note:** Results are displayed on-screen only. Consider taking screenshots or copying data if you need to save them beyond the 24-hour session expiry.

---

### 8. Saving Sessions for Later

**When Editing:**
If you loaded a session in "Edit" mode:
- The "Start Voting" button says **"Save & Exit"**
- Clicking it saves your changes without presenting
- You can present it later

**When Creating:**
- Sessions are automatically saved when you create polls
- They appear in your "Saved Sessions" list for 24 hours
- After 24 hours, they expire and are deleted

---

## Voter Guide

### 1. Joining a Session

**Steps:**
1. Click **"Join a Session"** on the homepage
2. Enter the **Session ID** (provided by the host)
   - Format: UUID (e.g., "abc-123-def-456")
3. Enter your **Email Address**
   - Used to track your votes
   - Shown to host with your ratings
4. Click **"Join Session"**

**What happens:**
- You're taken to the voter interface
- You'll see a waiting screen until the host starts a poll

---

### 2. Waiting Screen

**What You See:**
- Large message: "Waiting for host to start the poll..."
- Session ID reminder
- Background with animated gradient

**What to Do:**
- Wait for the host to start the first poll
- Keep the page open
- No need to refresh - it updates automatically every 2 seconds

---

### 3. Voting on a Poll

When the host starts a poll, the screen automatically updates:

#### Timer Display (Top)
- Shows time remaining in seconds
- **Green**: Plenty of time (>30s)
- **Orange**: Running low (10-30s)
- **Red**: Almost out (<10s)
- **Gray**: Time expired - voting closed

#### Poll Question
- Displayed as a heading
- Clearly states what you're rating

#### Media Display

**Single Item:**
- Image or video displayed directly
- Images: Full size, up to 500px height
- Videos: YouTube player, 16:9 aspect ratio

**Multiple Items (Carousel):**
- Left and right arrow buttons
- Click **‹** to go to previous item
- Click **›** to go to next item
- Dot indicators below show position
  - Click any dot to jump to that item
  - Purple dot = current item
  - Gray dots = other items
- Wraps around (circular navigation)

#### Rating Controls

**Rating Slider:**
- Drag slider from 0 to 10
- Visual feedback as you drag
- Snaps to whole numbers

**Number Input:**
- Type a number (0-10)
- Synced with slider
- Invalid numbers (negative, >10) are auto-corrected

**Current Value:**
- Displayed on both slider and input
- Updates in real-time as you adjust

**Default:** Starts at 5/10

#### Submitting Your Vote

**Steps:**
1. View the media (navigate carousel if multiple items)
2. Move slider or type your rating (0-10 scale)
3. Click **"Submit Rating"**

**What happens:**
- Success message appears: "Rating submitted successfully!"
- Rating controls become disabled (grayed out)
- You cannot change your vote
- Your rating is locked in

**If Timer Expires Before Submission:**
- Controls automatically disable
- Submit button grays out
- Message: "Voting period has ended for this poll"
- You cannot vote on this poll anymore
- Media remains viewable (carousel still works)

---

### 4. After Voting

**Screen State:**
- Timer continues to count down (or shows expired)
- Media remains visible and interactive
- Your submitted rating is shown: "You already submitted your rating: X/10"
- All rating controls are disabled
- Green success message confirms submission

**What You Can Still Do:**
- View/navigate the media (carousel works)
- See the timer count down
- Wait for the host to move to next poll

**What You Cannot Do:**
- Change your rating
- Re-vote on this poll
- See other voters' ratings

---

### 5. Moving to Next Poll

**What happens:**
- Screen automatically updates when host clicks "Next Poll"
- Previous poll content clears
- New poll loads with:
  - Fresh timer (green, full duration)
  - New poll question
  - New media/carousel
  - Rating reset to 5/10
  - Controls re-enabled (if you haven't voted yet)

**No Refresh Needed:**
- Page updates automatically
- Happens within 2 seconds of host action
- Smooth transition

---

### 6. Late Joining

**Scenario:** You join after the poll has started

**What happens:**
- Timer shows remaining time (not full duration)
- If less than 10 seconds: Red timer
- If already expired (0s): Voting disabled immediately
- Timer message: "Voting Closed - Time expired"

**Can You Vote?**
- Yes, if time remains (even 1 second)
- No, if timer shows 0
- Content is viewable regardless

---

### 7. Voting Status Indicators

**Before Voting:**
- Slider and input: Enabled (white background)
- Submit button: Blue, clickable
- No status message

**After Voting:**
- Slider and input: Disabled (gray background)
- Submit button: Grayed out, not clickable
- Green message: "Rating submitted successfully!"
- Shows your rating: "You already submitted your rating: X/10"

**Timer Expired (Didn't Vote):**
- All controls: Disabled
- Red/orange message: "Voting period has ended for this poll"
- Timer: Gray background, shows 0

**Timer Expired (Already Voted):**
- All controls: Disabled
- Green message: Your submitted rating still shown
- Timer: Gray background, shows 0

---

### 8. Session End

**What happens:**
- Host finishes last poll
- You're returned to waiting screen
- Message: "Waiting for host to start the poll..."
- No more polls will appear

**What to Do:**
- You can close the browser
- Session is complete
- Host has all your ratings

---

## Tips & Best Practices

### For Hosts

#### Planning Your Session

1. **Prepare Media in Advance**
   - Upload images to Imgur
   - Upload videos to YouTube (can be unlisted)
   - Have URLs ready before creating session

2. **Order Polls Logically**
   - Use drag-and-drop to organize
   - Start with simpler polls to warm up voters
   - Group related content together

3. **Set Appropriate Timers**
   - Simple images: 30-45 seconds
   - Complex designs: 60-90 seconds
   - Videos: Duration + 30-60 seconds
   - Multiple items in carousel: Add 15-20 seconds per item

4. **Test Your Session**
   - Create session in "Edit" mode first
   - Preview polls before presenting
   - Check that media loads properly

#### During the Session

1. **Communicate Session ID Clearly**
   - Share via chat/email before starting
   - Display on screen if in-person
   - Use "Copy ID" button for easy sharing

2. **Give Voters Time to Join**
   - Wait 1-2 minutes after sharing ID
   - Don't start first poll immediately
   - Announce when you're about to begin

3. **Monitor Timer Colors**
   - Green: Voters are still reviewing
   - Orange/Red: Most should be done
   - Don't rush - some voters need extra time

4. **Watch Vote Count**
   - Know how many voters joined
   - Wait for most votes before moving on
   - Some voters may skip polls (that's okay)

5. **Pace Yourself**
   - Don't rush through polls
   - Give brief context if needed (verbal/chat)
   - Allow time for questions between polls

#### After the Session

1. **Review Results Immediately**
   - Sessions expire after 24 hours
   - Take screenshots if you need records
   - Note any outlier ratings for discussion

2. **Save Useful Sessions**
   - Reusable templates: Save in Edit mode
   - One-time use: Let expire after 24 hours

### For Voters

#### Before Joining

1. **Have Session ID Ready**
   - Get it from host via chat/email
   - Copy-paste rather than typing
   - Ensure you have the correct ID

2. **Use a Reliable Device**
   - Desktop/laptop recommended for best experience
   - Tablet works well
   - Phone is usable but smaller carousel controls

3. **Stable Internet Connection**
   - Updates every 2 seconds
   - Slow connection = delayed poll updates
   - Wi-Fi preferred over cellular

#### During Voting

1. **Review All Media Before Rating**
   - Use carousel arrows to see all items
   - Watch full videos if included
   - Don't rush to submit

2. **Use the Full Rating Scale**
   - 0-10 gives nuanced feedback
   - Don't cluster around 5 or 7
   - Think about what each number means to you

3. **Watch the Timer**
   - Submit before it expires
   - Orange (30s) = time to decide
   - Red (10s) = submit now

4. **If You Miss the Timer**
   - Don't worry, move on
   - You can still view content
   - Focus on next poll

5. **Don't Refresh the Page**
   - Polls update automatically
   - Refreshing might disconnect you
   - If you do refresh, you'll see where you left off

---

## Troubleshooting

### Common Issues & Solutions

#### For Hosts

**Problem: Can't log in**
- **Check**: Username is exactly `GrowthBossHosting`
- **Check**: Password is exactly `y&%)U#2+${QF/wG7` (case-sensitive)
- **Try**: Copy-paste credentials instead of typing

**Problem: "Start Voting Session" button is disabled**
- **Cause**: No polls created yet
- **Solution**: Add at least one poll with the form

**Problem: Poll media doesn't load**
- **Check**: URLs are valid and accessible
- **For Images**: Use direct Imgur links (i.imgur.com)
- **For Videos**: Use YouTube URLs (any format works)
- **Try**: Test URL in new browser tab first

**Problem: Can't reorder polls by dragging**
- **Try**: Click and hold the 6-dot icon specifically
- **Try**: Different browser (Chrome/Firefox work best)
- **Check**: Not in edit mode on a specific poll

**Problem: Voters aren't seeing the poll**
- **Check**: You clicked "Start Voting Session"
- **Check**: Voters have correct session ID
- **Wait**: Updates happen every 2 seconds
- **Try**: Refresh voter pages (they'll reconnect)

**Problem: Vote count seems low**
- **Check**: Some voters may have late joined
- **Remember**: Voters can skip polls (allowed)
- **Wait**: Some voters may still be reviewing

**Problem: Session disappeared**
- **Cause**: 24-hour expiry
- **Solution**: Create sessions same-day as presentation
- **Prevention**: Screenshot/copy results before ending

#### For Voters

**Problem: "Session not found" error**
- **Check**: Session ID is correct (copy-paste it)
- **Check**: Session hasn't expired (24 hours)
- **Check**: Host has created the session
- **Ask**: Host to verify session ID

**Problem: Stuck on waiting screen**
- **Check**: Host has started the poll
- **Wait**: Updates every 2 seconds (be patient)
- **Try**: Refresh page (you won't lose progress)
- **Ask**: Host if they started voting

**Problem: Can't submit vote**
- **Check**: Timer hasn't expired (not gray)
- **Check**: You haven't already voted (no green message)
- **Check**: Rating is between 0-10
- **Try**: Refresh page and re-submit

**Problem: Timer expired too fast**
- **Cause**: You joined late (timer shows remaining time)
- **Solution**: Join early when session ID is shared
- **Note**: Content still viewable after expiry

**Problem: Can't see new poll**
- **Wait**: Updates every 2 seconds
- **Check**: Internet connection is stable
- **Try**: Refresh page (safe to do)
- **Ask**: Host if they moved to next poll

**Problem: Carousel arrows don't work**
- **Try**: Click directly on arrow buttons (‹ ›)
- **Try**: Click dot indicators instead
- **Try**: Different browser
- **Check**: JavaScript is enabled

**Problem: Video won't play**
- **Check**: YouTube video is not private/deleted
- **Try**: Click play button in video player
- **Wait**: Videos can take time to load
- **Check**: Adblocker isn't blocking embeds

**Problem: Lost connection / disconnected**
- **Solution**: Refresh page
- **Effect**: You'll see current poll state
- **Note**: Your votes are saved (won't lose them)

#### General Issues

**Problem: Website is slow**
- **Cause**: Vercel cold start (first request after idle)
- **Solution**: Wait 2-3 seconds, will speed up
- **Prevention**: Keep page open during session

**Problem: Page looks broken / no styling**
- **Try**: Hard refresh (Ctrl+F5 or Cmd+Shift+R)
- **Try**: Clear browser cache
- **Try**: Different browser (Chrome recommended)

**Problem: Features not working**
- **Check**: JavaScript is enabled
- **Check**: Browser is up-to-date
- **Try**: Disable browser extensions (especially adblockers)

---

## Keyboard Shortcuts & Accessibility

### For All Users

**Browser Shortcuts:**
- `F5` - Refresh page
- `Ctrl+F5` (or `Cmd+Shift+R` on Mac) - Hard refresh
- `Ctrl+C` - Copy (for session ID)
- `Ctrl+V` - Paste (for session ID)

### For Voters

**Rating Controls:**
- `Tab` - Navigate between slider and input
- `Arrow Keys` - Adjust slider value (when focused)
- `Enter` - Submit rating (when button is focused)
- `0-9` - Type rating directly in input box

### Accessibility Features

**Visual:**
- High contrast timer colors (green/orange/red)
- Large, readable fonts
- Clear button states (enabled/disabled)

**Interaction:**
- Slider AND number input (choose your preference)
- Click or drag for carousel navigation
- Keyboard accessible form controls

**Responsive:**
- Works on desktop, tablet, and mobile
- Layout adapts to screen size
- Touch-friendly buttons on mobile

---

## Session Planning Checklist

### Host Pre-Session Checklist

- [ ] Media uploaded and URLs ready
- [ ] Session created with all polls
- [ ] Polls in correct order
- [ ] Timer durations set appropriately
- [ ] Tested that media loads
- [ ] Session ID copied and ready to share
- [ ] Voters have session ID
- [ ] Communication channel ready (chat/email)

### Host During Session Checklist

- [ ] Shared session ID
- [ ] Waited for voters to join
- [ ] Started first poll
- [ ] Monitoring vote count
- [ ] Pacing polls appropriately
- [ ] Giving verbal context (if applicable)
- [ ] Watching timer colors

### Host Post-Session Checklist

- [ ] Reviewed all results
- [ ] Screenshot/copied important data
- [ ] Noted outliers or trends
- [ ] Closed session gracefully
- [ ] Communicated next steps to voters

### Voter Checklist

- [ ] Have session ID
- [ ] Joined session successfully
- [ ] Email entered correctly
- [ ] Connection is stable
- [ ] Ready to focus on polls
- [ ] Understand rating scale (0-10)

---

## Quick Reference

### Host Dashboard Sections

| Section | Purpose | Key Actions |
|---------|---------|-------------|
| Setup | Create/edit polls | Add, Edit, Delete, Reorder |
| Voting | Run live session | Monitor, Next Poll, Finish |
| Results | View outcomes | Review votes, Export data |

### Voter Screen States

| State | What You See | What You Can Do |
|-------|--------------|-----------------|
| Waiting | "Waiting for host..." | Wait for poll to start |
| Active Poll | Timer, media, rating controls | Vote before timer expires |
| Voted | Green confirmation, locked controls | View media, wait for next |
| Timer Expired | Gray timer, disabled controls | View media only |

### Timer Color Guide

| Color | Time Remaining | Meaning |
|-------|----------------|---------|
| Green | >30 seconds | Plenty of time |
| Orange | 10-30 seconds | Start deciding |
| Red | 1-10 seconds | Submit now! |
| Gray | 0 seconds | Voting closed |

### Media URL Formats

| Platform | Example URL | Notes |
|----------|-------------|-------|
| Imgur (Image) | `https://i.imgur.com/abc123.jpg` | Use direct link |
| YouTube (Video) | `https://youtube.com/watch?v=xxxxx` | Any format works |
| YouTube Short | `https://youtu.be/xxxxx` | Converts automatically |

### Rating Scale Guide

| Rating | Meaning | Use When |
|--------|---------|----------|
| 0-2 | Poor | Serious issues, unusable |
| 3-4 | Below Average | Needs major improvements |
| 5-6 | Average | Acceptable, room for improvement |
| 7-8 | Good | Works well, minor improvements |
| 9-10 | Excellent | Outstanding, ready to ship |

---

## Support & Feedback

### Getting Help

1. **Check this guide** - Most questions answered here
2. **Review Troubleshooting section** - Common issues & fixes
3. **Test in different browser** - Chrome recommended
4. **Check internet connection** - Stable connection required

### Technical Details

- **Session Duration**: 24 hours from creation
- **Poll Update Frequency**: Every 2 seconds
- **Supported Media**: YouTube videos, Imgur images
- **Supported Browsers**: Chrome, Firefox, Safari, Edge (latest versions)
- **Devices**: Desktop, tablet, mobile (responsive design)

---

## Summary

This voting website provides a simple, real-time way to gather team feedback on visual content. Hosts create polls with media and timers, voters rate from 0-10, and results appear live. The intuitive interface requires no training, and sessions work seamlessly across devices.

**Key Takeaways:**
- **Hosts**: Plan ahead, set appropriate timers, pace your session
- **Voters**: Join early, review all media, submit before timer expires
- **Everyone**: No refresh needed - updates happen automatically

Happy voting! 🗳️
