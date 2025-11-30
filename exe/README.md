# Tab Recorder Chrome Extension

A simple browser extension that records your active tab with a single click, following Manifest V3 architecture.

## Features

- **One-click recording**: Start and stop recording with a single button click
- **WebSocket streaming**: Ultra-efficient binary streaming via persistent WebSocket connection
- **True streaming to disk**: Chunks are streamed to server immediately, not stored in browser memory
- **Memory efficient**: Browser uses only ~1-2 MB of RAM regardless of recording length
- **Zero overhead**: No HTTP request overhead per chunk - just pure binary data
- **Auto-naming**: Each recording is automatically named with a unique UUID
- **Auto-save**: Recordings are saved directly to your default Downloads folder
- **Manifest V3**: Built with the latest extension architecture
- **Permissions requested once**: All permissions are requested during installation

## Installation

### Backend Server Setup (Required)

1. Navigate to the backend directory:

```bash
cd backend
npm install
```

2. Start the server:

```bash
npm start
```

The server will run on `http://localhost:3000`

See [backend/README.md](backend/README.md) for detailed server documentation.

### Extension Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `extension` folder
5. The extension will appear in your toolbar

### Usage

1. Click the extension icon in your toolbar
2. Click "Start Recording" to begin recording the active tab
3. Click "Stop Recording" to end the recording
4. Your recording will be automatically saved to your Downloads folder with a unique UUID filename (e.g., `recording-a1b2c3d4-e5f6-7890-abcd-ef1234567890.webm`)

## Architecture Diagram

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
│                                    Every 1 second                 │
│                                           │                       │
│                                           │ ~250 KB chunk         │
│                                           │                       │
│                                           ▼                       │
└───────────────────────────────────────────┼───────────────────────┘
                                            │
                                            │ HTTP POST
                                            │ (immediately sent)
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Server (Node.js)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  POST /api/recording/:id/chunk                                   │
│           │                                                       │
│           ▼                                                       │
│    WriteStream.write()                                           │
│           │                                                       │
│           ▼                                                       │
│    ┌──────────────┐                                              │
│    │ Disk Storage │  recording-uuid.webm                         │
│    │ (streaming)  │  ├─ Chunk 1 (appended)                       │
│    └──────────────┘  ├─ Chunk 2 (appended)                       │
│                      ├─ Chunk 3 (appended)                       │
│                      └─ ...                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Memory Usage:
- Browser: ~1-2 MB (constant)
- Server: ~1-2 MB per recording (streaming)
- Disk: Full recording size
```

## Technical Details

### Architecture

**Frontend (Extension):**

- **manifest.json**: MV3 manifest with required permissions
- **background.js**: Service worker handling recording state and offscreen document management
- **popup.html/css/js**: User interface for the extension
- **offscreen.html/js**: Offscreen document handling MediaRecorder API and server streaming
- **icons/**: Extension icons in SVG format

**Backend (Node.js Server):**

- **server.js**: Express server with REST API for chunk streaming
- **recordings/**: Directory where recordings are saved
- See [backend/README.md](backend/README.md) for API documentation

### Memory Efficiency & Streaming

The extension uses **true server-side streaming** for maximum memory efficiency:

**Client Side (Browser):**

- MediaRecorder generates chunks every 1 second
- Each chunk is immediately sent to backend server via HTTP POST
- Chunks are discarded from browser memory after sending
- **Constant RAM usage: ~1-2 MB** regardless of recording length
- No memory accumulation - can record for hours without issues

**Server Side (Node.js):**

- Receives chunks via REST API
- Streams directly to disk using Node.js WriteStream
- No server memory accumulation
- Recordings saved in `backend/recordings/` directory

**Benefits:**

- ✅ Record unlimited length videos without browser memory issues
- ✅ Minimal CPU overhead on client
- ✅ Recording survives even if browser crashes (saved on server)
- ✅ Bitrate optimized at 2.5 Mbps for quality/performance balance

### Permissions

- `tabCapture`: Capture audio and video from tabs
- `activeTab`: Access the currently active tab
- `offscreen`: Create offscreen documents for recording (MV3 requirement)
- `downloads`: Save recordings to the Downloads folder

### File Format

Recordings are saved as `.webm` files using VP9 codec (or VP8 as fallback) at 2.5 Mbps bitrate.

## Converting SVG Icons to PNG

The icons are currently in SVG format. To convert them to PNG:

**Using an online tool:**

- Visit a service like https://cloudconvert.com/svg-to-png
- Upload each SVG file
- Download the PNG versions

**Using command line (if you have ImageMagick installed):**

```bash
magick icons/icon16.svg icons/icon16.png
magick icons/icon48.svg icons/icon48.png
magick icons/icon128.svg icons/icon128.png
```

**Using Node.js (if you have sharp installed):**

```javascript
const sharp = require("sharp");
sharp("icons/icon16.svg").toFile("icons/icon16.png");
sharp("icons/icon48.svg").toFile("icons/icon48.png");
sharp("icons/icon128.svg").toFile("icons/icon128.png");
```

## Browser Compatibility

- Chrome/Chromium-based browsers with Manifest V3 support
- Requires Chrome version 109 or later (for offscreen API)

## Troubleshooting

### Recording doesn't start

- Make sure you've granted all permissions during installation
- Check that you're on a recordable tab (some system pages like chrome:// cannot be recorded)
- Check the browser console for any errors

### File not saving

- Check your Downloads folder permissions
- Ensure you have enough disk space
- Check the browser console for download errors

## Project Structure

```
extension/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker
├── popup.html            # Extension popup UI
├── popup.css             # Popup styling
├── popup.js              # Popup logic
├── offscreen.html        # Offscreen document
├── offscreen.js          # Recording logic
└── icons/                # Extension icons
    ├── icon16.svg
    ├── icon48.svg
    └── icon128.svg
```

## License

MIT License - Feel free to use and modify as needed.
