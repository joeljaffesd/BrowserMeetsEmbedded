let port;
let reader;
let inputDone;
let outputDone;
let inputStream;
let outputStream;
let serialMessages = [];
let maxMessages = 100;

let titleDiv;
let statusDiv;
let instructionsDiv;
let outputDiv;
let messagesDiv;

async function setup() {
  noCanvas(); // Don't create a canvas since we're using HTML elements
  
  // Create UI elements
  titleDiv = createDiv('WebUSB Serial Monitor');
  titleDiv.style('font-size', '24px');
  titleDiv.style('font-weight', 'bold');
  titleDiv.style('padding', '20px');
  titleDiv.style('background-color', '#f0f0f0');
  titleDiv.style('border-bottom', '2px solid #ccc');
  
  statusDiv = createDiv('Status: Disconnected');
  statusDiv.style('padding', '10px 20px');
  statusDiv.style('background-color', '#fff');
  statusDiv.style('color', '#c00');
  statusDiv.style('border-bottom', '1px solid #ccc');
  
  instructionsDiv = createDiv('Press SPACE to reconnect | Make sure your device uses CDC or WebUSB descriptors');
  instructionsDiv.style('padding', '10px 20px');
  instructionsDiv.style('background-color', '#fff');
  instructionsDiv.style('color', '#666');
  instructionsDiv.style('font-size', '12px');
  instructionsDiv.style('border-bottom', '1px solid #ccc');
  
  outputDiv = createDiv();
  outputDiv.style('padding', '20px');
  outputDiv.style('background-color', '#fff');
  
  let outputTitle = createDiv('Serial Output:');
  outputTitle.style('font-weight', 'bold');
  outputTitle.style('margin-bottom', '10px');
  outputTitle.parent(outputDiv);
  
  messagesDiv = createDiv();
  messagesDiv.style('font-family', 'Courier New, monospace');
  messagesDiv.style('font-size', '14px');
  messagesDiv.style('background-color', '#1e1e1e');
  messagesDiv.style('color', '#00ff00');
  messagesDiv.style('padding', '15px');
  messagesDiv.style('border-radius', '5px');
  messagesDiv.style('max-height', '500px');
  messagesDiv.style('overflow-y', 'auto');
  messagesDiv.style('white-space', 'pre-wrap');
  messagesDiv.style('word-break', 'break-all');
  messagesDiv.style('user-select', 'text');
  messagesDiv.style('-webkit-user-select', 'text');
  messagesDiv.style('-moz-user-select', 'text');
  messagesDiv.style('-ms-user-select', 'text');
  messagesDiv.parent(outputDiv);
  
  // Automatically open WebUSB device selector on page load
  await connectToDevice();
}

function updateDisplay() {
  // Update status
  if (port && port.opened) {
    statusDiv.html('Status: Connected');
    statusDiv.style('color', '#0a0');
  } else {
    statusDiv.html('Status: Disconnected');
    statusDiv.style('color', '#c00');
  }
  
  // Update messages (reverse order so newest is at bottom)
  let messageText = '';
  for (let i = 0; i < serialMessages.length; i++) {
    messageText += serialMessages[i] + '\n';
  }
  messagesDiv.html(messageText || 'Waiting for data...');
  
  // Auto-scroll to bottom
  messagesDiv.elt.scrollTop = messagesDiv.elt.scrollHeight;
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
  serialMessages.push('[' + timestamp + '] ' + message);
  
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
