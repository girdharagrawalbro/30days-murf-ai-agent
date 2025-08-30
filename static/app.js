document.addEventListener("DOMContentLoaded", function () {
  // Global variables
  let sessionId = getSessionIdFromUrl() || generateSessionId();
  let webSearchEnabled = false;

  // DOM elements
  const toggleChatHistoryBtn = document.getElementById("toggleLogs");
  const toggleConfigBtn = document.getElementById("toggleConfig");
  const personaSelector = document.getElementById("personaslector");
  const configModal = document.getElementById("configModal");
  const closeConfigModalBtn = document.getElementById("closeConfigModal");
  const apiConfigForm = document.getElementById("apiConfigForm");
  const cancelConfigBtn = document.getElementById("cancelConfig");
  const clearConfigBtn = document.getElementById("clearConfig");
  const configStatus = document.getElementById("configStatus");

  // Audio streaming variables
  let audioStreamSocket;
  let audioStreamRecorder;
  let audioStreamStream;
  let isStreaming = false;

  // Audio playback variables
  let audioContext = null;
  let audioChunks = [];
  let playheadTime = 0;
  let isPlaying = false;
  let wavHeaderSet = true;
  const SAMPLE_RATE = 44100;

  const audioStreamBtn = document.getElementById("audioStreamBtn");
  const audioStreamStatus = document.getElementById("audioStreamStatus");
  const streamingStatusLog = document.getElementById("streamingStatusLog");
  const connectionStatus = document.getElementById("connectionStatus");
  const streamingSessionId = document.getElementById("streamingSessionId");
  const chatHistoryList = document.getElementById("chatHistoryList");

  // Initialize session
  initializeSession();

  // Event listeners
  if (toggleChatHistoryBtn) {
    toggleChatHistoryBtn.addEventListener("click", toggleLogs);
  }

  // Conversation history elements
  const toggleConversationBtn = document.getElementById("toggleCnversation");
  const conversationHistoryPopup = document.getElementById("conversationHistoryPopup");
  const closeConversationPopup = document.getElementById("closeConversationPopup");
  const refreshConversationsBtn = document.getElementById("refreshConversations");
  const conversationList = document.getElementById("conversationList");
  const toggleClearHistory = document.getElementById("toggleClear");

  // Web search checkbox handling
  const webSearchBtn = document.getElementById("webSearchBtn");
  const webSearchCheckbox = document.getElementById("webSearchCheckbox");

  if (webSearchBtn && webSearchCheckbox) {
    webSearchBtn.addEventListener("click", () => {
      webSearchCheckbox.checked = !webSearchCheckbox.checked;
      webSearchEnabled = webSearchCheckbox.checked;
      webSearchBtn.classList.toggle("active", webSearchCheckbox.checked);
      updateStreamingStatus(`Web search ${webSearchEnabled ? 'enabled' : 'disabled'}`, "info");
    });

    webSearchCheckbox.addEventListener("change", (event) => {
      webSearchEnabled = event.target.checked;
      webSearchBtn.classList.toggle("active", webSearchEnabled);
    });
  }

  // Function to toggle conversation history popup
  function toggleConversationHistory() {
    if (conversationHistoryPopup.style.display === "none" || conversationHistoryPopup.style.display === "") {
      loadConversationHistory();
      conversationHistoryPopup.style.display = "block";
    } else {
      conversationHistoryPopup.style.display = "none";
    }
  }

  // Function to close conversation history popup
  function closeConversationHistory() {
    conversationHistoryPopup.style.display = "none";
  }

  // Function to load conversation history
  async function loadConversationHistory() {
    try {
      const response = await fetch(`/agent/chat/all`);
      const data = await response.json();
      if (data.success && data.chat_histories.length > 0) {
        displayConversationList(data.chat_histories);
      } else {
        conversationList.innerHTML = '<p class="no-history">No conversations found.</p>';
      }
    } catch (error) {
      console.error("Failed to load conversation history:", error);
      conversationList.innerHTML = '<p class="no-history">Error loading conversations.</p>';
    }
  }

  // Function to display conversation list
  function displayConversationList(conversations) {
    conversationList.innerHTML = ""; // Clear existing list
    
    if (!conversations || conversations.length === 0) {
      conversationList.innerHTML = '<p class="no-history">No conversations found.</p>';
      return;
    }
    
    conversations.forEach(conversation => {
      const listItem = document.createElement("div");
      listItem.className = "conversation-list-item";
      listItem.style.borderBottom = "1px solid #ccc";
      listItem.style.padding = "8px 0";
      listItem.style.cursor = "pointer";

      // First line: message
      const messageDiv = document.createElement("div");
      messageDiv.textContent = conversation.messages && conversation.messages.length > 0 
        ? conversation.messages[0].content 
        : "Empty conversation";

      // Second line: last updated
      const updatedDiv = document.createElement("div");
      updatedDiv.style.fontSize = "12px";
      updatedDiv.style.color = "#666";
      updatedDiv.textContent = conversation.last_updated
        ? new Date(conversation.last_updated).toLocaleString()
        : "N/A";

      // Append both lines
      listItem.appendChild(messageDiv);
      listItem.appendChild(updatedDiv);

      listItem.onclick = () => loadConversationMessages(conversation.session_id);

      conversationList.appendChild(listItem);
    });
  }

  // Function to load messages for a selected conversation
  async function loadConversationMessages(sessionId) {
    window.location.href = `/?session_id=${sessionId}`;
  }

  async function toggleClearHistoryfunction() {
    if (confirm("Are you sure you want to clear all conversation history? This action cannot be undone.")) {
      const session_id = getSessionIdFromUrl();
      try {
        const response = await fetch(`/agent/chat/${session_id}/history`, {
          method: "DELETE",
        });
        const data = await response.json();
        if (data.success) {
          alert("All conversation history cleared.");
          window.location.reload();
        } else {
          alert("Failed to clear conversation history.");
        }
      } catch (error) {
        console.error("Error clearing conversation history:", error);
        alert("An error occurred while clearing conversation history.");
      }
    }
  }

  if (toggleConversationBtn) {
    toggleConversationBtn.addEventListener("click", toggleConversationHistory);
  }

  if (toggleClearHistory) {
    toggleClearHistory.addEventListener("click", toggleClearHistoryfunction);
  }

  if (closeConversationPopup) {
    closeConversationPopup.addEventListener("click", closeConversationHistory);
  }

  if (refreshConversationsBtn) {
    refreshConversationsBtn.addEventListener("click", loadConversationHistory);
  }

  // Initialize streaming mode
  initializeStreamingMode();

  // Initialize configuration modal
  initializeConfigModal();

  // Initialize persona selector
  initializePersonaSelector();

  // Function to perform web search and display results
  async function performWebSearch(query) {
    try {
      console.log("Performing web search for:", query);
      
      const response = await fetch('/api/web-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log("Web search results:", data.results);
        displayWebSearchResults(data.results, query);
        return data.results;
      } else {
        console.error("Web search failed:", data.error_message);
        updateStreamingStatus(`Web search failed: ${data.error_message}`, "error");
        return [];
      }
    } catch (error) {
      console.error("Error performing web search:", error);
      updateStreamingStatus("Error performing web search", "error");
      return [];
    }
  }

  // Function to display web search results in the UI
  function displayWebSearchResults(results, query) {
    const streamingStatusLog = document.getElementById("streamingStatusLog");
    if (!streamingStatusLog) return;

    // Remove any existing web search results
    const existingResults = streamingStatusLog.querySelector(".web-search-results");
    if (existingResults) {
      existingResults.remove();
    }

    if (!results || results.length === 0) {
      updateStreamingStatus(`No web search results found for: "${query}"`, "warning");
      return;
    }

    // Create a container for web search results
    const resultsContainer = document.createElement("div");
    resultsContainer.className = "web-search-results";
    resultsContainer.style.marginTop = "10px";
    resultsContainer.style.padding = "10px";
    resultsContainer.style.backgroundColor = "#f8f9fa";
    resultsContainer.style.borderRadius = "8px";
    resultsContainer.style.borderLeft = "4px solid #007bff";

    // Add header
    const header = document.createElement("div");
    header.innerHTML = `<strong>🌐 Web Search Results for: "${query}"</strong>`;
    header.style.marginBottom = "10px";
    header.style.color = "#007bff";
    resultsContainer.appendChild(header);

    // Add each result
    results.forEach((result, index) => {
      const resultDiv = document.createElement("div");
      resultDiv.style.marginBottom = "8px";
      resultDiv.style.padding = "8px";
      resultDiv.style.backgroundColor = "white";
      resultDiv.style.borderRadius = "4px";
      resultDiv.style.border = "1px solid #dee2e6";
      
      resultDiv.innerHTML = `
        <div style="font-weight: bold; color: #495057;">${index + 1}. ${result.title || 'No title'}</div>
        <div style="font-size: 12px; color: #6c757d; margin: 4px 0;">${result.snippet || 'No snippet available'}</div>
        <div style="font-size: 11px; color: #007bff;">
          <a href="${result.url || '#'}" target="_blank" style="color: inherit; text-decoration: none;">
            🔗 ${result.url || 'No URL'}
          </a>
        </div>
      `;
      
      resultsContainer.appendChild(resultDiv);
    });

    // Add to streaming status log
    streamingStatusLog.appendChild(resultsContainer);
    streamingStatusLog.scrollTop = streamingStatusLog.scrollHeight;
  }

  function getSessionIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("session_id");
  }

  function generateSessionId() {
    return (
      "session_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now()
    );
  }

  function updateUrlWithSessionId(sessionId) {
    const url = new URL(window.location);
    url.searchParams.set("session_id", sessionId);
    window.history.replaceState({}, "", url);
    const sessionIdElement = document.getElementById("sessionId");
    if (sessionIdElement) {
      sessionIdElement.textContent = sessionId;
    }
  }

  async function initializeSession() {
    updateUrlWithSessionId(sessionId);
    await loadChatHistory();
  }

  function initializeStreamingMode() {
    const audioStreamBtn = document.getElementById("audioStreamBtn");
    if (audioStreamBtn) {
      audioStreamBtn.addEventListener("click", function () {
        const state = this.getAttribute("data-state");
        if (state === "ready") {
          startAudioStreaming();
        } else if (state === "recording") {
          stopAudioStreaming();
        }
      });
    }

    resetStreamingState();
  }

  async function loadChatHistory() {
    try {
      const response = await fetch(`/agent/chat/${sessionId}/history`);
      const data = await response.json();
      if (data.success) {
        displayChatHistory(data.messages);
      } else {
        const chatHistoryList = document.getElementById("chatHistoryList");
        if (chatHistoryList) {
          chatHistoryList.innerHTML = '<p class="no-history">No previous messages in this session. <br> Start your Conversation</p>';
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
      const chatHistoryList = document.getElementById("chatHistoryList");
      if (chatHistoryList) {
        chatHistoryList.innerHTML = '<p class="no-history">Error loading chat history.</p>';
      }
    }
  }

  function displayChatHistory(messages, isNewMessage = false) {
    const chatHistoryList = document.getElementById("chatHistoryList");
    if (!chatHistoryList) return;

    // If it's a new message, don't clear the existing content
    if (!isNewMessage) {
      chatHistoryList.innerHTML = "";
    }

    if (!messages || messages.length === 0) {
      if (!isNewMessage) {
        chatHistoryList.innerHTML = '<p class="no-history">No previous messages in this session. <br> Start your Conversation</p>';
      }
      return;
    }

    // Process messages
    messages.forEach((message, index) => {
      // Check if this message already exists to avoid duplicates
      const existingMessage = document.querySelector(`[data-message-id="${message.id || index}"]`);
      if (existingMessage && !isNewMessage) {
        return; // Skip if already exists and we're not adding a new message
      }

      const messageDiv = document.createElement("div");
      messageDiv.className = `chat-message ${message.role} ${isNewMessage ? 'new' : ''}`;
      messageDiv.setAttribute("data-message-id", message.id || index);

      // Parse markdown content if available
      let messageContent = message.content || "";
      try {
        if (typeof marked !== "undefined") {
          messageContent = marked.parse(message.content);
        }
      } catch (error) {
        console.warn("Markdown parsing error:", error);
      }
      
      messageDiv.innerHTML = `
              <div class="message-header">
                <span class="message-role">${message.role === 'user' ? '👤 You' : '🤖 AI Assistant'}</span>
                <small class="message-time">${new Date(
        message.timestamp || Date.now()
      ).toLocaleString()}</small>
              </div>
              <div class="message-content">${messageContent}</div>
            `;

      // If it's a new message, add it to the bottom and scroll to it
      if (isNewMessage) {
        chatHistoryList.appendChild(messageDiv);

        // Apply syntax highlighting if available
        if (typeof hljs !== "undefined") {
          setTimeout(() => {
            messageDiv.querySelectorAll("pre code").forEach((block) => {
              hljs.highlightElement(block);
            });
          }, 100);
        }

        // Scroll to the new message
        setTimeout(() => {
          messageDiv.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      } else {
        chatHistoryList.appendChild(messageDiv);
      }
    });

    // Apply syntax highlighting to all code blocks if available
    if (typeof hljs !== "undefined" && !isNewMessage) {
      setTimeout(() => {
        chatHistoryList.querySelectorAll("pre code").forEach((block) => {
          hljs.highlightElement(block);
        });
      }, 100);
    }

    // Scroll to bottom if it's not a new message (initial load)
    if (!isNewMessage) {
      setTimeout(() => {
        chatHistoryList.scrollTop = chatHistoryList.scrollHeight;
      }, 100);
    }
  }

  function toggleLogs() {
    if (audioStreamStatus) {
      const isVisible = audioStreamStatus.style.display !== "none";
      audioStreamStatus.style.display = isVisible ? "none" : "block";
    }
  }

  // ==================== AUDIO STREAMING FUNCTIONALITY ====================

  async function startAudioStreaming() {
    try {
      // Reset streaming state and UI
      resetStreamingState();

      updateConnectionStatus("connecting", "Connecting...");

      // Clear any previous transcriptions
      clearPreviousTranscriptions();

      // Connect to WebSocket with session ID
      audioStreamSocket = new WebSocket(`wss://voice-agent-girdhar.onrender.com/ws/audio-stream?session_id=${sessionId}`);

      audioStreamSocket.onopen = function (event) {
        updateConnectionStatus("connected", "Connected");
        updateStreamingStatus("Connected to server", "success");

        // Send session ID to establish the session on the backend
        audioStreamSocket.send(JSON.stringify({
          type: "session_id",
          session_id: sessionId,
          web_search: webSearchEnabled
        }));
      };

      audioStreamSocket.onmessage = function (event) {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "audio_stream_ready") {
            updateStreamingStatus(
              `Ready to stream audio with transcription. Session: ${data.session_id}`,
              "info"
            );
            if (streamingSessionId) {
              streamingSessionId.textContent = `Session: ${data.session_id}`;
            }

            // Ensure the frontend session ID matches the backend
            if (data.session_id !== sessionId) {
              sessionId = data.session_id;
              updateUrlWithSessionId(sessionId);
            }

            if (data.transcription_enabled) {
              updateStreamingStatus("🎙️ Real-time transcription enabled", "success");
            }
            startRecordingForStreaming();
          } else if (data.type === "final_transcript") {
            if (data.text && data.text.trim()) {
              // ✅ replace the last partial with the final transcript
              updateUserMessageInHistory(data.text);
            }
          } else if (data.type === "partial_transcript") {
            if (data.text && data.text.trim()) {
              // ✅ still update the same message in place
              updateUserMessageInHistory(data.text);
            }
          } else if (data.type === "llm_streaming_start") {
            // Add AI response placeholder with dots loader
            addAIResponsePlaceholder();
          } else if (data.type === "llm_streaming_chunk") {
            // Display LLM text chunks as they arrive
            updateAIResponse(data.chunk, data.accumulated_length);
          } else if (data.type === "tts_audio_chunk") {
            // Handle audio base64 chunks from TTS
            handleAudioChunk(data);
          } else if (data.type === "llm_streaming_complete") {
            // Finalize AI response
            finalizeAIResponse(data.complete_response);

            // Reload chat history after conversation is complete
            setTimeout(() => {
              loadChatHistory();
            }, 1000);
          } else if (data.type === "transcription_complete") {
            if (data.text && data.text.trim()) {
              updateStreamingStatus(`✅ COMPLETE TRANSCRIPTION: "${data.text}"`, "success");
            } else {
              updateStreamingStatus("⚠️ No speech detected in recording", "warning");
            }
          } else if (data.type === "transcription_error") {
            updateStreamingStatus("❌ Transcription error: " + data.message, "error");
          } else if (data.type === "llm_streaming_error") {
            updateStreamingStatus(`❌ ${data.message}`, "error");
            removeAIResponsePlaceholder();
          } else if (data.type === "tts_streaming_error") {
            updateStreamingStatus(`❌ ${data.message}`, "error");
          } else if (data.type === "web_search_initiated") {
            updateStreamingStatus("🌐 Performing web search...", "info");
          } else if (data.type === "web_search_complete") {
            updateStreamingStatus("✅ Web search completed", "success");
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };

      audioStreamSocket.onerror = function (error) {
        console.error("WebSocket error:", error);
        updateConnectionStatus("error", "Connection Error");
        updateStreamingStatus("WebSocket connection error", "error");
      };

      audioStreamSocket.onclose = function (event) {
        updateConnectionStatus("disconnected", "Disconnected");
        updateStreamingStatus("Connection closed", "warning");
        resetStreamingState();
      };
    } catch (error) {
      console.error("Error starting audio streaming:", error);
      updateConnectionStatus("error", "Error");
      updateStreamingStatus(
        "Error starting streaming: " + error.message,
        "error"
      );
    }
  }

  // Add user message to chat history
  function addUserMessageToHistory(text) {
    const message = {
      role: 'user',
      content: text,
      timestamp: Date.now()
    };

    // Check if the message already exists to avoid duplicates
    const existingMessage = document.querySelector(`[data-message-id="user-${Date.now()}"]`);
    if (!existingMessage) {
      displayChatHistory([message], true);
    }
  }

  // Update user message in chat history (for partial transcripts)
  function updateUserMessageInHistory(text) {
    let userMessage = document.querySelector('.chat-message.user:last-child');

    if (!userMessage) {
      addUserMessageToHistory(text);
      return;
    }

    const contentDiv = userMessage.querySelector('.message-content');
    if (contentDiv) {
      contentDiv.textContent = text;
    }

    // Scroll to the message
    setTimeout(() => {
      userMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  // Add AI response placeholder with dots loader
  function addAIResponsePlaceholder() {
    const messageDiv = document.createElement("div");
    messageDiv.className = "chat-message assistant";
    messageDiv.setAttribute("data-message-id", "ai-response-placeholder");
    messageDiv.innerHTML = `
              <div class="message-header">
                <span class="message-role">🤖 AI Assistant</span>
                <small class="message-time">${new Date().toLocaleString()}</small>
              </div>
              <div class="message-content">
                <div class="dots-loader">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            `;

    if (chatHistoryList) {
      chatHistoryList.appendChild(messageDiv);

      // Scroll to the message
      setTimeout(() => {
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }

  // Update AI response with new content - optimized for smooth streaming
  let aiResponseBuffer = '';
  let aiResponseUpdatePending = false;
  let aiResponseLastScrollTime = 0;

  function updateAIResponse(chunk, accumulatedLength) {
    let aiMessage = document.querySelector('.chat-message.assistant:last-child');

    if (!aiMessage) {
      return;
    }

    const contentDiv = aiMessage.querySelector('.message-content');
    if (!contentDiv) {
      return;
    }

    // Remove dots loader if it exists (only on first chunk)
    const dotsLoader = contentDiv.querySelector('.dots-loader');
    if (dotsLoader) {
      contentDiv.removeChild(dotsLoader);

      // Create a dedicated text container for smooth updates
      const textContainer = document.createElement('span');
      textContainer.className = 'ai-response-text';
      contentDiv.appendChild(textContainer);
    }

    // Add chunk to buffer
    aiResponseBuffer += chunk;

    // Schedule update if not already pending
    if (!aiResponseUpdatePending) {
      aiResponseUpdatePending = true;
      requestAnimationFrame(updateAITextDisplay);
    }

    // Scroll to message with throttling (max once every 200ms)
    const now = Date.now();
    if (now - aiResponseLastScrollTime > 200) {
      aiResponseLastScrollTime = now;
      aiMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateAITextDisplay() {
    let aiMessage = document.querySelector('.chat-message.assistant:last-child');
    if (!aiMessage) {
      aiResponseUpdatePending = false;
      return;
    }

    const contentDiv = aiMessage.querySelector('.message-content');
    const textContainer = contentDiv?.querySelector('.ai-response-text');

    if (textContainer && aiResponseBuffer.length > 0) {
      // Update text content efficiently
      textContainer.textContent = aiResponseBuffer;

      // Add smooth animation class
      textContainer.classList.add('smooth-update');

      // Remove animation class after animation completes
      setTimeout(() => {
        textContainer.classList.remove('smooth-update');
      }, 200);

      // Clear buffer
      aiResponseBuffer = '';
    }

    aiResponseUpdatePending = false;
  }

  // Finalize AI response with complete content
  function finalizeAIResponse(completeResponse) {
    let aiMessage = document.querySelector('.chat-message.assistant:last-child');

    if (!aiMessage) {
      return;
    }

    const contentDiv = aiMessage.querySelector('.message-content');
    if (contentDiv) {
      // Remove dots loader if it exists
      const dotsLoader = contentDiv.querySelector('.dots-loader');
      if (dotsLoader) {
        contentDiv.removeChild(dotsLoader);
      }

      // Set the complete response
      contentDiv.textContent = completeResponse;

      // Parse as Markdown if available
      try {
        if (typeof marked !== "undefined") {
          const markdownHtml = marked.parse(completeResponse);
          contentDiv.innerHTML = markdownHtml;

          // Apply syntax highlighting if available
          if (typeof hljs !== "undefined") {
            setTimeout(() => {
              contentDiv.querySelectorAll("pre code").forEach((block) => {
                hljs.highlightElement(block);
              });
            }, 100);
          }
        }
      } catch (error) {
        console.warn("Markdown parsing error:", error);
      }
    }

    // Scroll to the message
    setTimeout(() => {
      aiMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  // Remove AI response placeholder (in case of error)
  function removeAIResponsePlaceholder() {
    const placeholder = document.querySelector('[data-message-id="ai-response-placeholder"]');
    if (placeholder) {
      placeholder.remove();
    }
  }

  async function startRecordingForStreaming() {
    try {
      audioStreamStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,  // 16kHz for AssemblyAI
          channelCount: 1,    // Mono
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
      });

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      const source = audioContext.createMediaStreamSource(audioStreamStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = function (e) {
        if (audioStreamSocket && audioStreamSocket.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
          }
          audioStreamSocket.send(pcmData.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Store references for cleanup
      audioStreamRecorder = {
        stop: () => {
          processor.disconnect();
          source.disconnect();
          audioContext.close();
        }
      };

      isStreaming = true;
      if (audioStreamBtn) {
        audioStreamBtn.innerHTML =
          '<span class="btn-icon"><i class="fa fa-microphone-slash"></i></span>';
        audioStreamBtn.className = "btn danger";
        audioStreamBtn.setAttribute("data-state", "recording");
      }

      updateConnectionStatus("recording", "Recording & Streaming");
      updateStreamingStatus("Recording and streaming audio...", "recording");
      if (
        audioStreamSocket &&
        audioStreamSocket.readyState === WebSocket.OPEN
      ) {
        audioStreamSocket.send("start_streaming");
      }
    } catch (error) {
      console.error("Error starting recording for streaming:", error);
      updateConnectionStatus("error", "Recording Error");
      updateStreamingStatus(
        "Error starting recording: " + error.message,
        "error"
      );
    }
  }

  async function stopAudioStreaming() {
    try {
      isStreaming = false;

      // Stop the audio recording (either MediaRecorder or custom processor)
      if (audioStreamRecorder) {
        if (typeof audioStreamRecorder.stop === 'function') {
          audioStreamRecorder.stop();
        }
        audioStreamRecorder = null;
      }

      // Stop media stream
      if (audioStreamStream) {
        audioStreamStream.getTracks().forEach((track) => track.stop());
        audioStreamStream = null;
      }
      
      if (audioStreamSocket && audioStreamSocket.readyState === WebSocket.OPEN) {
        audioStreamSocket.send("stop_streaming");
        
        // Close WebSocket after a short delay to allow final messages
        setTimeout(() => {
          if (audioStreamSocket) {
            audioStreamSocket.close();
          }
        }, 1000);
      }

      // Update UI
      if (audioStreamBtn) {
        audioStreamBtn.innerHTML =
          '<span class="btn-icon"><i class="fa fa-microphone"></i></span>';
        audioStreamBtn.className = "btn primary";
        audioStreamBtn.setAttribute("data-state", "ready");
      }

      updateConnectionStatus("disconnected", "Disconnected");
      updateStreamingStatus("Audio streaming stopped", "info");
    } catch (error) {
      console.error("Error stopping audio streaming:", error);
      updateStreamingStatus(
        "Error stopping streaming: " + error.message,
        "error"
      );
    }
  }

  function updateConnectionStatus(status, text) {
    if (connectionStatus) {
      connectionStatus.className = `status-badge ${status}`;
      connectionStatus.textContent = text;
    }
  }

  function updateStreamingStatus(message, type) {
    if (streamingStatusLog && audioStreamStatus) {
      const statusEntry = document.createElement("div");
      statusEntry.className = `streaming-status ${type}`;
      statusEntry.innerHTML = `
                <strong>${new Date().toLocaleTimeString()}</strong>: ${message}
              `;

      streamingStatusLog.appendChild(statusEntry);
      streamingStatusLog.scrollTop = streamingStatusLog.scrollHeight;
    }
  }

  function resetStreamingState() {
    // Clear status log
    if (streamingStatusLog) {
      streamingStatusLog.innerHTML = '';
    }
    resetAudioPlayback();
  }

  function clearPreviousTranscriptions() {
    // Clear any temporary messages
    removeAIResponsePlaceholder();
  }

  function handleAudioChunk(audioData) {
    // Play the audio chunk for streaming
    playAudioChunk(audioData.audio_base64);

    // Update UI with basic audio streaming progress
    updateStreamingStatus(
      `Audio chunk received (${audioData.chunk_size} bytes)`,
      "success"
    );
  }

  function initializeAudioContext() {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        playheadTime = audioContext.currentTime;
      }
      return true;
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      return false;
    }
  }

  function base64ToPCMFloat32(base64) {
    try {
      let binary = atob(base64);
      const offset = wavHeaderSet ? 44 : 0; // Skip WAV header if present

      if (wavHeaderSet) {
        wavHeaderSet = false; // Only process header once
      }

      const length = binary.length - offset;
      const buffer = new ArrayBuffer(length);
      const byteArray = new Uint8Array(buffer);

      for (let i = 0; i < byteArray.length; i++) {
        byteArray[i] = binary.charCodeAt(i + offset);
      }

      const view = new DataView(byteArray.buffer);
      const sampleCount = byteArray.length / 2; // 16-bit samples
      const float32Array = new Float32Array(sampleCount);

      for (let i = 0; i < sampleCount; i++) {
        const int16 = view.getInt16(i * 2, true); // Little endian
        float32Array[i] = int16 / 32768; // Convert to float32 range [-1, 1]
      }

      return float32Array;
    } catch (error) {
      console.error('Error converting base64 to PCM:', error);
      return null;
    }
  }

  function chunkPlay() {
    if (audioChunks.length > 0) {
      const chunk = audioChunks.shift();

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      try {
        const buffer = audioContext.createBuffer(1, chunk.length, SAMPLE_RATE);
        buffer.copyToChannel(chunk, 0);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);

        const now = audioContext.currentTime;
        if (playheadTime < now) {
          playheadTime = now + 0.05; // Add small delay to prevent audio gaps
        }

        source.start(playheadTime);
        playheadTime += buffer.duration;

        // Continue playing remaining chunks
        if (audioChunks.length > 0) {
          chunkPlay();
        } else {
          isPlaying = false;
        }
      } catch (error) {
        console.error('Error playing audio chunk:', error);
        isPlaying = false;
      }
    }
  }

  function playAudioChunk(base64Audio) {
    try {
      // Initialize audio context if not already done
      if (!initializeAudioContext()) {
        return;
      }

      // Convert base64 to PCM data
      const float32Array = base64ToPCMFloat32(base64Audio);
      if (!float32Array || float32Array.length === 0) {
        return;
      }

      // Add chunk to playback queue
      audioChunks.push(float32Array);

      // Start playback if not already playing
      if (!isPlaying && (playheadTime <= audioContext.currentTime + 0.1 || audioChunks.length >= 2)) {
        isPlaying = true;
        audioContext.resume().then(() => {
          chunkPlay();
        });
      }
    } catch (error) {
      console.error('Error in playAudioChunk:', error);
    }
  }

  function resetAudioPlayback() {
    audioChunks = [];
    isPlaying = false;
    wavHeaderSet = true;

    if (audioContext) {
      playheadTime = audioContext.currentTime;
    }
  }

  // ==================== CONFIGURATION MODAL FUNCTIONALITY ====================

  function initializeConfigModal() {
    // Event listeners for configuration modal
    if (toggleConfigBtn) {
      toggleConfigBtn.addEventListener("click", toggleConfigModal);
    }

    // Event listener for persona selector
    if (personaSelector) {
      personaSelector.addEventListener("change", handlePersonaChange);
    }

    if (closeConfigModalBtn) {
      closeConfigModalBtn.addEventListener("click", closeConfigModal);
    }

    if (cancelConfigBtn) {
      cancelConfigBtn.addEventListener("click", closeConfigModal);
    }

    if (clearConfigBtn) {
      clearConfigBtn.addEventListener("click", clearConfig);
    }

    if (apiConfigForm) {
      apiConfigForm.addEventListener("submit", handleConfigSubmit);
    }

    // Load saved configuration on page load
    loadSavedConfig();
  }

  function toggleConfigModal() {
    if (configModal.style.display === "none" || configModal.style.display === "") {
      configModal.style.display = "flex";
      loadSavedConfig();
    } else {
      configModal.style.display = "none";
    }
  }

  function closeConfigModal() {
    configModal.style.display = "none";
    clearConfigStatus();
  }

  function clearConfigStatus() {
    if (configStatus) {
      configStatus.style.display = "none";
      configStatus.className = "config-status";
      configStatus.textContent = "";
    }
  }

  function showConfigStatus(message, type) {
    if (configStatus) {
      configStatus.textContent = message;
      configStatus.className = `config-status ${type}`;
      configStatus.style.display = "block";

      // Auto-hide success messages after 3 seconds
      if (type === "success") {
        setTimeout(() => {
          clearConfigStatus();
        }, 3000);
      }
    }
  }

  function loadSavedConfig() {
    try {
      const savedConfig = localStorage.getItem('voiceAgentConfig');
      if (savedConfig) {
        const config = JSON.parse(savedConfig);

        // Populate form fields
        document.getElementById('geminiApiKey').value = config.gemini_api_key || '';
        document.getElementById('assemblyaiApiKey').value = config.assemblyai_api_key || '';
        document.getElementById('murfApiKey').value = config.murf_api_key || '';
        document.getElementById('murfVoiceId').value = config.murf_voice_id || 'en-IN-aarav';
        document.getElementById('agentPersona').value = config.agent_persona || '';
        document.getElementById('mongodbUrl').value = config.mongodb_url || 'mongodb://localhost:27017';
      }
    } catch (error) {
      console.error("Error loading saved configuration:", error);
    }
  }

  async function handleConfigSubmit(event) {
    event.preventDefault();

    const formData = new FormData(apiConfigForm);
    const config = {
      gemini_api_key: formData.get('gemini_api_key'),
      assemblyai_api_key: formData.get('assemblyai_api_key'),
      murf_api_key: formData.get('murf_api_key'),
      murf_voice_id: formData.get('murf_voice_id'),
      agent_persona: formData.get('agent_persona'),
      mongodb_url: formData.get('mongodb_url')
    };

    // Validate required fields
    if (!config.gemini_api_key || !config.assemblyai_api_key || !config.murf_api_key) {
      showConfigStatus("Please fill in all required API keys", "error");
      return;
    }

    try {
      // Save to localStorage
      localStorage.setItem('voiceAgentConfig', JSON.stringify(config));

      // Send configuration to server
      sendConfigToServer(config);

      showConfigStatus("Configuration saved successfully!", "success");

      // Close modal after successful save (with delay to show success message)
      setTimeout(() => {
        closeConfigModal();
      }, 1500);

    } catch (error) {
      console.error("Error saving configuration:", error);
      showConfigStatus("Error saving configuration: " + error.message, "error");
    }
  }

  async function sendConfigToServer(config) {
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error('Failed to send configuration to server');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Server configuration failed');
      }

      console.log("Configuration sent to server successfully");
    } catch (error) {
      console.error("Error sending configuration to server:", error);
      // Don't show error to user since local storage save was successful
    }
  }

  function clearConfig() {
    if (confirm("Are you sure you want to clear all configuration data?")) {
      localStorage.removeItem('voiceAgentConfig');

      // Clear form fields
      document.getElementById('geminiApiKey').value = '';
      document.getElementById('assemblyaiApiKey').value = '';
      document.getElementById('murfApiKey').value = '';
      document.getElementById('murfVoiceId').value = 'en-IN-aarav';
      document.getElementById('agentPersona').value = '';
      document.getElementById('mongodbUrl').value = 'mongodb://localhost:27017';

      showConfigStatus("Configuration cleared successfully", "success");

      // Also clear server configuration
      fetch('/api/config', {
        method: 'DELETE'
      }).catch(error => {
        console.error("Error clearing server configuration:", error);
      });
    }
  }

  // ==================== PERSONA SELECTOR FUNCTIONALITY ====================

  function initializePersonaSelector() {
    // Load saved persona from localStorage
    const savedConfig = localStorage.getItem('voiceAgentConfig');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.agent_persona) {
          // Map persona to selector value
          const personaValue = mapPersonaToValue(config.agent_persona);
          if (personaSelector && personaValue) {
            personaSelector.value = personaValue;
          }
        }
      } catch (error) {
        console.error("Error loading saved persona:", error);
      }
    }
  }

  function mapPersonaToValue(persona) {
    if (!persona) return "default";

    const personaLower = persona.toLowerCase();
    if (personaLower.includes("pirate")) return "pirate";
    if (personaLower.includes("developer") || personaLower.includes("programmer")) return "developer";
    if (personaLower.includes("cowboy")) return "cowboy";
    if (personaLower.includes("robot")) return "robot";
    return "default";
  }

  function mapValueToPersona(value) {
    switch (value) {
      case "pirate":
        return "a friendly pirate who speaks with nautical terms and pirate slang like 'Arrr', 'matey', 'shiver me timbers', and 'yo ho ho'";
      case "developer":
        return "a skilled software developer who speaks with technical precision and uses programming terminology";
      case "cowboy":
        return "an old west cowboy who speaks with western slang like 'howdy partner', 'yeehaw', 'varmint', and 'rootin' tootin'";
      case "robot":
        return "a logical robot who speaks with technical precision, uses binary references, and says 'beep boop' occasionally";
      default:
        return ""; // Default helpful AI assistant
    }
  }

  async function handlePersonaChange(event) {
    const selectedValue = event.target.value;

    try {
      // Send persona change request to server
      const response = await fetch('/api/persona/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ "persona": selectedValue })
      });

      if (!response.ok) {
        throw new Error('Failed to switch persona');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Server persona switch failed');
      }

      console.log(`Persona changed to: ${selectedValue}`);
    } catch (error) {
      console.error("Error changing persona:", error);
    }
  }
});
