// Configuration for Tab Recorder Extension
const CONFIG = {
  // Backend server URL
  // Change this for production deployment
  SERVER_URL: "http://localhost:3000",

  // Recording settings
  RECORDING: {
    // Video bitrate (bits per second)
    // 2.5 Mbps = good balance between quality and file size
    videoBitsPerSecond: 2500000,

    // Chunk interval in milliseconds
    // Options:
    //   - undefined = No timer, chunks created naturally by codec (MOST EFFICIENT)
    //   - 100-250ms = Very real-time, tiny chunks (good for live streaming)
    //   - 1000ms = Balance between real-time and chunk size
    // Using natural chunking for maximum efficiency
    chunkInterval: undefined,

    // Preferred codec (will fallback to vp8 if unavailable)
    mimeType: "video/webm; codecs=vp9",
  },

  // Auto-record settings
  AUTO_RECORD: {
    // Enable automatic recording when navigating to specific URLs
    enabled: true,

    // URL patterns to auto-start recording
    // Use exact match or wildcard patterns
    urlPatterns: [
      "http://localhost:3001/video-call-v3*",
      "http://localhost:3001/video-call-v3",
      "https://www.youtube.com/*",
      "https://youtube.com/*",
    ],

    // Stop recording when navigating away from the URL
    stopOnNavigateAway: true,
  },
};

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = CONFIG;
}
