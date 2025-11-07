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
  
  // Automatically open WebUSB device selector on page load
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
  if (container) {
    // Resize canvas to fit container
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
    // Check if WebUSB is supported
    if (!navigator.usb) {
      addSerialMessage('WebUSB is not supported in this browser!');
      console.error('WebUSB not supported');
      return;
    }
    
    // Request access to USB device
    port = await navigator.usb.requestDevice({ 
      filters: [] // Empty filters to show all devices
    });
    
    addSerialMessage('Device selected: ' + port.productName);
    console.log('Device info:', port);
    
    // Open the device
    await port.open({ baudRate: 9600 });
    addSerialMessage('Device opened');
    
    // Select configuration #1 for the device
    if (port.configuration === null) {
      await port.selectConfiguration(1);
      addSerialMessage('Configuration selected');
    }
    
    // Log available interfaces
    console.log('Available interfaces:', port.configuration.interfaces);
    
    // Try to claim the first available interface
    let interfaceClaimed = false;
    for (let iface of port.configuration.interfaces) {
      try {
        addSerialMessage(`Trying interface ${iface.interfaceNumber}...`);
        await port.claimInterface(iface.interfaceNumber);
        addSerialMessage(`Claimed interface ${iface.interfaceNumber}`);
        interfaceClaimed = true;
        
        // Log endpoints for debugging
        console.log('Interface alternates:', iface.alternates);
        if (iface.alternate && iface.alternate.endpoints) {
          console.log('Endpoints:', iface.alternate.endpoints);
        }
        
        break; // Successfully claimed an interface
      } catch (e) {
        addSerialMessage(`Interface ${iface.interfaceNumber} failed: ${e.message}`);
        console.error(`Failed to claim interface ${iface.interfaceNumber}:`, e);
      }
    }
    
    if (!interfaceClaimed) {
      addSerialMessage('Failed to claim any interface');
      return;
    }
    
    addSerialMessage('Connected to device!');
    
    // Start reading from the device
    readLoop();
    
  } catch (error) {
    addSerialMessage('Error: ' + error.message);
    console.error('Connection error:', error);
  }
}

async function readLoop() {
  try {
    // Find the IN endpoint (device to host)
    let inEndpoint = null;
    
    for (let iface of port.configuration.interfaces) {
      if (iface.claimed && iface.alternate && iface.alternate.endpoints) {
        for (let endpoint of iface.alternate.endpoints) {
          console.log('Endpoint:', endpoint);
          if (endpoint.direction === 'in') {
            inEndpoint = endpoint.endpointNumber;
            addSerialMessage(`Using IN endpoint ${inEndpoint}`);
            break;
          }
        }
      }
      if (inEndpoint) break;
    }
    
    if (!inEndpoint) {
      addSerialMessage('No IN endpoint found - will try endpoint 1');
      inEndpoint = 1;
    }
    
    while (port && port.opened) {
      // Try to read from the device
      const result = await port.transferIn(inEndpoint, 64);
      
      if (result.data) {
        const decoder = new TextDecoder();
        const text = decoder.decode(result.data);
        if (text.trim().length > 0) {
          addSerialMessage(text.trim());
        }
      }
    }
  } catch (error) {
    if (error.message.includes('device unavailable') || 
        error.message.includes('disconnected')) {
      addSerialMessage('Device disconnected');
    } else {
      addSerialMessage('Read error: ' + error.message);
    }
    console.error('Read error:', error);
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
  if (port && port.opened) {
    await port.close();
  }
});
