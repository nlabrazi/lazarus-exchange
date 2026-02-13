const sessionState = {
  authToken: '',
  sessionId: '',
  userId: '',
  inviteCode: '',
};

const JOIN_SEGMENT = '/join/';

function isSessionId(value) {
  return typeof value === 'string' && /^s_[a-z0-9]+$/i.test(value);
}

function isUserId(value) {
  return typeof value === 'string' && /^u_[a-z0-9]+$/i.test(value);
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;

    const payloadPart = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = `${payloadPart}${'='.repeat((4 - (payloadPart.length % 4)) % 4)}`;
    const parsed = JSON.parse(atob(padded));

    if (!parsed || parsed.v !== 1) return null;
    if (!isSessionId(parsed.s) || !isUserId(parsed.u)) return null;
    if (typeof parsed.exp !== 'number' || typeof parsed.iat !== 'number') return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= parsed.exp) return null;
    if (parsed.iat > nowSec + 60) return null;

    return { sessionId: parsed.s, userId: parsed.u };
  } catch {
    return null;
  }
}

function applyToken(token) {
  const decoded = decodeJwtPayload(token);
  sessionState.authToken = token;
  sessionState.sessionId = decoded?.sessionId || '';
  sessionState.userId = decoded?.userId || '';
  return Boolean(decoded);
}

function getInviteCodeFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/\/join\/([^/]+)\/?$/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function normalizeBasePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return `/${pathname.replace(/^\/+|\/+$/g, '')}`;
}

function getBasePath(pathname = window.location.pathname) {
  const joinIndex = pathname.lastIndexOf(JOIN_SEGMENT);
  if (joinIndex >= 0) {
    const prefix = pathname.slice(0, joinIndex);
    return normalizeBasePath(prefix || '/');
  }

  if (pathname.endsWith('/index.html')) {
    return normalizeBasePath(pathname.slice(0, -'/index.html'.length));
  }

  return normalizeBasePath(pathname);
}

export function initSessionFromUrl(locationLike = window.location) {
  // URL only carries the short invite code; auth token stays client-side.
  const inviteCode = getInviteCodeFromPath(locationLike.pathname || '');
  sessionState.inviteCode = inviteCode || '';
  sessionState.authToken = '';
  sessionState.sessionId = '';
  sessionState.userId = '';
  return getSessionState();
}

export function setAuthToken(token) {
  if (!token || typeof token !== 'string') return false;
  return applyToken(token);
}

export function clearAuthToken() {
  sessionState.authToken = '';
  sessionState.sessionId = '';
  sessionState.userId = '';
}

export function getInviteCode() {
  return sessionState.inviteCode || '';
}

export function clearInviteCode() {
  sessionState.inviteCode = '';
}

export function getSessionState() {
  return { ...sessionState };
}

export function getAuthToken() {
  return sessionState.authToken;
}

export function buildShareLink(inviteCode, apiOverride) {
  if (!inviteCode) return '';
  const basePath = getBasePath(location.pathname);
  const encodedCode = encodeURIComponent(inviteCode);
  const base = `${location.origin}${basePath === '/' ? '' : basePath}/join/${encodedCode}`;
  return `${base}${
    apiOverride ? `?api=${encodeURIComponent(apiOverride)}` : ''
  }`;
}
