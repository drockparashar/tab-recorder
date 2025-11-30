const recordButton = document.getElementById("recordButton");
const statusDiv = document.getElementById("status");

// Check recording state when popup opens
chrome.runtime.sendMessage({ action: "getState" }, (response) => {
  if (chrome.runtime.lastError) {
    console.error("Error getting state:", chrome.runtime.lastError);
    return;
  }

  if (response && response.isRecording) {
    updateUI(true);
    console.log("Recording is active");
  } else {
    updateUI(false);
    console.log("No active recording");
  }
});

recordButton.addEventListener("click", async () => {
  // Disable button during operation
  recordButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "toggleRecording",
    });

    if (response && response.success) {
      updateUI(response.isRecording);

      if (!response.isRecording && response.filename) {
        statusDiv.textContent = `Recording saved!`;
        // Reset after 3 seconds
        setTimeout(() => {
          statusDiv.textContent = "Ready to record";
        }, 3000);
      }
    } else {
      const errorMsg = response?.error || "Error occurred";

      // Show friendlier message for timeout
      if (response?.isTimeout) {
        statusDiv.textContent = "Recording likely saved - check downloads";
        updateUI(false); // Reset UI anyway
      } else {
        statusDiv.textContent = errorMsg;
      }

      console.error("Recording error:", errorMsg, response);
    }
  } catch (error) {
    console.error("Error:", error);
    statusDiv.textContent = "Error: " + error.message;
  } finally {
    // Re-enable button
    recordButton.disabled = false;
  }
});

function updateUI(isRecording) {
  if (isRecording) {
    recordButton.textContent = "Stop Recording";
    recordButton.classList.add("recording");
    statusDiv.textContent = "Recording in progress...";
  } else {
    recordButton.textContent = "Start Recording";
    recordButton.classList.remove("recording");
    statusDiv.textContent = "Ready to record";
  }
}
