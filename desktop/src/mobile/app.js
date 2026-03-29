class MobileController {
  constructor() {
    this.ws = null;
    this.sensitivity = 50;
    this.touchStartPos = null;
    this.isConnected = false;

    this.initElements();
    this.initEventListeners();
    this.connect();
  }

  initElements() {
    this.statusIndicator = document.getElementById('statusIndicator');
    this.statusText = document.getElementById('statusText');
    this.touchpad = document.getElementById('touchpad');
    this.textInput = document.getElementById('textInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.sensitivitySlider = document.getElementById('sensitivity');
    this.sensitivityValue = document.getElementById('sensitivityValue');
  }

  initEventListeners() {
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const direction = btn.dataset.direction;
        this.sendNavigation(direction);
      });
    });

    document.querySelector('.dpad-center').addEventListener('click', () => {
      this.sendSelect();
    });

    document.querySelector('.back-btn').addEventListener('click', () => {
      this.sendBack();
    });

    this.sendBtn.addEventListener('click', () => {
      this.sendText(this.textInput.value);
      this.textInput.value = '';
    });

    this.textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendText(this.textInput.value);
        this.textInput.value = '';
      }
    });

    this.touchpad.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.touchpad.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.touchpad.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

    document.querySelector('.left-btn').addEventListener('click', () => {
      this.sendMouseClick('left');
    });

    document.querySelector('.right-btn').addEventListener('click', () => {
      this.sendMouseClick('right');
    });

    this.sensitivitySlider.addEventListener('input', (e) => {
      this.sensitivity = parseInt(e.target.value);
      this.sensitivityValue.textContent = this.sensitivity;
    });
  }

  connect() {
    const wsUrl = `ws://${window.location.hostname}:8080`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('Connected to TV');
        this.isConnected = true;
        this.updateStatus(true);
      };

      this.ws.onclose = () => {
        console.log('Disconnected from TV');
        this.isConnected = false;
        this.updateStatus(false);
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      setTimeout(() => this.connect(), 3000);
    }
  }

  updateStatus(connected) {
    this.statusIndicator.classList.toggle('connected', connected);
    this.statusText.textContent = connected ? 'Connected' : 'Disconnected';
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendNavigation(direction) {
    this.send({ type: 'NAVIGATION', payload: { direction } });
  }

  sendSelect() {
    this.send({ type: 'SELECT', payload: {} });
  }

  sendBack() {
    this.send({ type: 'BACK', payload: {} });
  }

  sendText(text) {
    if (!text) return;
    this.send({ type: 'TEXT_INPUT', payload: { text } });
  }

  sendMouseMove(dx, dy) {
    const multiplier = this.sensitivity / 50;
    this.send({ 
      type: 'MOUSE_MOVE', 
      payload: { 
        dx: Math.round(dx * multiplier), 
        dy: Math.round(dy * multiplier) 
      } 
    });
  }

  sendMouseClick(button) {
    this.send({ type: 'MOUSE_CLICK', payload: { button } });
  }

  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
    this.touchpad.classList.add('touched');
    this.send({ type: 'TOUCH_START', payload: { x: touch.clientX, y: touch.clientY } });
  }

  handleTouchMove(e) {
    e.preventDefault();
    if (!this.touchStartPos) return;

    const touch = e.touches[0];
    const dx = touch.clientX - this.touchStartPos.x;
    const dy = touch.clientY - this.touchStartPos.y;

    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      this.sendMouseMove(dx, dy);
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
    }
  }

  handleTouchEnd(e) {
    e.preventDefault();
    this.touchStartPos = null;
    this.touchpad.classList.remove('touched');
    this.send({ type: 'TOUCH_END', payload: {} });
  }

  handleMessage(message) {
    console.log('Received:', message);
    
    switch (message.type) {
      case 'PONG':
        break;
      case 'CONNECTION_STATUS':
        console.log('Clients connected:', message.payload.clientCount);
        break;
      case 'TV_INFO':
        console.log('TV Info:', message.payload);
        break;
      case 'ERROR':
        console.error('TV Error:', message.payload.message);
        break;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MobileController();
});
