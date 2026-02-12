import {
  API_BASE,
  LEADER_STORAGE_KEY,
  POLL_CONFIG,
  apiOverride,
} from './utilities/config.js';
import {
  clearSelectedFile,
  getSelectedFile,
  getShareLinkValue,
  logStatus,
  renderExchangeStatus,
  setSessionIdDisplay,
  setShareLinkValue,
  setUserDisplay,
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

async function handleBadResponse(context, res) {
  const text = await res.text().catch(() => '');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  const { user, dev } = friendlyErrorFromApi({ status: res.status, text, json });
  devLog(`${context} failed`, dev);

  logStatus(`❌ ${user} █`);
}

const apiClient = createApiClient(API_BASE);

const authManager = createAuthManager({
  apiClient,
  handleBadResponse,
  logStatus,
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
    logStatus('⚠️ Share link unavailable right now. █');
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    alert(`🔗 Link copied to clipboard:\n${link}`);
  } catch (error) {
    logStatus(`❌ Clipboard error: ${error?.message || String(error)} █`);
  }
}

async function upload() {
  const file = getSelectedFile();
  if (!file) {
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
  } else {
    logStatus('📤 File uploaded. Waiting for peer... █');
  }

  statusPoller.scheduleSoon(1000);
}

async function preview() {
  const res = await authManager.runAuthedRequest('Preview', (token) =>
    apiClient.preview(token),
  );
  if (!res) return;

  const data = await res.json().catch(() => null);

  if (data && data.originalname) {
    logStatus(`👀 Preview of peer file:\n${data.originalname} (${data.size} bytes) █`);
  } else {
    logStatus('⏳ No file from peer yet... █');
  }
}

async function validate() {
  const res = await authManager.runAuthedRequest('Validation', (token) =>
    apiClient.validate(token),
  );
  if (!res) return;

  logStatus('✅ Validation sent. Waiting for peer... █');
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

  logStatus('⬇️ Download started █');
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
  statusPoller.resetState();
  statusPoller.scheduleSoon(500);

  if (data?.success) {
    logStatus('🔄 Session reset. Share the new link with your peer. █');
  } else {
    logStatus('⚠️ No active session on server. New session started. █');
  }
}

async function init() {
  initSessionFromUrl();

  const ready = await authManager.ensureSessionIdentity();
  if (!ready) return;

  await refreshSessionUi();
  const { sessionId, userId } = getSessionState();
  logStatus(`🧠 You are: ${userId || 'unknown'}\n🔐 Session: ${sessionId || 'unknown'} █`);

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
