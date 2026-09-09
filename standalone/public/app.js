/* ==========================================================
   Chand's File Dropper - Vanilla JavaScript Application
   Pure JS • WebSocket Sync • Web Audio Chime • Auto-Advance
   ========================================================== */

class FileDropperApp {
  constructor() {
    this.role = null;
    this.room = null;
    this.deviceId = null;
    this.ws = null;
    this.blurryBoost = false;
    this.qrVisible = false;
    this.activePreviewFile = null;
    this.imgZoom = 1;
    this.imgRotation = 0;

    this.init();
  }

  init() {
    // Check URL search parameters for initial room code
    const urlParams = new URLSearchParams(window.location.search);
    const codeParam = urlParams.get('room') || urlParams.get('code');
    if (codeParam && codeParam.length === 6) {
      this.selectRole('phone');
      this.populatePhoneCode(codeParam);
    }

    this.setupPhoneInputListeners();

    // Display hostname in projector screen URL
    const projUrlElem = document.getElementById('proj-web-url');
    if (projUrlElem) {
      projUrlElem.textContent = window.location.origin;
    }
  }

  // --- VIEW SWITCHING ---
  switchView(viewId) {
    document.querySelectorAll('.screen-view').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  }

  async selectRole(role) {
    this.role = role;
    if (role === 'projector') {
      this.switchView('view-projector');
      await this.createProjectorRoom();
    } else {
      this.switchView('view-phone');
      document.getElementById('phone-room-status').textContent =
        role === 'phone' ? 'Phone Sender Mode' : 'PC / Laptop Mode';
    }
  }

  // --- AUDIO CHIME ---
  playArrivalChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.log('Audio chime not supported or muted');
    }
  }

  // --- WEBSOCKET CONNECTION ---
  connectWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        code: this.room.code,
        deviceId: this.deviceId,
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'sync' || msg.type === 'room_updated') {
          this.room = msg.room;
          this.renderRoomState();
        } else if (msg.type === 'files_uploaded') {
          this.playArrivalChime();
          this.room = msg.room;
          this.renderRoomState();
        } else if (msg.type === 'file_beamed') {
          const file = (this.room.files || []).find((f) => f.id === msg.fileId);
          if (file) {
            this.openPreview(file);
          }
        } else if (msg.type === 'room_cleared') {
          if (this.room) this.room.files = [];
          this.renderRoomState();
          this.closePreview();
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      // Reconnect after 3 seconds if room is still open
      if (this.room) {
        setTimeout(() => this.connectWebSocket(), 3000);
      }
    };
  }

  // --- PROJECTOR ROOM CREATION ---
  async createProjectorRoom() {
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceType: 'projector' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      this.room = data.room;
      this.deviceId = data.deviceId;

      this.displayCodeTiles(this.room.code);
      this.generateQRCode(this.room.code);
      this.renderRoomState();
      this.connectWebSocket();
    } catch (err) {
      alert('Error creating projector session: ' + err.message);
    }
  }

  displayCodeTiles(code) {
    for (let i = 0; i < 6; i++) {
      const tile = document.getElementById(`d${i}`);
      if (tile) tile.textContent = code[i] || '-';
    }
  }

  generateQRCode(code) {
    const qrContainer = document.getElementById('qrcode');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';
    const fullJoinUrl = `${window.location.origin}/?code=${code}`;

    if (window.QRCode) {
      new window.QRCode(qrContainer, {
        text: fullJoinUrl,
        width: 160,
        height: 160,
        colorDark: '#000000',
        colorLight: '#ffffff',
      });
    }
  }

  toggleBlurryBoost() {
    this.blurryBoost = !this.blurryBoost;
    document.body.classList.toggle('blurry-boost', this.blurryBoost);
    const btn = document.getElementById('btn-blurry');
    if (btn) {
      btn.textContent = this.blurryBoost ? '⚡ Blurry Lens Boost: ON' : '⚡ Blurry Lens Boost: OFF';
    }
  }

  toggleQR() {
    this.qrVisible = !this.qrVisible;
    const qrEl = document.getElementById('qr-container');
    if (qrEl) qrEl.classList.toggle('hidden', !this.qrVisible);
  }

  // --- PHONE CODE INPUT LOGIC ---
  setupPhoneInputListeners() {
    const inputs = [];
    for (let i = 0; i < 6; i++) {
      const inp = document.getElementById(`c${i}`);
      if (inp) inputs.push(inp);
    }

    inputs.forEach((inp, idx) => {
      inp.addEventListener('input', (e) => {
        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        e.target.value = val;
        if (val && idx < 5) {
          inputs[idx + 1].focus();
        }
      });

      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          inputs[idx - 1].focus();
        } else if (e.key === 'Enter') {
          this.submitPhoneCode();
        }
      });

      inp.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (pasted.length >= 6) {
          this.populatePhoneCode(pasted.substring(0, 6));
        }
      });
    });
  }

  populatePhoneCode(code) {
    for (let i = 0; i < 6; i++) {
      const inp = document.getElementById(`c${i}`);
      if (inp) inp.value = code[i] || '';
    }
  }

  getEnteredCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
      const inp = document.getElementById(`c${i}`);
      if (inp) code += inp.value.trim();
    }
    return code.toUpperCase();
  }

  async submitPhoneCode() {
    const code = this.getEnteredCode();
    if (code.length !== 6) {
      alert('Please enter the full 6-digit code shown on the screen.');
      return;
    }

    const btn = document.getElementById('btn-connect');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, deviceType: this.role || 'phone' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      this.room = data.room;
      this.deviceId = data.deviceId;

      // Switch to active upload view
      document.getElementById('phone-join-box').classList.add('hidden');
      document.getElementById('phone-upload-box').classList.remove('hidden');
      document.getElementById('btn-phone-leave').style.display = 'inline-block';
      document.getElementById('phone-room-code-display').textContent = this.room.code;

      this.renderRoomState();
      this.connectWebSocket();
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // --- UPLOADS ---
  handlePhoneUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    this.uploadFiles(files);
    event.target.value = '';
  }

  uploadFiles(files) {
    if (!this.room) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('uploaderName', this.role === 'phone' ? 'Phone Presenter' : 'Laptop Presenter');

    const progressBox = document.getElementById('upload-progress');
    const progressBar = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');

    if (progressBox) progressBox.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/rooms/${this.room.code}/upload`, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        if (progressBar) progressBar.style.width = percent + '%';
        if (progressText) progressText.textContent = `Uploading: ${percent}%`;
      }
    };

    xhr.onload = () => {
      if (progressBox) progressBox.classList.add('hidden');
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        if (data.success) {
          // Play confirmation chime
          this.playArrivalChime();
        }
      } else {
        alert('Upload failed: ' + xhr.responseText);
      }
    };

    xhr.onerror = () => {
      if (progressBox) progressBox.classList.add('hidden');
      alert('Upload error. Check network connection.');
    };

    xhr.send(formData);
  }

  // --- BEAM TO PROJECTOR ---
  beamFile(fileId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'beam', fileId }));
    }
  }

  // --- CLEAR ROOM ---
  async clearRoom() {
    if (!this.room) return;
    if (!confirm('Are you sure you want to wipe all files from this session for privacy?')) {
      return;
    }

    try {
      await fetch(`/api/rooms/${this.room.code}/clear`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  }

  leaveRoom() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    this.room = null;
    this.deviceId = null;
    this.switchView('view-selection');
  }

  // --- RENDER ROOM STATE ---
  renderRoomState() {
    if (!this.room) return;
    const files = this.room.files || [];
    const devices = this.room.devices || [];

    // Projector count pill
    const countBadge = document.getElementById('connected-count-badge');
    const phoneCount = devices.filter((d) => d.type === 'phone' || d.type === 'pc').length;
    if (countBadge) {
      countBadge.textContent = `${phoneCount} Device${phoneCount === 1 ? '' : 's'} Connected`;
    }

    // Render Projector Files
    const projFileCount = document.getElementById('proj-file-count');
    if (projFileCount) projFileCount.textContent = files.length;

    const projFilesEmpty = document.getElementById('proj-files-empty');
    const projFilesList = document.getElementById('proj-files-list');

    if (projFilesEmpty && projFilesList) {
      if (files.length === 0) {
        projFilesEmpty.classList.remove('hidden');
        projFilesList.classList.add('hidden');
        projFilesList.innerHTML = '';
      } else {
        projFilesEmpty.classList.add('hidden');
        projFilesList.classList.remove('hidden');
        projFilesList.innerHTML = '';

        files.forEach((file) => {
          const card = document.createElement('div');
          card.className = 'file-card';
          card.onclick = () => this.openPreview(file);

          const isImg = file.mimeType.startsWith('image/');
          const thumbHtml = isImg
            ? `<img src="${file.rawUrl}" alt="${file.name}" />`
            : `<span class="file-thumb-icon">${this.getFileEmoji(file.mimeType)}</span>`;

          card.innerHTML = `
            <div class="file-thumb">${thumbHtml}</div>
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-meta">${this.formatBytes(file.size)} • ${file.uploaderDevice || 'Sender'}</div>
          `;
          projFilesList.appendChild(card);
        });
      }
    }

    // Render Phone Files
    const phoneFileCount = document.getElementById('phone-file-count');
    if (phoneFileCount) phoneFileCount.textContent = files.length;

    const phoneFilesEmpty = document.getElementById('phone-files-empty');
    const phoneFilesList = document.getElementById('phone-files-list');

    if (phoneFilesEmpty && phoneFilesList) {
      if (files.length === 0) {
        phoneFilesEmpty.classList.remove('hidden');
        phoneFilesList.innerHTML = '';
      } else {
        phoneFilesEmpty.classList.add('hidden');
        phoneFilesList.innerHTML = '';

        files.forEach((file) => {
          const item = document.createElement('div');
          item.className = 'phone-file-item';
          item.innerHTML = `
            <div class="phone-file-info">
              <span>${this.getFileEmoji(file.mimeType)}</span>
              <div>
                <div class="phone-file-name" title="${file.name}">${file.name}</div>
                <span class="sub-hint">${this.formatBytes(file.size)}</span>
              </div>
            </div>
            <div class="phone-file-actions">
              <button class="btn btn-sm btn-primary" onclick="app.beamFile('${file.id}')" title="Show on Projector Screen">
                Beam 📽️
              </button>
              <a href="${file.downloadUrl}" class="btn btn-sm btn-outline" download title="Download">
                ⬇️
              </a>
            </div>
          `;
          phoneFilesList.appendChild(item);
        });
      }
    }
  }

  // --- PREVIEW MODAL ---
  openPreview(file) {
    this.activePreviewFile = file;
    this.imgZoom = 1;
    this.imgRotation = 0;

    const modal = document.getElementById('preview-modal');
    const filenameEl = document.getElementById('modal-filename');
    const filesizeEl = document.getElementById('modal-filesize');
    const fileIconEl = document.getElementById('modal-file-icon');
    const downloadBtn = document.getElementById('modal-download-btn');
    const imgControls = document.getElementById('img-controls');
    const bodyEl = document.getElementById('modal-body');

    filenameEl.textContent = file.name;
    filesizeEl.textContent = this.formatBytes(file.size);
    fileIconEl.textContent = this.getFileEmoji(file.mimeType);
    downloadBtn.href = file.downloadUrl;

    const isImg = file.mimeType.startsWith('image/');
    const isPdf = file.mimeType === 'application/pdf';
    const isVideo = file.mimeType.startsWith('video/');
    const isAudio = file.mimeType.startsWith('audio/');

    imgControls.classList.toggle('hidden', !isImg);

    if (isImg) {
      bodyEl.innerHTML = `<img id="preview-img" src="${file.rawUrl}" alt="${file.name}" />`;
    } else if (isPdf) {
      bodyEl.innerHTML = `<iframe src="${file.rawUrl}"></iframe>`;
    } else if (isVideo) {
      bodyEl.innerHTML = `<video controls autoplay style="max-width:100%;max-height:70vh;"><source src="${file.rawUrl}" type="${file.mimeType}"></video>`;
    } else if (isAudio) {
      bodyEl.innerHTML = `<audio controls autoplay style="width:100%;"><source src="${file.rawUrl}" type="${file.mimeType}"></audio>`;
    } else {
      bodyEl.innerHTML = `
        <div style="text-align:center;color:#94a3b8;">
          <div style="font-size:48px;margin-bottom:12px;">📄</div>
          <p>Direct preview not supported for this file type.</p>
          <a href="${file.downloadUrl}" class="btn btn-primary" style="margin-top:16px;">Download to View</a>
        </div>
      `;
    }

    modal.classList.remove('hidden');
  }

  closePreview() {
    const modal = document.getElementById('preview-modal');
    if (modal) modal.classList.add('hidden');
    this.activePreviewFile = null;
  }

  zoomImage(delta) {
    this.imgZoom = Math.max(0.4, Math.min(4, this.imgZoom + delta));
    this.updateImageTransform();
  }

  rotateImage() {
    this.imgRotation = (this.imgRotation + 90) % 360;
    this.updateImageTransform();
  }

  resetZoom() {
    this.imgZoom = 1;
    this.imgRotation = 0;
    this.updateImageTransform();
  }

  updateImageTransform() {
    const img = document.getElementById('preview-img');
    if (img) {
      img.style.transform = `scale(${this.imgZoom}) rotate(${this.imgRotation}deg)`;
    }
  }

  // --- HELPERS ---
  getFileEmoji(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed')) return '🗜️';
    return '📄';
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// Instantiate singleton
window.app = new FileDropperApp();
