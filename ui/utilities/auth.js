import { AUTH_TOKEN_STORAGE_KEY } from './config.js';
import {
  clearAuthToken,
  clearInviteCode,
  getAuthToken as getSessionAuthToken,
  getInviteCode,
  setAuthToken,
} from './session.js';

function replaceInvitePathInHistory() {
  const joinIndex = location.pathname.lastIndexOf('/join/');
  if (joinIndex < 0) return;

  const basePath = location.pathname.slice(0, joinIndex) || '/';
  const nextUrl = `${basePath}${location.search || ''}${location.hash || ''}`;
  history.replaceState(null, '', nextUrl);
}

export function createAuthManager({
  apiClient,
  handleBadResponse,
  logStatus,
  showToast = () => {},
  devLog = () => {},
}) {
  function loadStoredAuthToken() {
    try {
      return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function saveStoredAuthToken(token) {
    try {
      // Keep auth in localStorage to survive refreshes without rejoining session.
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } catch {
      // noop
    }
  }

  function clearStoredAuthToken() {
    try {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // noop
    }
  }

  function clearAuthState() {
    clearAuthToken();
    clearStoredAuthToken();
  }

  function applyAuthToken(token, { persist = true } = {}) {
    if (!setAuthToken(token)) return false;
    if (persist) saveStoredAuthToken(token);
    return true;
  }

  async function processBadResponse(context, res) {
    await handleBadResponse(context, res);
    if (res.status === 401) {
      clearAuthState();
    }
  }

  function getAuthToken() {
    return getSessionAuthToken();
  }

  function getAuthTokenOrWarn() {
    const authToken = getSessionAuthToken();
    if (!authToken) {
      showToast('Session token missing. Refresh and retry.', 'error');
      logStatus('❌ Session token missing. Refresh and retry. █');
      return null;
    }
    return authToken;
  }

  async function issueFreshToken() {
    const res = await apiClient.createToken();
    if (!res.ok) {
      await processBadResponse('Session init', res);
      return false;
    }

    const data = await res.json().catch(() => null);
    if (!data?.token || !applyAuthToken(data.token)) {
      showToast('Invalid session token received from server.', 'error');
      logStatus('❌ Invalid session token received from server. █');
      return false;
    }

    return true;
  }

  async function acceptInviteIfPresent() {
    const inviteCode = getInviteCode();
    if (!inviteCode) return false;

    const res = await apiClient.acceptInvite(inviteCode);
    if (!res.ok) {
      await processBadResponse('Invite accept', res);
      return false;
    }

    const data = await res.json().catch(() => null);
    if (!data?.token || !applyAuthToken(data.token)) {
      showToast('Invalid token returned from invite accept.', 'error');
      logStatus('❌ Invalid token returned from invite accept. █');
      return false;
    }

    clearInviteCode();
    replaceInvitePathInHistory();
    return true;
  }

  async function ensureSessionIdentity() {
    const inviteCode = getInviteCode();
    if (inviteCode) {
      return acceptInviteIfPresent();
    }

    const storedToken = loadStoredAuthToken();
    if (storedToken) {
      if (applyAuthToken(storedToken, { persist: false })) {
        return true;
      }
      clearAuthState();
    }

    return issueFreshToken();
  }

  async function runAuthedRequest(context, requestFn) {
    // Centralize auth/error handling so action handlers stay small and predictable.
    const authToken = getAuthTokenOrWarn();
    if (!authToken) return null;

    try {
      const res = await requestFn(authToken);
      if (!res.ok) {
        await processBadResponse(context, res);
        return null;
      }
      return res;
    } catch (error) {
      devLog(`${context} network error`, error);
      showToast('Network error. Please check your connection and try again.', 'error');
      logStatus('❌ Network error. Please check your connection and try again. █');
      return null;
    }
  }

  return {
    ensureSessionIdentity,
    getAuthToken,
    issueFreshToken,
    runAuthedRequest,
  };
}
