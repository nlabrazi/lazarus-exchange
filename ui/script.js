import {
  API_BASE,
  LEADER_STORAGE_KEY,
  POLL_CONFIG,
  apiOverride,
} from './utilities/config.js';
import {
  clearPreviewImage,
  clearSelectedFile,
  getSelectedFile,
  getShareLinkValue,
  logStatus,
  renderExchangeStatus,
  setSessionIdDisplay,
  setShareLinkValue,
  setPreviewImage,
  setUserDisplay,
  showToast,
} from './utilities/dom.js';
import { createApiClient } from './utilities/api.js';
import {
  buildShareLink,
  getSessionState,
  initSessionFromUrl,
} from './utilities/session.js';
import { createStatusPoller } from './utilities/poller.js';
import { friendlyErrorFromApi } from './utilities/errors.js';
import { createAuthManager } from './utilities/auth.js';

const DEBUG =
  location.hostname === 'localhost' ||
  new URLSearchParams(location.search).get('debug') === '1';

function devLog(...args) {
  if (DEBUG) console.log('[lazarus]', ...args);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function bindPreviewImageEvents() {
  const previewImage = document.getElementById('previewImage');
  if (!previewImage) return;
  previewImage.addEventListener('error', () => {
    showToast('Preview URL expired. Click PREVIEW to refresh.', 'error');
    logStatus('⚠️ Preview URL expired. Click PREVIEW to refresh. █');
  });
}

async function handleBadResponse(context, res) {
  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  const { user, dev } = friendlyErrorFromApi({ status: res.status, text, json });
  devLog(`${context} failed`, dev);

  showToast(user, 'error');
  logStatus(`❌ ${user} █`);
}

const apiClient = createApiClient(API_BASE);

const authManager = createAuthManager({
  apiClient,
  handleBadResponse,
  logStatus,
  showToast,
  devLog,
});

const statusPoller = createStatusPoller({
  apiClient,
  getAuthToken: authManager.getAuthToken,
  onStatus: renderExchangeStatus,
  onError: logStatus,
  config: POLL_CONFIG,
  leaderStorageKey: LEADER_STORAGE_KEY,
});

async function refreshSessionUi() {
  const { sessionId, userId } = getSessionState();
  setSessionIdDisplay(sessionId || '-');
  setUserDisplay(userId || '-');

  const res = await authManager.runAuthedRequest('Share link', (token) =>
    apiClient.createInvite(token),
  );
  if (!res) {
    setShareLinkValue('');
    return;
  }

  const data = await res.json().catch(() => null);
  setShareLinkValue(buildShareLink(data?.inviteCode || '', apiOverride));
}

async function copySessionLink() {
  const link = getShareLinkValue();
  if (!link) {
    showToast('Share link unavailable right now.', 'error');
    logStatus('⚠️ Share link unavailable right now. █');
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    showToast('Share link copied to clipboard.', 'success');
  } catch (error) {
    showToast('Unable to copy link. Clipboard access failed.', 'error');
    logStatus(`❌ Clipboard error: ${error?.message || String(error)} █`);
  }
}

async function upload() {
  const file = getSelectedFile();
  if (!file) {
    showToast('No file selected.', 'error');
    logStatus('⚠️ No file selected █');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await authManager.runAuthedRequest('Upload', (token) =>
    apiClient.upload(token, formData),
  );
  if (!res) return;

  const data = await res.json().catch(() => null);
  if (data?.maxFileMb) {
    logStatus(`📤 File uploaded (max ${data.maxFileMb}MB). Waiting for peer... █`);
    showToast(`Upload complete (max ${data.maxFileMb}MB). Waiting for peer.`, 'success');
  } else {
    logStatus('📤 File uploaded. Waiting for peer... █');
    showToast('File uploaded. Waiting for peer.', 'success');
  }

  statusPoller.scheduleSoon(1000);
}

async function preview() {
  const res = await authManager.runAuthedRequest('Preview', (token) =>
    apiClient.preview(token),
  );
  if (!res) return;

  const data = await res.json().catch(() => null);

  if (!data || !data.fileId) {
    clearPreviewImage('No preview loaded yet.');
    logStatus('⏳ No file from peer yet... █');
    showToast('No file from peer yet.', 'error');
    return;
  }

  if (data.previewStatus !== 'ready') {
    clearPreviewImage('Preview is still processing.');
    logStatus('⏳ Peer preview is still processing... █');
    showToast('Peer preview is still processing.', 'error');
    return;
  }

  const previewUrlRes = await authManager.runAuthedRequest('Preview URL', (token) =>
    apiClient.previewUrl(token, data.fileId),
  );
  if (!previewUrlRes) return;

  const previewPayload = await previewUrlRes.json().catch(() => null);
  if (!previewPayload?.previewUrl) {
    clearPreviewImage('Preview URL unavailable.');
    logStatus('⚠️ Preview URL unavailable █');
    showToast('Preview URL unavailable.', 'error');
    return;
  }

  const caption = `${data.originalname} • ${formatBytes(data.size)} • ${data.mimetype}`;
  setPreviewImage(previewPayload.previewUrl, caption);
  logStatus(`👀 Secure preview loaded:\n${data.originalname} (${formatBytes(data.size)}) █`);
  showToast(`Preview ready: ${data.originalname}`, 'success');
}

async function validate() {
  const res = await authManager.runAuthedRequest('Validation', (token) =>
    apiClient.validate(token),
  );
  if (!res) return;

  logStatus('✅ Validation sent. Waiting for peer... █');
  showToast('Validation sent. Waiting for peer.', 'success');
  statusPoller.scheduleSoon(1000);
}

async function download() {
  const res = await authManager.runAuthedRequest('Download', (token) =>
    apiClient.download(token),
  );
  if (!res) return;

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename=\"([^\"]+)\"/i.exec(disposition);
  const filename = match?.[1] || 'exchange_file';

  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  logStatus('⬇️ Download started █');
  showToast(`Download started: ${filename}`, 'success');
}

async function resetSession() {
  const res = await authManager.runAuthedRequest('Reset', (token) =>
    apiClient.reset(token),
  );
  if (!res) return;
  const data = await res.json().catch(() => null);

  const created = await authManager.issueFreshToken();
  if (!created) return;

  await refreshSessionUi();
  clearSelectedFile();
  clearPreviewImage('Session reset. No preview loaded yet.');
  statusPoller.resetState();
  statusPoller.scheduleSoon(500);

  if (data?.success) {
    logStatus('🔄 Session reset. Share the new link with your peer. █');
    showToast('Session reset. Share the new link with your peer.', 'success');
  } else {
    logStatus('⚠️ No active session on server. New session started. █');
    showToast('No active session found. New session started.', 'success');
  }
}

async function init() {
  initSessionFromUrl();
  bindPreviewImageEvents();

  const ready = await authManager.ensureSessionIdentity();
  if (!ready) return;

  await refreshSessionUi();
  clearPreviewImage();
  const { sessionId, userId } = getSessionState();
  logStatus(`🧑 You are: ${userId || '-'}\n🔐 Session: ${sessionId || '-'} █`);

  document.addEventListener('visibilitychange', () => {
    statusPoller.scheduleSoon();
  });

  statusPoller.start();
}

window.copySessionLink = copySessionLink;
window.upload = upload;
window.preview = preview;
window.validate = validate;
window.download = download;
window.resetSession = resetSession;
window.addEventListener('beforeunload', () => statusPoller.stop());
window.addEventListener('load', init);
