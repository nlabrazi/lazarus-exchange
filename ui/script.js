const params = new URLSearchParams(window.location.search);
const apiOverride = params.get('api');

const isLocal =
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.hostname === '::1';

const defaultApi = isLocal
  ? 'http://localhost:3000/exchange'
  : `${location.origin}/exchange`;

const API = apiOverride || defaultApi;

const $ = (id) => document.getElementById(id);
let sessionId = '';
let userId = '';
let partnerId = '';

function generateId(prefix = 'u') {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}`;
}

function init() {
  const params = new URLSearchParams(window.location.search);
  sessionId = params.get('session') || generateId('s');

  // userId vient soit de l'URL (?user=...), soit généré
  const urlUserId = params.get('user');
  userId = urlUserId || generateId('u');

  updateSessionUI();

  log(`🧠 You are: ${userId}\n🔐 Session: ${sessionId} █`);

  pollStatus();
  setInterval(pollStatus, 3000);
}

function updateSessionUI() {
  $('sessionIdDisplay').textContent = sessionId;
  $('youDisplay').textContent = userId;

  partnerId = generateId('u');

  const base = `${location.origin}${location.pathname}`;
  const shareLink = `${base}?session=${sessionId}&user=${partnerId}${
    apiOverride ? `&api=${encodeURIComponent(apiOverride)}` : ''
  }`;
  $('shareLink').value = shareLink;
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
    const res = await fetch(`${API}/upload/${sessionId}/${userId}`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return log(`❌ Upload failed (${res.status}): ${text || 'error'} █`);
    }

    const data = await res.json().catch(() => null);
    if (data?.maxFileMb) {
      log(`📤 File uploaded (max ${data.maxFileMb}MB). Waiting for peer... █`);
    } else {
      log('📤 File uploaded. Waiting for peer... █');
    }
  } catch (err) {
    log('❌ Upload error: ' + (err?.message || String(err)) + ' █');
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
    log('❌ Preview error: ' + (err?.message || String(err)) + ' █');
  }
}

async function validate() {
  try {
    await fetch(`${API}/validate/${sessionId}/${userId}`, {
      method: 'POST',
    });
    log('✅ Validation sent. Waiting for peer... █');
  } catch (err) {
    log('❌ Validation error: ' + (err?.message || String(err)) + ' █');
  }
}

async function download() {
  try {
    const res = await fetch(`${API}/download/${sessionId}/${userId}`);
    if (res.status !== 200) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return log(`⛔ Cannot download: ${err.error} █`);
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename=\"([^\"]+)\"/i.exec(disposition);
    const filename = match?.[1] || 'exchange_file';

    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    log('⬇️ Download started █');
  } catch (err) {
    log('❌ Download error: ' + (err?.message || String(err)) + ' █');
  }
}

async function resetSession() {
  try {
    const res = await fetch(`${API}/reset/${sessionId}/${userId}`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => null);

    sessionId = generateId('s');
    updateSessionUI();
    $('fileInput').value = '';

    if (res.ok && data?.success) {
      log('🔄 Session reset. Share the new link with your peer. █');
    } else {
      log('⚠️ No active session on server. New session started. █');
    }
  } catch (err) {
    log('❌ Reset error: ' + (err?.message || String(err)) + ' █');
  }
}

async function pollStatus() {
  try {
    const res = await fetch(`${API}/status/${sessionId}/${userId}`);
    if (!res.ok) {
      return log(`❌ Polling error: ${res.status} █`);
    }

    const text = await res.text();
    if (!text) {
      return log('⏳ Waiting for activity... █');
    }

    let status = null;
    try {
      status = JSON.parse(text);
    } catch (err) {
      return log('⏳ Waiting for activity... █');
    }

    if (!status || !status.me) {
      return log('⏳ Waiting for activity... █');
    }

    const my = status.me;
    const peer = status.peer || { uploaded: false, validated: false };

    log(
      `🧑 YOU:    ${my.uploaded ? '✅ Uploaded' : '❌ No file'} | ${
        my.validated ? '✅ Validated' : '⏳ Waiting'
      }\n
👤 PEER:   ${peer.uploaded ? '✅ Uploaded' : '❌ No file'} | ${
        peer.validated ? '✅ Validated' : '⏳ Waiting'
      } █`,
    );
  } catch (err) {
    log('❌ Polling error: ' + (err?.message || String(err)) + ' █');
  }
}

window.onload = init;
