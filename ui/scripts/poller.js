export function createStatusPoller({
  apiClient,
  getSessionState,
  onStatus,
  onError,
  config,
  leaderStorageKey,
}) {
  let pollTimer = null;
  let leaderTimer = null;
  let pollDelayMs = config.minDelayMs;
  let lastStatusHash = '';
  let isLeader = false;

  function setPollDelay(ms) {
    pollDelayMs = Math.max(config.minDelayMs, Math.min(config.maxDelayMs, ms));
  }

  function currentBaseDelay() {
    if (document.hidden) return config.hiddenDelayMs;
    return pollDelayMs;
  }

  function hashStatus(status) {
    try {
      return JSON.stringify(status);
    } catch {
      return '';
    }
  }

  function electLeader() {
    const now = Date.now();

    try {
      const current = Number(localStorage.getItem(leaderStorageKey) || '0');
      if (!current || now - current > config.leaderTtlMs) {
        localStorage.setItem(leaderStorageKey, String(now));
        isLeader = true;
      } else {
        isLeader = false;
      }
    } catch {
      // localStorage unavailable: keep polling on this tab
      isLeader = true;
    }
  }

  function startLeaderHeartbeat() {
    electLeader();
    if (leaderTimer) clearInterval(leaderTimer);

    leaderTimer = setInterval(() => {
      if (isLeader) {
        try {
          localStorage.setItem(leaderStorageKey, String(Date.now()));
        } catch {
          // noop
        }
      }
      electLeader();
    }, config.leaderHeartbeatMs);
  }

  function schedule(nextDelay) {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(pollStatus, nextDelay);
  }

  async function pollStatus() {
    if (!isLeader) {
      schedule(config.nonLeaderDelayMs);
      return;
    }

    const { sessionId, userId } = getSessionState();
    if (!sessionId || !userId) {
      schedule(config.nonLeaderDelayMs);
      return;
    }

    try {
      const res = await apiClient.status(sessionId, userId, { cache: 'no-store' });

      if (!res.ok) {
        const backoff = Math.min(config.maxDelayMs, currentBaseDelay() * 2);
        setPollDelay(backoff);
        onError(
          `❌ Polling error: ${res.status} (backoff ${Math.round(backoff / 1000)}s) █`,
        );
        schedule(backoff);
        return;
      }

      const text = await res.text();
      let status = null;

      try {
        status = text ? JSON.parse(text) : null;
      } catch {
        status = null;
      }

      if (!status || !status.me) {
        setPollDelay(Math.min(config.maxDelayMs, currentBaseDelay() + config.idleIncrementMs));
        schedule(currentBaseDelay());
        return;
      }

      const newHash = hashStatus(status);
      const changed = newHash !== lastStatusHash;
      lastStatusHash = newHash;

      onStatus(status);

      if (changed) {
        setPollDelay(config.minDelayMs);
      } else {
        setPollDelay(Math.min(config.maxDelayMs, currentBaseDelay() + config.idleIncrementMs));
      }

      schedule(currentBaseDelay());
    } catch (error) {
      const backoff = Math.min(config.maxDelayMs, currentBaseDelay() * 2);
      setPollDelay(backoff);
      onError(
        `❌ Polling error: ${error?.message || String(error)} (backoff ${Math.round(
          backoff / 1000,
        )}s) █`,
      );
      schedule(backoff);
    }
  }

  function start() {
    startLeaderHeartbeat();
    schedule(config.firstPollDelayMs);
  }

  function stop() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }

    if (leaderTimer) {
      clearInterval(leaderTimer);
      leaderTimer = null;
    }
  }

  function scheduleSoon(delayMs = config.wakeupPollDelayMs) {
    schedule(delayMs);
  }

  function resetState() {
    lastStatusHash = '';
    setPollDelay(config.minDelayMs);
  }

  return {
    start,
    stop,
    scheduleSoon,
    resetState,
  };
}
