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
    getEventsUrl(token) {
      return `${endpoint('events')}?token=${segment(token)}`;
    },
    status(token, options = {}) {
      return fetch(endpoint('status'), withAuth(token, options));
    },
    upload(token, formData, onProgress) {
      if (!onProgress) {
        return fetch(
          endpoint('upload'),
          withAuth(token, {
            method: 'POST',
            body: formData,
          }),
        );
      }
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint('upload'));
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
        xhr.onload = () => {
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            statusText: xhr.statusText,
            text: () => Promise.resolve(xhr.responseText),
            json: () => Promise.resolve(JSON.parse(xhr.responseText || '{}')),
            headers: {
              get: (name) => xhr.getResponseHeader(name),
            },
          });
        };
        xhr.onerror = () => reject(new TypeError('Network request failed'));
        xhr.send(formData);
      });
    },
    preview(token) {
      return fetch(endpoint('preview'), withAuth(token));
    },
    previewUrl(token, fileId) {
      return fetch(
        `${endpoint('files')}/${segment(fileId)}/preview-url`,
        withAuth(token),
      );
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
