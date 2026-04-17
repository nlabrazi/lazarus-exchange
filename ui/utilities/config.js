const params = new URLSearchParams(window.location.search);

export const apiOverride = params.get('api');

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
