// Cache static DOM nodes once to avoid repeated lookups on each action/poll.
const elements = {
  sessionIdDisplay: document.getElementById('sessionIdDisplay'),
  youDisplay: document.getElementById('youDisplay'),
  shareLink: document.getElementById('shareLink'),
  fileInput: document.getElementById('fileInput'),
  statusBox: document.getElementById('statusBox'),
};

function requiredElement(id) {
  const element = elements[id];
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
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
  requiredElement('statusBox').textContent = message;
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
