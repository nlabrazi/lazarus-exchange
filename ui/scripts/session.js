const sessionState = {
  sessionId: '',
  userId: '',
  partnerId: '',
};

function generateId(prefix = 'u') {
  return `${prefix}_${Math.random().toString(36).substring(2, 8)}`;
}

export function initSessionFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  sessionState.sessionId = params.get('session') || generateId('s');
  sessionState.userId = params.get('user') || generateId('u');
  sessionState.partnerId = generateId('u');
  return getSessionState();
}

export function rotatePartnerId() {
  sessionState.partnerId = generateId('u');
  return sessionState.partnerId;
}

export function resetSessionId() {
  sessionState.sessionId = generateId('s');
  sessionState.partnerId = generateId('u');
  return getSessionState();
}

export function getSessionState() {
  return { ...sessionState };
}

export function buildShareLink(apiOverride) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}?session=${sessionState.sessionId}&user=${sessionState.partnerId}${
    apiOverride ? `&api=${encodeURIComponent(apiOverride)}` : ''
  }`;
}
