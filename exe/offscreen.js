let mediaRecorder = null;
let currentFilename = null;
let recordingId = null;
let ws = null; // WebSocket connection

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startCapture") {
    startCapture(message.streamId, message.filename, sendResponse);
    return true; // Keep channel open for async response
  } else if (message.action === "stopCapture") {
    stopCapture(sendResponse);
    return true; // Keep channel open for async response
  } else if (message.action === "ping") {
    // Keep-alive ping from background script
    sendResponse({ alive: true });
    return false;
  }
});

async function startCapture(streamId, filename, sendResponse) {
  try {
    currentFilename = filename;

    // Connect to WebSocket server
    const wsUrl = CONFIG.SERVER_URL.replace("http://", "ws://").replace(
      "https://",
      "wss://"
    );
    ws = new WebSocket(wsUrl);

    // Wait for WebSocket connection
    await new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log("🔌 WebSocket connected");
        resolve();
      };
      ws.onerror = (error) => {
        console.error("❌ WebSocket connection error:", error);
        reject(new Error("Failed to connect to server"));
      };
    });

    // Handle WebSocket messages
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "started":
          recordingId = data.recordingId;
          currentFilename = data.filename;
          console.log(`🎬 Recording session started: ${recordingId}`);
          break;

        case "chunk_ack":
          // Optional: log progress every 10 chunks
          if (data.chunkNumber % 10 === 0) {
            console.log(
              `📤 ${data.chunkNumber} chunks sent - ${(
                data.totalSize /
                1024 /
                1024
              ).toFixed(2)} MB`
            );
          }
          break;

        case "stopped":
          console.log("🛑 Recording stopped on server");
          console.log(`   File: ${data.filename}`);
          console.log(`   Duration: ${data.duration}s`);
          console.log(
            `   Total size: ${(data.totalSize / 1024 / 1024).toFixed(2)} MB`
          );
          console.log(`   Chunks: ${data.chunkCount}`);
          break;

        case "error":
          console.error("❌ Server error:", data.message);
          break;
      }
    };

    // Send start command
    ws.send(JSON.stringify({ type: "start" }));

    // Wait a bit for server to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get the media stream using the streamId
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });

    // Create MediaRecorder with optimized settings for streaming
    const options = {
      mimeType: CONFIG.RECORDING.mimeType,
      videoBitsPerSecond: CONFIG.RECORDING.videoBitsPerSecond,
    };

    // Fallback to vp8 if vp9 is not supported
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = "video/webm; codecs=vp8";
    }

    mediaRecorder = new MediaRecorder(stream, options);

    // Stream chunks to server via WebSocket (ultra efficient!)
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        try {
          // Convert Blob to ArrayBuffer and send via WebSocket
          const arrayBuffer = await event.data.arrayBuffer();

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(arrayBuffer);
            // Chunk is sent - no memory accumulation!
            // No HTTP overhead, just pure binary data over persistent connection
          } else {
            console.error("WebSocket not ready");
          }
        } catch (error) {
          console.error("Error sending chunk:", error);
        }
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop all tracks
      stream.getTracks().forEach((track) => track.stop());
      console.log("🎬 Media recorder stopped");

      // Wait a moment for final chunks to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));
    };

    // Request data at configured interval for optimal streaming
    // If chunkInterval is 0 or undefined, use natural chunking (no timer)
    const chunkInterval = CONFIG.RECORDING.chunkInterval || undefined;
    mediaRecorder.start(chunkInterval);

    if (chunkInterval) {
      console.log(
        `✅ Recording started with WebSocket streaming (${chunkInterval}ms chunks)`
      );
    } else {
      console.log(
        "✅ Recording started with WebSocket streaming (natural chunking)"
      );
    }
    console.log("   - Single persistent connection");
    console.log("   - Zero HTTP overhead per chunk");
    console.log("   - Maximum efficiency");

    if (sendResponse) sendResponse({ success: true });
  } catch (error) {
    console.error("❌ Error starting capture:", error);

    // Clean up WebSocket on error
    if (ws) {
      ws.close();
      ws = null;
    }

    chrome.runtime.sendMessage({ action: "recordingStopped" });
    if (sendResponse) sendResponse({ success: false, error: error.message });
  }
}

async function stopCapture(sendResponse) {
  try {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      sendResponse({ success: false, error: "No active recording" });
      return;
    }

    // Set up promise to wait for MediaRecorder to fully stop and final chunk to send
    const stopCompletePromise = new Promise((resolve) => {
      const originalOnStop = mediaRecorder.onstop;
      mediaRecorder.onstop = async () => {
        if (originalOnStop) await originalOnStop();
        resolve();
      };
    });

    // Stop the MediaRecorder
    mediaRecorder.stop();

    // Wait for MediaRecorder to finish and final chunk to be sent
    await stopCompletePromise;

    // Give extra time to ensure WebSocket sends the final chunk
    // With natural chunking, final chunk can be larger
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("📦 All chunks sent, sending stop command...");

    // Send stop command via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Set up one-time listener for stop response
      const stopPromise = new Promise((resolve, reject) => {
        const originalOnMessage = ws.onmessage;

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);

          if (data.type === "stopped") {
            ws.onmessage = originalOnMessage; // Restore original handler
            resolve(data);
          } else if (data.type === "error") {
            ws.onmessage = originalOnMessage;
            reject(new Error(data.message));
          } else {
            // Pass through other messages to original handler
            if (originalOnMessage) originalOnMessage(event);
          }
        };

        // Timeout after 10 seconds (longer for natural chunking with large final chunks)
        setTimeout(() => {
          ws.onmessage = originalOnMessage;
          reject(new Error("Stop command timeout"));
        }, 10000);
      });

      // Send stop command
      ws.send(JSON.stringify({ type: "stop" }));

      // Wait for response
      const stopData = await stopPromise;

      // Download the recording from server
      const downloadUrl = `${CONFIG.SERVER_URL}${stopData.downloadUrl}`;

      // Start download and wait for it to begin
      await new Promise((resolve, reject) => {
        chrome.downloads.download(
          {
            url: downloadUrl,
            filename: stopData.filename,
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error("Download error:", chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              console.log("⬇️ Downloading from server:", downloadId);
              resolve();
            }
          }
        );
      });

      // Wait a bit to ensure download starts
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Close WebSocket connection AFTER download starts
      if (ws) {
        ws.close();
        ws = null;
      }

      // Notify background that recording stopped
      chrome.runtime.sendMessage({ action: "recordingStopped" });

      // Clear state
      recordingId = null;
      currentFilename = null;
      mediaRecorder = null;

      sendResponse({ success: true, filename: stopData.filename });
    } else {
      throw new Error("WebSocket not connected");
    }
  } catch (error) {
    console.error("❌ Error stopping recording:", error);

    // Even if there's an error (like timeout), the file is likely saved
    // Try to provide a helpful message
    const isTimeout = error.message.includes("timeout");

    // Clean up
    if (ws) {
      ws.close();
      ws = null;
    }

    chrome.runtime.sendMessage({ action: "recordingStopped" });

    // Clear state even on error
    recordingId = null;
    currentFilename = null;
    mediaRecorder = null;

    if (isTimeout) {
      // Timeout likely means server is processing large final chunk
      // File is probably saved, just server response was slow
      console.warn(
        "⚠️ Stop command timed out, but recording may be saved in backend/recordings/"
      );
      sendResponse({
        success: false,
        error:
          "Stop response timeout - Check backend/recordings/ folder for file",
        isTimeout: true,
      });
    } else {
      sendResponse({ success: false, error: error.message });
    }
  }
}
