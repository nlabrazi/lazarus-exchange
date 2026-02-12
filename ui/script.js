import { API_BASE, LEADER_STORAGE_KEY, POLL_CONFIG, apiOverride } from './scripts/config.js';
import {
  clearSelectedFile,
  getSelectedFile,
  getShareLinkValue,
  logStatus,
  renderExchangeStatus,
  setSessionIdDisplay,
  setShareLinkValue,
  setUserDisplay,
} from './scripts/dom.js';
import { createApiClient } from './scripts/api.js';
import {
  buildShareLink,
  getSessionState,
  initSessionFromUrl,
  resetSessionId,
  rotatePartnerId,
} from './scripts/session.js';
import { createStatusPoller } from './scripts/poller.js';
import { friendlyErrorFromApi } from './scripts/errors.js';

const apiClient = createApiClient(API_BASE);

const statusPoller = createStatusPoller({
  apiClient,
  getSessionState,
  onStatus: renderExchangeStatus,
  onError: logStatus,
  config: POLL_CONFIG,
  leaderStorageKey: LEADER_STORAGE_KEY,
});

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

function refreshSessionUi() {
  const { sessionId, userId } = getSessionState();
  setSessionIdDisplay(sessionId);
  setUserDisplay(userId);

  rotatePartnerId();
  setShareLinkValue(buildShareLink(apiOverride));
}

async function copySessionLink() {
  const link = getShareLinkValue();

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

  const { sessionId, userId } = getSessionState();
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await apiClient.upload(sessionId, userId, formData);

    if (!res.ok) {
      await handleBadResponse('Upload', res);
      return;
    }

    const data = await res.json().catch(() => null);
    if (data?.maxFileMb) {
      logStatus(`📤 File uploaded (max ${data.maxFileMb}MB). Waiting for peer... █`);
    } else {
      logStatus('📤 File uploaded. Waiting for peer... █');
    }

    statusPoller.scheduleSoon(1000);
  } catch (error) {
    devLog('Upload network error', error);
    logStatus('❌ Network error. Please check your connection and try again. █');
  }
}

async function preview() {
  const { sessionId, userId } = getSessionState();

  try {
    const res = await apiClient.preview(sessionId, userId);

    if (!res.ok) {
      await handleBadResponse('Preview', res);
      return;
    }

    const data = await res.json().catch(() => null);

    if (data && data.originalname) {
      logStatus(`👀 Preview of peer file:\n${data.originalname} (${data.size} bytes) █`);
    } else {
      logStatus('⏳ No file from peer yet... █');
    }
  } catch (error) {
    devLog('Preview network error', error);
    logStatus('❌ Network error. Please check your connection and try again. █');
  }
}

async function validate() {
  const { sessionId, userId } = getSessionState();

  try {
    const res = await apiClient.validate(sessionId, userId);

    if (!res.ok) {
      await handleBadResponse('Validation', res);
      return;
    }

    logStatus('✅ Validation sent. Waiting for peer... █');
    statusPoller.scheduleSoon(1000);
  } catch (error) {
    devLog('Validation network error', error);
    logStatus('❌ Network error. Please check your connection and try again. █');
  }
}

async function download() {
  const { sessionId, userId } = getSessionState();

  try {
    const res = await apiClient.download(sessionId, userId);

    if (!res.ok) {
      await handleBadResponse('Download', res);
      return;
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename=\"([^\"]+)\"/i.exec(disposition);
    const filename = match?.[1] || 'exchange_file';

    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    logStatus('⬇️ Download started █');
  } catch (error) {
    devLog('Download network error', error);
    logStatus('❌ Network error. Please check your connection and try again. █');
  }
}

async function resetSession() {
  const { sessionId, userId } = getSessionState();

  try {
    const res = await apiClient.reset(sessionId, userId);
    const data = await res.json().catch(() => null);

    resetSessionId();
    refreshSessionUi();
    clearSelectedFile();
    statusPoller.resetState();
    statusPoller.scheduleSoon(500);

    if (res.ok && data?.success) {
      logStatus('🔄 Session reset. Share the new link with your peer. █');
    } else {
      logStatus('⚠️ No active session on server. New session started. █');
    }
  } catch (error) {
    logStatus(`❌ Reset error: ${error?.message || String(error)} █`);
  }
}

function init() {
  const { sessionId, userId } = initSessionFromUrl();

  refreshSessionUi();
  logStatus(`🧠 You are: ${userId}\n🔐 Session: ${sessionId} █`);

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
