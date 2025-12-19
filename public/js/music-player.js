// Background Music Player
(function() {
  // Create music player HTML
  const playerHTML = `
    <div class="music-player" id="musicPlayer">
      <audio id="bgMusic" loop autoplay>
        <source src="/audio/background-music.mp3" type="audio/mpeg">
      </audio>
      <div class="music-controls">
        <button class="music-btn" id="playPauseBtn" title="Play/Pause">
          ⏸️
        </button>
        <button class="music-btn" id="muteBtn" title="Mute/Unmute">
          🔊
        </button>
      </div>
      <div class="volume-control">
        <input type="range" id="volumeSlider" class="volume-slider" min="0" max="100" value="50">
        <span class="music-info" id="volumeDisplay">50%</span>
      </div>
    </div>
  `;

  // Add player to page when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayer);
  } else {
    initPlayer();
  }

  function initPlayer() {
    // Add player to body
    document.body.insertAdjacentHTML('beforeend', playerHTML);

    const audio = document.getElementById('bgMusic');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const muteBtn = document.getElementById('muteBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeDisplay = document.getElementById('volumeDisplay');

    // Load saved settings from localStorage
    const savedVolume = localStorage.getItem('musicVolume') || 50;
    const wasMuted = localStorage.getItem('musicMuted') === 'true';
    const savedTime = parseFloat(localStorage.getItem('musicTime') || 0);

    // Set initial volume
    audio.volume = savedVolume / 100;
    volumeSlider.value = savedVolume;
    volumeDisplay.textContent = savedVolume + '%';

    // Set initial mute state
    if (wasMuted) {
      audio.muted = true;
      muteBtn.textContent = '🔇';
    }

    // Restore playback position when audio is loaded
    audio.addEventListener('loadedmetadata', () => {
      if (savedTime > 0) {
        audio.currentTime = savedTime;
      }
    });

    // Force load the audio
    audio.load();

    // Auto-play immediately
    const startPlayback = () => {
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
    };

    // Try to start playback immediately
    setTimeout(startPlayback, 100);

    // Fallback: Start on any user interaction if autoplay fails
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

    // Play/Pause functionality
    playPauseBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering the first interaction handler
      if (audio.paused) {
        audio.play().catch(err => console.log('Audio play failed:', err));
        playPauseBtn.textContent = '⏸️';
        localStorage.setItem('musicPlaying', 'true');
      } else {
        audio.pause();
        playPauseBtn.textContent = '▶️';
        localStorage.setItem('musicPlaying', 'false');
      }
    });

    // Mute functionality
    muteBtn.addEventListener('click', () => {
      audio.muted = !audio.muted;
      muteBtn.textContent = audio.muted ? '🔇' : '🔊';
      localStorage.setItem('musicMuted', audio.muted);
    });

    // Volume control
    volumeSlider.addEventListener('input', (e) => {
      const volume = e.target.value;
      audio.volume = volume / 100;
      volumeDisplay.textContent = volume + '%';
      localStorage.setItem('musicVolume', volume);

      // Unmute if volume is adjusted
      if (audio.muted && volume > 0) {
        audio.muted = false;
        muteBtn.textContent = '🔊';
        localStorage.setItem('musicMuted', 'false');
      }
    });

    // Save playback position periodically
    setInterval(() => {
      if (!audio.paused) {
        localStorage.setItem('musicTime', audio.currentTime);
      }
    }, 1000);

    // Save position before page unload
    window.addEventListener('beforeunload', () => {
      localStorage.setItem('musicTime', audio.currentTime);
      localStorage.setItem('musicPlaying', !audio.paused);
    });

    // Handle audio errors
    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      playPauseBtn.textContent = '❌';
      playPauseBtn.disabled = true;
    });

    // Visual feedback when music is playing
    audio.addEventListener('play', () => {
      playPauseBtn.textContent = '⏸️';
    });

    audio.addEventListener('pause', () => {
      playPauseBtn.textContent = '▶️';
    });
  }
})();
