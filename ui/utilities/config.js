const params = new URLSearchParams(window.location.search);

function isLoopbackHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function normalizeApiBase(rawValue) {
  if (!rawValue) return '';

  try {
    const parsed = new URL(rawValue, location.origin);
    const isSameOrigin = parsed.origin === location.origin;
    const allowLoopbackOverride =
      isLoopbackHost(location.hostname) && isLoopbackHost(parsed.hostname);

    if (!isSameOrigin && !allowLoopbackOverride) {
      return '';
    }

    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return '';
  }
}

export const apiOverride = normalizeApiBase(params.get('api'));

const defaultApiBase = `${location.origin}/exchange`;

export const API_BASE = apiOverride || defaultApiBase;
export const AUTH_TOKEN_STORAGE_KEY = `lazarus_auth_token_${location.origin}`;

export const LEADER_STORAGE_KEY = `lazarus_poll_leader_${location.origin}`;

export const POLL_CONFIG = Object.freeze({
  minDelayMs: 5000,
  maxDelayMs: 120000,
  hiddenDelayMs: 30000,
  nonLeaderDelayMs: 30000,
  idleIncrementMs: 2000,
  leaderTtlMs: 8000,
  leaderHeartbeatMs: 3000,
  firstPollDelayMs: 500,
  wakeupPollDelayMs: 1000,
});
