# Tab Recorder - Browser Extension & Backend

A powerful Chrome/Edge browser extension that enables efficient tab recording with real-time streaming to a Node.js backend server. Built with Manifest V3 and WebSocket technology for ultra-efficient binary streaming.

## 🌟 Overview

Tab Recorder is a comprehensive solution for capturing browser tabs with minimal memory footprint. It consists of two main components:

1. **Browser Extension** (`exe/`) - Manifest V3 Chrome extension with one-click recording
2. **Backend Server** (`backend/`) - Node.js/Express server with WebSocket support for streaming recordings

## ✨ Key Features

### Recording Capabilities

- **One-Click Recording**: Start/stop recording with a single button click
- **Auto-Record**: Automatically start recording when navigating to specific URLs
- **WebSocket Streaming**: Ultra-efficient binary streaming via persistent WebSocket connection
- **True Streaming to Disk**: Chunks streamed immediately to server, not stored in browser memory
- **Memory Efficient**: Browser uses only ~1-2 MB RAM regardless of recording length
- **Auto-Naming**: Each recording automatically named with unique UUID
- **Auto-Save**: Recordings saved directly to Downloads folder

### Technical Features

- **Manifest V3**: Built with latest Chrome extension architecture
- **Offscreen API**: Uses offscreen documents for MediaRecorder API access
- **WebSocket Protocol**: Binary data streaming with no HTTP overhead
- **Configurable Codecs**: VP9/VP8 support with fallback
- **Quality Control**: Adjustable bitrate and chunk intervals
- **Background Service Worker**: Persistent recording management

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- Chrome/Edge browser
- npm or yarn

### Installation

#### 1. Backend Server Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start the server
npm start
```

The server will run on `http://localhost:3000`

**Alternative**: Use the convenient batch script (Windows):

```bash
start-server.bat
```

#### 2. Extension Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `exe` folder from this project
5. The extension icon will appear in your toolbar

### Usage

1. **Manual Recording**:
   - Click the extension icon in your toolbar
   - Click "Start Recording" to begin capturing the active tab
   - Click "Stop Recording" to end the recording
   - Recording automatically saved to Downloads folder with UUID filename

2. **Auto-Record** (configured in `exe/config.js`):
   - Navigate to a URL matching configured patterns
   - Receive notification prompt to start recording
   - Click "Start Recording" button in notification
   - Recording automatically stops when navigating away (if configured)

## 📁 Project Structure

```
extension/
├── backend/                      # Node.js backend server
│   ├── server.js                # Express + WebSocket server
│   ├── package.json             # Dependencies & scripts
│   └── recordings/              # Saved recording files
│
├── exe/                         # Browser extension
│   ├── manifest.json            # Extension manifest (V3)
│   ├── background.js            # Service worker
│   ├── offscreen.js             # MediaRecorder handler
│   ├── popup.html/js/css        # Extension UI
│   ├── config.js                # Configuration settings
│   ├── icons/                   # Extension icons
│   └── README.md                # Extension documentation
│
├── start-server.bat             # Quick server start script (Windows)
└── README.md                    # This file
```

## 🔧 Configuration

### Extension Configuration (`exe/config.js`)

```javascript
const CONFIG = {
  // Backend server URL
  SERVER_URL: "http://localhost:3000",

  // Recording settings
  RECORDING: {
    videoBitsPerSecond: 2500000, // 2.5 Mbps
    chunkInterval: undefined, // Natural chunking (most efficient)
    mimeType: "video/webm; codecs=vp9",
  },

  // Auto-record settings
  AUTO_RECORD: {
    enabled: true,
    urlPatterns: [
      "http://localhost:3001/video-call-v3*",
      "https://www.youtube.com/*",
    ],
    stopOnNavigateAway: true,
  },
};
```

**Key Configuration Options**:

- `SERVER_URL`: Backend server endpoint
- `videoBitsPerSecond`: Video quality (higher = better quality, larger file)
- `chunkInterval`: Chunk timing (undefined = natural, most efficient)
- `urlPatterns`: URLs that trigger auto-record notifications
- `stopOnNavigateAway`: Auto-stop when leaving auto-record URL

### Server Configuration (`backend/.env`)

```env
PORT=3000
```

## 🏗️ Architecture

### System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Extension                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  User clicks button → Background.js → Offscreen.js               │
│                                           │                       │
│                                           │ MediaRecorder         │
│                                           │ (generates chunks)    │
│                                           │                       │
│                                           ▼                       │
│                                    Every ~1 second                │
│                                           │                       │
│                                           │ ~250 KB chunk         │
│                                           │                       │
│                                           ▼                       │
│                                    WebSocket Send                 │
│                                    (binary data)                  │
│                                           │                       │
└───────────────────────────────────────────┼───────────────────────┘
                                            │
                                            │ WebSocket (Binary)
                                            │ Persistent Connection
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Server (Node.js)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  WebSocket Server (ws)                                           │
│           │                                                       │
│           ▼                                                       │
│    Receive binary chunk                                          │
│           │                                                       │
│           ▼                                                       │
│    WriteStream.write()                                           │
│           │                                                       │
│           ▼                                                       │
│    ┌──────────────┐                                              │
│    │ Disk Storage │  recording-<uuid>.webm                       │
│    │ (streaming)  │  ├─ Chunk 1 (appended immediately)           │
│    └──────────────┘  ├─ Chunk 2 (appended immediately)           │
│                      ├─ Chunk 3 (appended immediately)           │
│                      └─ ...                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**1. Popup UI (`popup.js`)**

- User interface for start/stop controls
- State display and error handling
- Communication with background script

**2. Background Service Worker (`background.js`)**

- Manages recording state
- Handles tab capture permissions
- Auto-record logic and URL pattern matching
- Offscreen document lifecycle management
- Keep-alive mechanism for long recordings

**3. Offscreen Document (`offscreen.js`)**

- MediaRecorder API implementation
- WebSocket connection management
- Binary chunk streaming to server
- Codec handling and fallback logic

**4. Backend Server (`server.js`)**

- WebSocket server for binary streaming
- File system operations (write streams)
- Recording session management
- RESTful API endpoints (legacy support)
- CORS handling for extension communication

## 🎯 Performance Characteristics

### Memory Usage

- **Browser**: ~1-2 MB (constant, regardless of recording length)
- **Server**: ~1-2 MB per active recording
- **Disk**: Full recording size accumulated over time

### Streaming Efficiency

- **Zero HTTP Overhead**: WebSocket eliminates per-chunk HTTP headers
- **Binary Protocol**: Raw binary data, no JSON/encoding overhead
- **Immediate Flush**: Chunks written to disk instantly
- **No Browser Accumulation**: Memory freed immediately after send

### Recording Quality

- **Default**: 2.5 Mbps (good balance)
- **File Size**: ~1.125 GB per hour at default settings
- **Format**: WebM (VP9/VP8 codec)

## 🛠️ Development

### Backend Development

```bash
cd backend

# Install dependencies
npm install

# Development with auto-reload
npm run dev

# Production
npm start
```

### Extension Development

1. Make changes to files in `exe/` directory
2. Go to `chrome://extensions/`
3. Click reload icon on the extension card
4. Test changes

### Testing

1. Start the backend server
2. Load the extension in Chrome
3. Navigate to any webpage
4. Click extension icon and start recording
5. Check `backend/recordings/` for output files

## 📋 API Reference

### WebSocket Protocol

**Client → Server Messages**:

```json
{
  "type": "start"
}
```

**Server → Client Messages**:

```json
{
  "type": "started",
  "recordingId": "uuid",
  "filename": "recording-uuid.webm"
}

{
  "type": "chunk_ack",
  "chunkNumber": 10,
  "totalSize": 2500000
}

{
  "type": "stopped",
  "filename": "recording-uuid.webm",
  "duration": 60,
  "totalSize": 15000000,
  "chunkCount": 60
}

{
  "type": "error",
  "message": "Error description"
}
```

**Binary Data**: After "start" message, client sends raw ArrayBuffer chunks

### REST API (Legacy)

**POST** `/api/recording/start`

- Starts new recording session
- Returns: `{ success, recordingId, filename }`

**POST** `/api/recording/:recordingId/chunk`

- Uploads binary chunk (deprecated, use WebSocket)
- Body: raw binary data
- Returns: `{ success, chunkNumber, totalSize }`

**POST** `/api/recording/:recordingId/stop`

- Stops recording and finalizes file
- Returns: `{ success, filename, duration, fileSize, chunkCount }`

**GET** `/api/recording/:recordingId`

- Downloads completed recording
- Returns: WebM file

**GET** `/api/recordings`

- Lists all recordings
- Returns: Array of recording metadata

**DELETE** `/api/recording/:recordingId`

- Deletes recording file
- Returns: `{ success }`

## 🔐 Permissions

The extension requires the following permissions:

- **tabCapture**: Capture audio/video from tabs
- **activeTab**: Access active tab information
- **offscreen**: Create offscreen documents
- **downloads**: Save recordings to Downloads folder
- **webNavigation**: Auto-record functionality
- **tabs**: Query tab information

## 🐛 Troubleshooting

### Extension Issues

**Problem**: "Recording failed" error

- **Solution**: Ensure backend server is running on correct port
- **Check**: `exe/config.js` SERVER_URL matches server address

**Problem**: No notification for auto-record

- **Solution**: Check URL patterns in `exe/config.js`
- **Verify**: AUTO_RECORD.enabled is true

**Problem**: Extension icon shows error

- **Solution**: Reload extension from `chrome://extensions/`
- **Check**: Browser console for detailed errors

### Server Issues

**Problem**: Connection refused

- **Solution**: Start backend server with `npm start`
- **Verify**: Server running on correct port (default 3000)

**Problem**: Recordings not saving

- **Solution**: Check `backend/recordings/` directory exists
- **Verify**: Server has write permissions to directory

**Problem**: WebSocket connection fails

- **Solution**: Check firewall settings
- **Verify**: WebSocket upgrade is allowed on server

## 📝 License

MIT

## 👨‍💻 Development Notes

### Key Technologies

- **Frontend**: Vanilla JavaScript (ES6+)
- **Backend**: Node.js, Express, ws (WebSocket library)
- **Protocol**: WebSocket for binary streaming
- **Format**: WebM container, VP9/VP8 codec
- **Architecture**: Manifest V3 service worker

### Future Enhancements

- Cloud storage integration
- Multiple quality presets
- Recording scheduling
- Annotation features
- Live streaming capabilities
- Multi-tab recording
- Screen + webcam combination

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📧 Support

For issues, questions, or contributions, please refer to the project documentation or contact the development team.

---

**Note**: This is an internship project for Cosight. For production deployment, update security settings, CORS origins, and server URLs accordingly.
