const $ = (id) => document.getElementById(id);

export function setSessionIdDisplay(sessionId) {
  $('sessionIdDisplay').textContent = sessionId;
}

export function setUserDisplay(userId) {
  $('youDisplay').textContent = userId;
}

export function setShareLinkValue(link) {
  $('shareLink').value = link;
}

export function getShareLinkValue() {
  return $('shareLink').value;
}

export function getSelectedFile() {
  return $('fileInput').files[0] || null;
}

export function clearSelectedFile() {
  $('fileInput').value = '';
}

export function logStatus(message) {
  $('statusBox').textContent = message;
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
