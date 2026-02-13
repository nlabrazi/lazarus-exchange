// Cache static DOM nodes once to avoid repeated lookups on each action/poll.
const elements = {
  sessionIdDisplay: document.getElementById('sessionIdDisplay'),
  youDisplay: document.getElementById('youDisplay'),
  shareLink: document.getElementById('shareLink'),
  fileInput: document.getElementById('fileInput'),
  statusBox: document.getElementById('statusBox'),
  toast: document.getElementById('toast'),
};

let toastTimer = null;
let statusTypingTimer = null;
let statusTypingVersion = 0;

function requiredElement(id) {
  const element = elements[id];
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
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
  const my = status.me;
  const peer = status.peer || { uploaded: false, validated: false };

  logStatus(
    `🧑 YOU:    ${my.uploaded ? '✅ Uploaded' : '❌ No file'} | ${
      my.validated ? '✅ Validated' : '⏳ Waiting'
    }\n👤 PEER:   ${peer.uploaded ? '✅ Uploaded' : '❌ No file'} | ${
      peer.validated ? '✅ Validated' : '⏳ Waiting'
    } █`,
  );
}
