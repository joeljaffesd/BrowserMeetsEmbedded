let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let outputStream;
let serialMessages = [];
let maxMessages = 100;

// Serial data values
let xValue = 0.5;
let yValue = 0.5;
let zValue = 0.5;

// Integrated position (velocity -> position)
let integratedX = 0;
let integratedY = 0;
let integratedZ = 0;

// Integration scaling factor (adjust for sensitivity)
const integrationScale = 0.5;

// Canvas and layout elements
let canvas;
let containerDiv;
let canvasContainer;
let terminalContainer;
let messagesDiv;

// Previous drawing position for line continuity
let prevDrawX = null;
let prevDrawY = null;

async function setup() {
  // Create main container with flex layout
  containerDiv = createDiv();
  containerDiv.style('display', 'flex');
  containerDiv.style('flex-direction', 'column');
  containerDiv.style('width', '100%');
  containerDiv.style('height', '100vh');
  containerDiv.style('margin', '0');
  containerDiv.style('padding', '0');
  
  // Canvas container (takes up remaining space)
  canvasContainer = createDiv();
  canvasContainer.style('flex', '1');
  canvasContainer.style('display', 'flex');
  canvasContainer.style('align-items', 'center');
  canvasContainer.style('justify-content', 'center');
  canvasContainer.style('background-color', '#1a1a1a');
  canvasContainer.style('overflow', 'hidden');
  canvasContainer.parent(containerDiv);
  
  // Create p5 canvas
  const canvasWidth = canvasContainer.elt.clientWidth;
  const canvasHeight = canvasContainer.elt.clientHeight;
  canvas = createCanvas(canvasWidth || 800, canvasHeight || 400);
  canvas.parent(canvasContainer);
  canvas.style('display', 'block');
  
  background(20);
  stroke(255);
  strokeWeight(2);
  
  // Initialize integrated position to center
  integratedX = width / 2;
  integratedY = height / 2;
  
  // Terminal container (fixed height at bottom)
  terminalContainer = createDiv();
  terminalContainer.style('height', '200px');
  terminalContainer.style('background-color', '#1e1e1e');
  terminalContainer.style('border-top', '2px solid #444');
  terminalContainer.style('display', 'flex');
  terminalContainer.style('flex-direction', 'column');
  terminalContainer.style('padding', '10px');
  terminalContainer.style('overflow', 'hidden');
  terminalContainer.parent(containerDiv);
  
  // Terminal title and controls
  let terminalHeader = createDiv('Terminal Output (Press SPACE to reconnect)');
  terminalHeader.style('font-weight', 'bold');
  terminalHeader.style('color', '#00ff00');
  terminalHeader.style('font-family', 'Courier New, monospace');
  terminalHeader.style('font-size', '12px');
  terminalHeader.style('margin-bottom', '5px');
  terminalHeader.parent(terminalContainer);
  
  // Messages display area
  messagesDiv = createDiv();
  messagesDiv.style('font-family', 'Courier New, monospace');
  messagesDiv.style('font-size', '11px');
  messagesDiv.style('background-color', '#0a0a0a');
  messagesDiv.style('color', '#00ff00');
  messagesDiv.style('padding', '8px');
  messagesDiv.style('border-radius', '3px');
  messagesDiv.style('overflow-y', 'auto');
  messagesDiv.style('white-space', 'pre-wrap');
  messagesDiv.style('word-break', 'break-all');
  messagesDiv.style('user-select', 'text');
  messagesDiv.style('-webkit-user-select', 'text');
  messagesDiv.style('flex', '1');
  messagesDiv.parent(terminalContainer);
  
  // Automatically open Serial device selector on page load
  await connectToDevice();
  
  // Handle window resize
  window.addEventListener('resize', windowResized);
}

function draw() {
  // Convert accelerometer readings to acceleration (centered at 1.65V = 0.5)
  // Subtract 0.5 to center at 0, then scale for acceleration
  const accelX = (xValue - 0.5) * 2; // Range: -1 to 1
  const accelY = (yValue - 0.5) * 2; // Range: -1 to 1
  
  // Integrate acceleration to get velocity/position
  integratedX += accelX * integrationScale;
  integratedY += accelY * integrationScale;
  
  // Clamp position to canvas bounds
  integratedX = constrain(integratedX, 0, width);
  integratedY = constrain(integratedY, 0, height);
  
  // Z value controls brush size and opacity (use raw Z, not integrated)
  const brushSize = map(zValue, 0, 1, 2, 20);
  const opacity = map(zValue, 0, 1, 50, 255);
  
  // Draw with integrated position
  colorMode(HSB);
  stroke(map(accelX, -1, 1, 0, 360), 255, 255, opacity);
  colorMode(RGB);
  
  strokeWeight(brushSize);
  
  // Draw continuous line if we have a previous position
  if (prevDrawX !== null && prevDrawY !== null) {
    line(prevDrawX, prevDrawY, integratedX, integratedY);
  } else {
    // First time, just place a point
    point(integratedX, integratedY);
  }
  
  // Store current position for next frame
  prevDrawX = integratedX;
  prevDrawY = integratedY;
  
  // Debug: Print values to console occasionally
  if (frameCount % 30 === 0) {
    console.log(`X: ${xValue.toFixed(3)}, Y: ${yValue.toFixed(3)}, Z: ${zValue.toFixed(3)}, Pos: (${integratedX.toFixed(0)}, ${integratedY.toFixed(0)})`);
  }
}

function updateDisplay() {
  // Update messages
  let messageText = '';
  for (let i = 0; i < serialMessages.length; i++) {
    messageText += serialMessages[i] + '\n';
  }
  messagesDiv.html(messageText || 'Waiting for data...');
  
  // Auto-scroll to bottom
  messagesDiv.elt.scrollTop = messagesDiv.elt.scrollHeight;
}

function windowResized() {
  // Resize canvas to fit the canvas container if available
  if (canvasContainer && canvasContainer.elt) {
    const newWidth = canvasContainer.elt.clientWidth;
    const newHeight = canvasContainer.elt.clientHeight;
    resizeCanvas(newWidth, newHeight);
  }
}

function keyPressed() {
  // Press space to reconnect
  if (key === ' ') {
    connectToDevice();
  }
}

async function connectToDevice() {
  try {
    // Prefer Web Serial for CDC/virtual COM devices (works out of the box on Windows)
    if (!('serial' in navigator)) {
      addSerialMessage('Web Serial is not supported in this browser! Try Chrome/Edge 89+ over HTTPS.');
      return;
    }

    // Request a serial port from the user
    port = await navigator.serial.requestPort({
      // Optionally filter by USB vendor/product IDs
      // filters: [{ usbVendorId: 0x0483 }] // Example: STMicroelectronics
    });

    // Open the selected port. Baud rate is ignored by USB CDC but required by API.
    await port.open({ baudRate: 115200 });
    addSerialMessage('Serial port opened');

    // Set up a reader pipeline
    const textDecoder = new TextDecoderStream();
    inputDone = port.readable.pipeTo(textDecoder.writable).catch(() => {});
    reader = textDecoder.readable.getReader();

    // Optional: handle disconnects
    if (typeof port.addEventListener === 'function') {
      port.addEventListener('disconnect', () => {
        addSerialMessage('Device disconnected');
      });
    }

    addSerialMessage('Connected to device!');
    readLoop();
  } catch (error) {
    addSerialMessage('Error: ' + error.message);
    console.error('Connection error:', error);
  }
}

async function readLoop() {
  let buffer = '';
  try {
    while (port && port.readable && reader) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        buffer += value;
        // Split on newlines to get complete messages
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (line.trim().length > 0) addSerialMessage(line.trim());
        }
      }
    }
    // Flush remaining buffer
    if (buffer.trim().length > 0) addSerialMessage(buffer.trim());
  } catch (error) {
    addSerialMessage('Read error: ' + error.message);
    console.error('Read error:', error);
  } finally {
    try { if (reader) reader.releaseLock(); } catch {}
    try { if (inputDone) await inputDone; } catch {}
  }
}

function addSerialMessage(message) {
  // Add timestamp
  const timestamp = nf(hour(), 2) + ':' + nf(minute(), 2) + ':' + nf(second(), 2);
  const timestampedMessage = '[' + timestamp + '] ' + message;
  serialMessages.push(timestampedMessage);
  
  // Parse serial data to extract X, Y, Z values
  // Expected format: "X: 2.871, Y: 2.872, Z: 0.654"
  const xMatch = message.match(/X:\s*([\d.]+)/);
  const yMatch = message.match(/Y:\s*([\d.]+)/);
  const zMatch = message.match(/Z:\s*([\d.]+)/);
  
  if (xMatch) xValue = parseFloat(xMatch[1]) / 3.3; // Normalize to 0-1
  if (yMatch) yValue = parseFloat(yMatch[1]) / 3.3;
  if (zMatch) zValue = parseFloat(zMatch[1]) / 3.3;
  
  // Keep only the last N messages
  if (serialMessages.length > maxMessages) {
    serialMessages.shift();
  }
  
  console.log(message);
  
  // Update the display
  updateDisplay();
}

// Cleanup on page unload
window.addEventListener('beforeunload', async () => {
  try {
    if (reader) {
      await reader.cancel();
      try { reader.releaseLock(); } catch {}
    }
    if (port && port.readable) {
      await port.close();
    }
  } catch {}
});
