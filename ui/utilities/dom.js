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
};

let toastTimer = null;
let statusTypingTimer = null;
let statusTypingVersion = 0;
let lastLoggedNormalized = null;

export function clearStatusCache() {
  lastLoggedNormalized = null;
}

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

export function logStatus(message, options = {}) {
  const statusBox = requiredElement('statusBox');
  const normalized = statusMessageWithoutCursor(message);

  if (normalized === lastLoggedNormalized) {
    return;
  }
  lastLoggedNormalized = normalized;

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

  if (!options.animate) {
    draw(normalized);
    return;
  }

  statusTypingVersion += 1;
  const version = statusTypingVersion;
  let index = 0;
  const step = () => {
    if (version !== statusTypingVersion) return;
    index = Math.min(normalized.length, index + 3);
    draw(normalized.slice(0, index));
    if (index < normalized.length) {
      statusTypingTimer = setTimeout(step, 10);
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
  const my = status.me || {
    uploaded: false,
    validated: false,
    downloaded: false,
  };
  const peer = status.peer || null;

  let guidance = '';
  let myLabel = '✍️ No file';
  let peerLabel = 'Waiting to connect';

  if (!peer) {
    myLabel = my.uploaded ? '📤 Uploaded' : 'Ready';
    peerLabel = 'Waiting to connect';
    guidance = '🔗 Waiting for peer to join. Share your invite link above!';
  } else if (
    status.state === 'completed' ||
    (my.downloaded && peer.downloaded)
  ) {
    myLabel = '⬇️ Downloaded';
    peerLabel = '⬇️ Downloaded';
    guidance =
      '🎉 Exchange completed successfully! Both files have been safely retrieved.';
  } else if (
    status.state === 'unlocked' ||
    (my.validated && peer.validated && my.uploaded && peer.uploaded)
  ) {
    myLabel = my.downloaded ? '⬇️ Downloaded' : '🔓 Unlocked';
    peerLabel = peer.downloaded ? '⬇️ Downloaded' : '🔓 Unlocked';
    if (my.downloaded) {
      guidance =
        '⬇️ You have downloaded your file. Waiting for peer to complete download...';
    } else if (peer.downloaded) {
      guidance =
        '👤 Peer downloaded your file. Click DOWNLOAD to retrieve yours!';
    } else {
      guidance =
        "🔓 Exchange unlocked! Click DOWNLOAD to retrieve your peer's file.";
    }
  } else if (my.uploaded && peer.uploaded) {
    if (my.validated && !peer.validated) {
      myLabel = '✅ Validated';
      peerLabel = '⏳ Pending validation';
      guidance =
        '⏳ You validated! Waiting for peer to review preview and validate...';
    } else if (!my.validated && peer.validated) {
      myLabel = '⏳ Pending validation';
      peerLabel = '✅ Validated';
      guidance =
        '👉 Peer has validated! Click PREVIEW to inspect, then VALIDATE to unlock.';
    } else {
      myLabel = '⏳ Ready to validate';
      peerLabel = '⏳ Ready to validate';
      guidance =
        '👀 Both files uploaded! Click PREVIEW to inspect, then VALIDATE when ready.';
    }
  } else if (my.uploaded && !peer.uploaded) {
    myLabel = '📤 Uploaded';
    peerLabel = '✍️ Upload pending';
    guidance = '📤 Your file is uploaded. Waiting for peer to upload theirs...';
  } else if (!my.uploaded && peer.uploaded) {
    myLabel = '✍️ Upload needed';
    peerLabel = '📤 Uploaded';
    guidance =
      '👉 Peer has uploaded a file! Please select and upload your file to continue.';
  } else {
    myLabel = '✍️ No file';
    peerLabel = '👤 Connected';
    guidance = '👋 Peer joined! Both users can now select and upload a file.';
  }

  logStatus(`🧑 You: ${myLabel}  •  👤 Peer: ${peerLabel}\n${guidance} █`);
}
