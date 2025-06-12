const API = 'http://localhost:3000/exchange';

const $ = id => document.getElementById(id);
let sessionId = '';
let userId = '';
let partnerId = '';

function generateId(prefix = 'u') {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}`;
}

function init() {
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('session') || generateId('s');

  // PART 1: handle userId (from ?user=... or localStorage)
  const urlUserId = params.get('user');
  if (urlUserId) {
    userId = urlUserId;
    localStorage.setItem('lazarusUserId', userId);
  } else {
    userId = localStorage.getItem('lazarusUserId');
    if (!userId) {
      userId = generateId('u');
      localStorage.setItem('lazarusUserId', userId);
    }
  }

  $('sessionIdDisplay').textContent = sessionId;
  $('youDisplay').textContent = userId;

  // PART 2: generate link for partner
  partnerId = generateId('u');
  const shareLink = `${location.origin}${location.pathname}?session=${sessionId}&user=${partnerId}`;
  $('shareLink').value = shareLink;

  log(`🧠 You are: ${userId}\n🔐 Session: ${sessionId} █`);

  pollStatus();
  setInterval(pollStatus, 3000);
}

function log(msg) {
  $('statusBox').textContent = msg;
}

function copySessionLink() {
  const link = $('shareLink').value;
  navigator.clipboard.writeText(link);
  alert('🔗 Link copied to clipboard:\n' + link);
}

async function upload() {
  const file = $('fileInput').files[0];
  if (!file) return log('⚠️ No file selected █');

  const formData = new FormData();
  formData.append('file', file);

  try {
    await fetch(`${API}/upload/${sessionId}/${userId}`, {
      method: 'POST',
      body: formData
    });
    log('📤 File uploaded. Waiting for peer... █');
  } catch (err) {
    log('❌ Upload error: ' + err.message + ' █');
  }
}

async function preview() {
  try {
    const res = await fetch(`${API}/preview/${sessionId}/${userId}`);
    const data = await res.json();
    if (data && data.originalname) {
      log(`👀 Preview of peer file:\n${data.originalname} (${data.size} bytes) █`);
    } else {
      log('⏳ No file from peer yet... █');
    }
  } catch (err) {
    log('❌ Preview error: ' + err.message + ' █');
  }
}

async function validate() {
  try {
    await fetch(`${API}/validate/${sessionId}/${userId}`, {
      method: 'POST'
    });
    log('✅ Validation sent. Waiting for peer... █');
  } catch (err) {
    log('❌ Validation error: ' + err.message + ' █');
  }
}

async function download() {
  try {
    const res = await fetch(`${API}/download/${sessionId}/${userId}`);
    if (res.status !== 200) {
      const err = await res.json();
      return log(`⛔ Cannot download: ${err.error} █`);
    }

    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'exchange_file';
    a.click();

    log('⬇️ Download started █');
  } catch (err) {
    log('❌ Download error: ' + err.message + ' █');
  }
}

async function pollStatus() {
  try {
    const res = await fetch(`${API}/status/${sessionId}/${userId}`);
    const status = await res.json();

    const my = status.me;
    const peer = status.peer || { uploaded: false, validated: false };

    log(
`🧑 YOU:    ${my.uploaded ? '✅ Uploaded' : '❌ No file'} | ${my.validated ? '✅ Validated' : '⏳ Waiting'}\n
👤 PEER:   ${peer.uploaded ? '✅ Uploaded' : '❌ No file'} | ${peer.validated ? '✅ Validated' : '⏳ Waiting'} █`
    );
  } catch (err) {
    log('❌ Polling error: ' + err.message + ' █');
  }
}

window.onload = init;
