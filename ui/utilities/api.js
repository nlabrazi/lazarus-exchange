function segment(value) {
  return encodeURIComponent(value);
}

function withAuth(token, init = {}) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

export function createApiClient(baseUrl) {
  const endpoint = (action) => `${baseUrl}/${action}`;

  return {
    createToken() {
      return fetch(endpoint('auth/new'), { method: 'POST' });
    },
    createInvite(token) {
      return fetch(endpoint('invite'), withAuth(token, { method: 'POST' }));
    },
    acceptInvite(inviteCode) {
      return fetch(`${endpoint('invite/accept')}/${segment(inviteCode)}`, {
        method: 'POST',
      });
    },
    status(token, options = {}) {
      return fetch(endpoint('status'), withAuth(token, options));
    },
    upload(token, formData) {
      return fetch(endpoint('upload'), withAuth(token, {
        method: 'POST',
        body: formData,
      }));
    },
    preview(token) {
      return fetch(endpoint('preview'), withAuth(token));
    },
    validate(token) {
      return fetch(endpoint('validate'), withAuth(token, { method: 'POST' }));
    },
    download(token) {
      return fetch(endpoint('download'), withAuth(token));
    },
    reset(token) {
      return fetch(endpoint('reset'), withAuth(token, { method: 'POST' }));
    },
  };
}
