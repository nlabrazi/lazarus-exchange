// Cache static DOM nodes once to avoid repeated lookups on each action/poll.
const elements = {
  sessionIdDisplay: document.getElementById('sessionIdDisplay'),
  youDisplay: document.getElementById('youDisplay'),
  shareLink: document.getElementById('shareLink'),
  fileInput: document.getElementById('fileInput'),
  statusBox: document.getElementById('statusBox'),
  previewImage: document.getElementById('previewImage'),
  previewCaption: document.getElementById('previewCaption'),
  toast: document.getElementById('toast'),
  dropzone: document.getElementById('dropzone'),
  dropzoneText: document.getElementById('dropzoneText'),
  uploadProgress: document.getElementById('uploadProgress'),
  uploadProgressBar: document.getElementById('uploadProgressBar'),
  uploadProgressText: document.getElementById('uploadProgressText'),
  stepper: document.getElementById('stepper'),
  mySha256: document.getElementById('mySha256'),
  peerSha256: document.getElementById('peerSha256'),
  countdownBanner: document.getElementById('countdownBanner'),
  countdownText: document.getElementById('countdownText'),
};

let toastTimer = null;
let statusTypingTimer = null;
let statusTypingVersion = 0;
let countdownTimer = null;

function requiredElement(id) {
  const element = elements[id];
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function createBlinkingCursor() {
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  cursor.textContent = '█';
  return cursor;
}

function statusMessageWithoutCursor(message) {
  if (typeof message !== 'string') return '';
  return message.replace(/\s*█\s*$/, '');
}

export function setSessionIdDisplay(sessionId) {
  requiredElement('sessionIdDisplay').textContent = sessionId;
}

export function setUserDisplay(userId) {
  requiredElement('youDisplay').textContent = userId;
}

export function setShareLinkValue(link) {
  requiredElement('shareLink').value = link;
}

export function getShareLinkValue() {
  return requiredElement('shareLink').value;
}

export function getSelectedFile() {
  const input = requiredElement('fileInput');
  return input.files?.[0] || null;
}

export function clearSelectedFile() {
  requiredElement('fileInput').value = '';
  setDropzoneFileName(null);
}

export function setDropzoneFileName(name, size) {
  const text = elements.dropzoneText;
  if (!text) return;
  if (!name) {
    text.innerHTML = 'Drop file here or <u>browse</u>';
    return;
  }
  const sizeStr = typeof size === 'number' ? ` (${formatBytes(size)})` : '';
  text.innerHTML = `<strong>${name}</strong>${sizeStr}`;
}

export function initDropzone(onFileSelected) {
  const dropzone = elements.dropzone;
  const fileInput = elements.fileInput;
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      fileInput.files = files;
      setDropzoneFileName(files[0].name, files[0].size);
      if (typeof onFileSelected === 'function') {
        onFileSelected(files[0]);
      }
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      setDropzoneFileName(file.name, file.size);
      if (typeof onFileSelected === 'function') {
        onFileSelected(file);
      }
    } else {
      setDropzoneFileName(null);
    }
  });
}

export function setUploadProgress(percent) {
  const container = elements.uploadProgress;
  const bar = elements.uploadProgressBar;
  const text = elements.uploadProgressText;
  if (!container || !bar || !text) return;

  if (percent === null || percent === undefined) {
    container.hidden = true;
    bar.style.width = '0%';
    text.textContent = '0%';
    return;
  }

  container.hidden = false;
  const bounded = Math.min(100, Math.max(0, percent));
  bar.style.width = `${bounded}%`;
  text.textContent = `${bounded}%`;
}

export function updateStepper(_state, status = {}) {
  const stepper = elements.stepper;
  if (!stepper) return;

  let currentStep = 1;
  const my = status.me || {};
  const peer = status.peer;

  if (!peer) {
    currentStep = 1;
  } else if (!my.uploaded || !peer.uploaded) {
    currentStep = 2;
  } else if (!my.validated || !peer.validated) {
    currentStep = peer.previewReady ? 4 : 3;
  } else {
    currentStep = 5;
  }

  const steps = stepper.querySelectorAll('.step');
  steps.forEach((stepEl) => {
    const stepNum = Number(stepEl.dataset.step);
    if (stepNum < currentStep) {
      stepEl.classList.remove('is-active');
      stepEl.classList.add('is-completed');
    } else if (stepNum === currentStep) {
      stepEl.classList.remove('is-completed');
      stepEl.classList.add('is-active');
    } else {
      stepEl.classList.remove('is-active', 'is-completed');
    }
  });
}

export function updateSha256(myHash, peerHash) {
  const myEl = elements.mySha256;
  const peerEl = elements.peerSha256;
  if (myEl) {
    myEl.textContent = myHash || '-';
    myEl.title = myHash || '';
  }
  if (peerEl) {
    peerEl.textContent = peerHash || '-';
    peerEl.title = peerHash || '';
  }
}

export function updateCountdown(expiresAt) {
  const banner = elements.countdownBanner;
  const text = elements.countdownText;
  if (!banner || !text) return;

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  if (!expiresAt) {
    banner.hidden = true;
    return;
  }

  const targetTime = new Date(expiresAt).getTime();

  const tick = () => {
    const diff = targetTime - Date.now();
    if (diff <= 0) {
      banner.hidden = false;
      text.textContent = 'Grace period ended - session may be reset';
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      return;
    }
    banner.hidden = false;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    text.textContent = `Auto-destruct locked for: ${mins}:${secs.toString().padStart(2, '0')}`;
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

export function setPreviewImage(url, caption = '') {
  const image = requiredElement('previewImage');
  const previewCaption = requiredElement('previewCaption');
  image.src = url;
  image.hidden = false;
  image.alt = caption || 'Secure blurred preview';
  previewCaption.textContent = caption || 'Preview loaded.';
}

export function clearPreviewImage(caption = 'No preview loaded yet.') {
  const image = requiredElement('previewImage');
  const previewCaption = requiredElement('previewCaption');
  image.removeAttribute('src');
  image.hidden = true;
  image.alt = 'Secure blurred preview from peer file';
  previewCaption.textContent = caption;
}

export function logStatus(message) {
  const statusBox = requiredElement('statusBox');
  const normalized = statusMessageWithoutCursor(message);
  statusTypingVersion += 1;
  const version = statusTypingVersion;

  if (statusTypingTimer) {
    clearTimeout(statusTypingTimer);
    statusTypingTimer = null;
  }

  const draw = (content) => {
    statusBox.replaceChildren(
      document.createTextNode(content),
      createBlinkingCursor(),
    );
  };

  if (!normalized) {
    draw('');
    return;
  }

  // Keep the retro typing effect short so frequent poll updates stay responsive.
  const shouldType = normalized.length <= 180;
  if (!shouldType) {
    draw(normalized);
    return;
  }

  let index = 0;
  const step = () => {
    if (version !== statusTypingVersion) return;
    index = Math.min(normalized.length, index + 2);
    draw(normalized.slice(0, index));
    if (index < normalized.length) {
      statusTypingTimer = setTimeout(step, 14);
    }
  };

  step();
}

export function showToast(message, variant = 'success') {
  const toast = requiredElement('toast');
  toast.textContent = message;
  toast.dataset.variant = variant;
  toast.classList.add('is-visible');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2200);
}

export function renderExchangeStatus(status) {
  if (!status) return;
  const my = status.me || { uploaded: false, validated: false };
  const peer = status.peer || { uploaded: false, validated: false };

  updateStepper(status.state, status);
  updateSha256(my.sha256, peer.sha256);
  updateCountdown(status.gracePeriodExpiresAt);

  const validationState = (entry) => {
    if (!entry.uploaded) return '✍️ Upload required';
    return entry.validated ? '✅ Validated' : '⏳ Waiting validation';
  };

  const describe = (entry) =>
    `${entry.uploaded ? '📤 Uploaded' : '📭 No upload'} • ${
      entry.previewReady ? '👀 Preview ready' : '🛠️ Preview pending'
    } • ${validationState(entry)}`;

  logStatus(`🧑 You: ${describe(my)}\n👤 Peer: ${describe(peer)} █`);
}
