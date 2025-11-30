const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const http = require("http");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// Enable CORS for extension
app.use(
  cors({
    origin: "*", // In production, specify your extension ID
    methods: ["GET", "POST", "DELETE"],
  })
);

// Create recordings directory if it doesn't exist
const RECORDINGS_DIR = path.join(__dirname, "recordings");
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// Store active recording sessions
const activeRecordings = new Map();

// Start new recording session
app.post("/api/recording/start", (req, res) => {
  const recordingId = uuidv4();
  const filename = `recording-${recordingId}.webm`;
  const filepath = path.join(RECORDINGS_DIR, filename);

  // Create write stream for this recording
  const writeStream = fs.createWriteStream(filepath);

  activeRecordings.set(recordingId, {
    filename,
    filepath,
    writeStream,
    startTime: Date.now(),
    chunkCount: 0,
    totalSize: 0,
  });

  console.log(`📹 Started recording: ${recordingId}`);

  res.json({
    success: true,
    recordingId,
    filename,
  });
});

// Upload chunk
app.post(
  "/api/recording/:recordingId/chunk",
  express.raw({ type: "application/octet-stream", limit: "50mb" }),
  (req, res) => {
    const { recordingId } = req.params;
    const recording = activeRecordings.get(recordingId);

    if (!recording) {
      return res
        .status(404)
        .json({ success: false, error: "Recording not found" });
    }

    try {
      const chunk = req.body;

      // Write chunk to disk immediately
      recording.writeStream.write(chunk, (err) => {
        if (err) {
          console.error(`❌ Error writing chunk for ${recordingId}:`, err);
          return res
            .status(500)
            .json({ success: false, error: "Failed to write chunk" });
        }

        recording.chunkCount++;
        recording.totalSize += chunk.length;

        console.log(
          `✅ Chunk ${recording.chunkCount} written for ${recordingId} (${(
            chunk.length / 1024
          ).toFixed(2)} KB) - Total: ${(
            recording.totalSize /
            1024 /
            1024
          ).toFixed(2)} MB`
        );

        res.json({
          success: true,
          chunkNumber: recording.chunkCount,
          chunkSize: chunk.length,
          totalSize: recording.totalSize,
        });
      });
    } catch (error) {
      console.error(`❌ Error processing chunk for ${recordingId}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Stop recording
app.post("/api/recording/:recordingId/stop", (req, res) => {
  const { recordingId } = req.params;
  const recording = activeRecordings.get(recordingId);

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, error: "Recording not found" });
  }

  // Close the write stream
  recording.writeStream.end(() => {
    const duration = ((Date.now() - recording.startTime) / 1000).toFixed(2);

    console.log(`🛑 Stopped recording: ${recordingId}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Chunks: ${recording.chunkCount}`);
    console.log(
      `   Size: ${(recording.totalSize / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(`   File: ${recording.filename}`);

    // Keep recording info for download, but mark as completed
    recording.completed = true;

    res.json({
      success: true,
      recordingId,
      filename: recording.filename,
      duration,
      totalSize: recording.totalSize,
      chunkCount: recording.chunkCount,
      downloadUrl: `/api/recording/${recordingId}/download`,
    });
  });
});

// Download recording
app.get("/api/recording/:recordingId/download", (req, res) => {
  const { recordingId } = req.params;
  const recording = activeRecordings.get(recordingId);

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, error: "Recording not found" });
  }

  if (!recording.completed) {
    return res
      .status(400)
      .json({ success: false, error: "Recording not yet completed" });
  }

  // Check if file exists
  if (!fs.existsSync(recording.filepath)) {
    return res
      .status(404)
      .json({ success: false, error: "Recording file not found" });
  }

  console.log(`⬇️ Downloading: ${recording.filename}`);

  res.download(recording.filepath, recording.filename, (err) => {
    if (err) {
      console.error("Download error:", err);
    }
  });
});

// Delete recording (cleanup)
app.delete("/api/recording/:recordingId", (req, res) => {
  const { recordingId } = req.params;
  const recording = activeRecordings.get(recordingId);

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, error: "Recording not found" });
  }

  // Close stream if still open
  if (!recording.completed) {
    recording.writeStream.end();
  }

  // Delete file
  if (fs.existsSync(recording.filepath)) {
    fs.unlinkSync(recording.filepath);
    console.log(`🗑️ Deleted recording: ${recording.filename}`);
  }

  activeRecordings.delete(recordingId);

  res.json({ success: true });
});

// Get all recordings
app.get("/api/recordings", (req, res) => {
  const recordings = Array.from(activeRecordings.entries()).map(
    ([id, rec]) => ({
      recordingId: id,
      filename: rec.filename,
      startTime: rec.startTime,
      chunkCount: rec.chunkCount,
      totalSize: rec.totalSize,
      completed: rec.completed || false,
    })
  );

  res.json({ success: true, recordings });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "running",
    activeRecordings: activeRecordings.size,
  });
});

// WebSocket connection handler for streaming
wss.on("connection", (ws) => {
  console.log("🔌 WebSocket client connected");
  let currentRecording = null;

  ws.on("message", (message) => {
    try {
      // Check if it's a command (JSON) or binary data (chunk)
      if (message instanceof Buffer && currentRecording) {
        // Binary data - this is a video chunk
        const recording = activeRecordings.get(currentRecording);

        if (!recording) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Recording not found",
            })
          );
          return;
        }

        // Write chunk to disk immediately
        recording.writeStream.write(message, (err) => {
          if (err) {
            console.error(`❌ Error writing chunk:`, err);
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Failed to write chunk",
              })
            );
          } else {
            recording.chunkCount++;
            recording.totalSize += message.length;

            // Send acknowledgment (optional, for monitoring)
            ws.send(
              JSON.stringify({
                type: "chunk_ack",
                chunkNumber: recording.chunkCount,
                totalSize: recording.totalSize,
              })
            );

            if (recording.chunkCount % 10 === 0) {
              console.log(
                `✅ Chunk ${recording.chunkCount} - Total: ${(
                  recording.totalSize /
                  1024 /
                  1024
                ).toFixed(2)} MB`
              );
            }
          }
        });
      } else {
        // JSON command
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case "start":
            const recordingId = uuidv4();
            const filename = `recording-${recordingId}.webm`;
            const filepath = path.join(RECORDINGS_DIR, filename);
            const writeStream = fs.createWriteStream(filepath);

            activeRecordings.set(recordingId, {
              filename,
              filepath,
              writeStream,
              startTime: Date.now(),
              chunkCount: 0,
              totalSize: 0,
            });

            currentRecording = recordingId;
            console.log(`📹 Started recording via WebSocket: ${recordingId}`);

            ws.send(
              JSON.stringify({
                type: "started",
                recordingId,
                filename,
              })
            );
            break;

          case "stop":
            if (currentRecording) {
              const recording = activeRecordings.get(currentRecording);

              if (recording) {
                recording.writeStream.end(() => {
                  const duration = (
                    (Date.now() - recording.startTime) /
                    1000
                  ).toFixed(2);

                  console.log(`🛑 Stopped recording: ${currentRecording}`);
                  console.log(`   Duration: ${duration}s`);
                  console.log(`   Chunks: ${recording.chunkCount}`);
                  console.log(
                    `   Size: ${(recording.totalSize / 1024 / 1024).toFixed(
                      2
                    )} MB`
                  );

                  recording.completed = true;

                  ws.send(
                    JSON.stringify({
                      type: "stopped",
                      recordingId: currentRecording,
                      filename: recording.filename,
                      duration,
                      totalSize: recording.totalSize,
                      chunkCount: recording.chunkCount,
                      downloadUrl: `/api/recording/${currentRecording}/download`,
                    })
                  );

                  currentRecording = null;
                });
              }
            }
            break;

          default:
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Unknown command",
              })
            );
        }
      }
    } catch (error) {
      console.error("❌ WebSocket error:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: error.message,
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket client disconnected");

    // Clean up if recording was still active
    if (currentRecording) {
      const recording = activeRecordings.get(currentRecording);
      if (recording && !recording.completed) {
        recording.writeStream.end();
        console.log(`⚠️ Force-closed recording: ${currentRecording}`);
      }
    }
  });

  ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Tab Recorder Backend running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`📁 Recordings directory: ${RECORDINGS_DIR}`);
});

// Cleanup on server shutdown
process.on("SIGINT", () => {
  console.log("\n⏹️ Shutting down server...");

  // Close all active write streams
  activeRecordings.forEach((recording, id) => {
    if (!recording.completed) {
      recording.writeStream.end();
      console.log(`Closed stream for ${id}`);
    }
  });

  process.exit(0);
});
