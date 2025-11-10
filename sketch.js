/*
We consulted copilot's Claude Haiku, Claude Sonnet, Grok Fast, and ChatGPT-5 to help configure this sketch and debug the thresholding to create parametric drawings.

INSTRUCTIONS:
This is designed for the Daisy Seed connected to an accelerometer.

Direction: The X reading steers left/right (lower = left, higher = right). The Y reading steers up/down (higher = up, lower = down). It keeps moving while a side or up/down reading is past its limit.

Size: The Z reading sets brush thickness: low = thin, middle = medium, high = thick.

Color: The line takes a rainbow color based on the direction it’s moving; if it’s not moving, it stays white.

Reset: Press R to put the brush back in the center. Space tries to reconnect. Calibration is fixed (no extra steps needed).
*/
let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let outputStream;
let serialMessages = [];
let maxMessages = 100;

// Raw serial volt readings (in volts)
let xVolt = null;
let yVolt = null;
let zVolt = null;
let hasData = false; // becomes true after first valid parse

// Pointer position
let integratedX = 0;
let integratedY = 0;

// Absolute 3σ on-thresholds (in volts) — use as-is, no calibration
const X_LEFT_THRESHOLD = 0.420;
const X_RIGHT_THRESHOLD = 0.552;
const Y_DOWN_THRESHOLD = 1.087;
const Y_UP_THRESHOLD = 1.513;
const Z_THIN_THRESHOLD = 0.900;
const Z_THICK_THRESHOLD = 1.594;

// Movement speed in pixels per second when a threshold is active
const MOVE_SPEED = 300; // adjust as desired

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
  // Time step (seconds)
  const dt = (typeof deltaTime === 'number' ? deltaTime : 16.67) / 1000;

  // If we don't have data yet, just show the point and wait
  if (!hasData) {
    stroke(255, 200);
    strokeWeight(4);
    point(integratedX, integratedY);
    prevDrawX = integratedX;
    prevDrawY = integratedY;
    return;
  }

  // Determine movement from absolute thresholds
  let dx = 0;
  let dy = 0;
  if (xVolt !== null) {
    if (xVolt < X_LEFT_THRESHOLD) dx = -MOVE_SPEED;
    else if (xVolt > X_RIGHT_THRESHOLD) dx = MOVE_SPEED;
  }
  if (yVolt !== null) {
    if (yVolt < Y_DOWN_THRESHOLD) dy = MOVE_SPEED; // canvas y increases downward
    else if (yVolt > Y_UP_THRESHOLD) dy = -MOVE_SPEED;
  }

  // Integrate position with constant speed while thresholds are active
  integratedX += dx * dt;
  integratedY += dy * dt;

  // Clamp position to canvas bounds
  integratedX = constrain(integratedX, 0, width);
  integratedY = constrain(integratedY, 0, height);

  // Brush thickness from Z absolute thresholds
  let brushSize = 4; // default mid
  if (zVolt !== null) {
    if (zVolt < Z_THIN_THRESHOLD) brushSize = 2;
    else if (zVolt > Z_THICK_THRESHOLD) brushSize = 18; // thicker
    else brushSize = 6;
  }

  // Color by direction angle (rainbow)
  if (dx !== 0 || dy !== 0) {
    const angle = Math.atan2(dy, dx); // -PI..PI, 0 is right
    const hue = map(angle, -Math.PI, Math.PI, 0, 360);
    colorMode(HSB);
    stroke(hue, 255, 255, 220);
    colorMode(RGB);
  } else {
    stroke(255, 220);
  }
  strokeWeight(brushSize);
  if (prevDrawX !== null && prevDrawY !== null) {
    line(prevDrawX, prevDrawY, integratedX, integratedY);
  } else {
    point(integratedX, integratedY);
  }
  prevDrawX = integratedX;
  prevDrawY = integratedY;
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
  // 'c' is no-op in absolute-threshold mode (kept for compatibility)
  if (key === 'c' || key === 'C') {
    addSerialMessage('Calibration disabled: using fixed absolute thresholds.');
  }
  // Press 'r' to recenter the brush
  if (key === 'r' || key === 'R') {
    integratedX = width / 2;
    integratedY = height / 2;
    addSerialMessage('Position reset');
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
  
  // Parse serial data to extract X, Y, Z values (in volts)
  // Expected format: "X: 2.871, Y: 2.872, Z: 0.654"
  const xMatch = message.match(/X:\s*([-.\d]+)/);
  const yMatch = message.match(/Y:\s*([-.\d]+)/);
  const zMatch = message.match(/Z:\s*([-.\d]+)/);

  const parseVolt = (m) => {
    if (!m) return null;
    const v = parseFloat(m[1]);
    return isFinite(v) ? v : null;
  };

  const xv = parseVolt(xMatch);
  const yv = parseVolt(yMatch);
  const zv = parseVolt(zMatch);
  if (xv !== null) xVolt = xv;
  if (yv !== null) yVolt = yv;
  if (zv !== null) zVolt = zv;
  if (!hasData && (xVolt !== null || yVolt !== null || zVolt !== null)) hasData = true;
  
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
