let isRecording = false;
let currentStreamId = null;
let autoRecordTabId = null; // Track which tab is being auto-recorded

// Load config
importScripts("config.js");

// Log on service worker start
console.log("🚀 Tab Recorder service worker started");
console.log("📋 Auto-record enabled:", CONFIG.AUTO_RECORD.enabled);
console.log("📋 Auto-record patterns:", CONFIG.AUTO_RECORD.urlPatterns);

// Generate UUID v4
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Check if URL matches auto-record patterns
function shouldAutoRecord(url) {
  if (!CONFIG.AUTO_RECORD.enabled) return false;

  return CONFIG.AUTO_RECORD.urlPatterns.some((pattern) => {
    // Convert wildcard pattern to regex
    const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(url);
  });
}

// Listen for navigation events (auto-record)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only handle main frame (not iframes)
  if (details.frameId !== 0) return;

  const url = details.url;
  console.log(`🌐 Navigation completed: ${url}`);

  if (shouldAutoRecord(url)) {
    console.log(`✅ Auto-record URL matched: ${url}`);

    // Don't start if already recording
    if (isRecording) {
      console.log("⚠️ Already recording, skipping auto-start");
      return;
    }

    // Wait a bit for page to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Show notification with button to start recording
    autoRecordTabId = details.tabId;
    chrome.notifications?.create(
      {
        type: "basic",
        iconUrl: "icons/icon48.svg",
        title: "Tab Recorder",
        message: "Do you want to start recording this tab?",
        buttons: [{ title: "Start Recording" }],
        requireInteraction: true,
        priority: 2,
      },
      (notificationId) => {
        // Store the tabId for this notification
        if (!window._tabRecorderNotifMap) window._tabRecorderNotifMap = {};
        window._tabRecorderNotifMap[notificationId] = details.tabId;
      }
    );
  } else if (
    CONFIG.AUTO_RECORD.stopOnNavigateAway &&
    isRecording &&
    autoRecordTabId === details.tabId &&
    !shouldAutoRecord(url)
  ) {
    // Navigated away from auto-record URL to a non-matching URL, stop recording
    console.log("🛑 Navigated away from auto-record URL, stopping...");
    stopRecording((response) => {
      autoRecordTabId = null;
      if (response.success) {
        console.log("✅ Auto-recording stopped");
      }
    });
  }
});

// Listen for notification button clicks
chrome.notifications?.onButtonClicked.addListener(
  (notificationId, buttonIndex) => {
    if (
      buttonIndex === 0 &&
      window._tabRecorderNotifMap &&
      window._tabRecorderNotifMap[notificationId] !== undefined
    ) {
      const tabId = window._tabRecorderNotifMap[notificationId];
      startRecording((response) => {
        if (response.success) {
          console.log("🎬 Recording started from notification!");
          chrome.notifications?.clear(notificationId);
          chrome.notifications?.create({
            type: "basic",
            iconUrl: "icons/icon48.svg",
            title: "Recording Started",
            message: "Recording started for this tab.",
          });
        } else {
          console.error(
            "❌ Recording failed from notification:",
            response.error
          );
        }
      }, tabId);
      delete window._tabRecorderNotifMap[notificationId];
    }
  }
);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleRecording") {
    if (isRecording) {
      stopRecording(sendResponse);
    } else {
      startRecording(sendResponse);
    }
    return true; // Keep channel open for async response
  }

  if (message.action === "getState") {
    console.log("📊 State requested:", { isRecording });
    sendResponse({ isRecording });
    return false;
  }

  if (message.action === "recordingStopped") {
    console.log("🛑 Recording stopped notification received");
    isRecording = false;
    currentStreamId = null;
    stopKeepAlive();
    return false;
  }
});

async function startRecording(sendResponse, tabId = null) {
  try {
    // Get the tab (either specified or active)
    let tab;
    if (tabId) {
      tab = await chrome.tabs.get(tabId);
    } else {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tab = tabs[0];
    }

    if (!tab) {
      if (sendResponse) {
        sendResponse({ success: false, error: "No active tab found" });
      }
      return;
    }

    // Request tab capture
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
    });

    if (!streamId) {
      if (sendResponse) {
        sendResponse({ success: false, error: "Could not get stream" });
      }
      return;
    }

    currentStreamId = streamId;
    isRecording = true;

    // Create offscreen document for recording
    await ensureOffscreenDocument();

    // Start keep-alive to prevent offscreen document from closing
    startKeepAlive();

    // Send message to offscreen document to start recording
    const filename = `recording-${generateUUID()}.webm`;
    chrome.runtime.sendMessage({
      action: "startCapture",
      streamId: streamId,
      filename: filename,
    });

    if (sendResponse) {
      sendResponse({ success: true, isRecording: true });
    }
  } catch (error) {
    console.error("Error starting recording:", error);
    isRecording = false;
    if (sendResponse) {
      sendResponse({ success: false, error: error.message });
    }
  }
}

async function stopRecording(sendResponse) {
  try {
    // Stop keep-alive
    stopKeepAlive();

    // Send message to offscreen document to stop recording
    chrome.runtime.sendMessage(
      {
        action: "stopCapture",
      },
      (response) => {
        isRecording = false;
        currentStreamId = null;

        if (response && response.success) {
          sendResponse({
            success: true,
            isRecording: false,
            filename: response.filename,
          });
        } else {
          sendResponse({ success: false, error: "Failed to stop recording" });
        }
      }
    );
  } catch (error) {
    console.error("Error stopping recording:", error);
    isRecording = false;
    stopKeepAlive();
    sendResponse({ success: false, error: error.message });
  }
}

async function ensureOffscreenDocument() {
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });

  if (existingContexts.length > 0) {
    console.log("Offscreen document already exists");
    return;
  }

  // Create offscreen document
  console.log("Creating offscreen document...");
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Recording tab audio and video",
  });
  console.log("Offscreen document created");
}

// Keep offscreen document alive during recording
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return;

  // Ping the offscreen document every 20 seconds to keep it alive
  keepAliveInterval = setInterval(() => {
    if (isRecording) {
      chrome.runtime.sendMessage({ action: "ping" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Keep-alive ping failed:", chrome.runtime.lastError);
        }
      });
    }
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}
