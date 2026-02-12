function segment(value) {
  return encodeURIComponent(value);
}

export function createApiClient(baseUrl) {
  const endpoint = (action, sessionId, userId) =>
    `${baseUrl}/${action}/${segment(sessionId)}/${segment(userId)}`;

  return {
    status(sessionId, userId, options = {}) {
      return fetch(endpoint('status', sessionId, userId), options);
    },
    upload(sessionId, userId, formData) {
      return fetch(endpoint('upload', sessionId, userId), {
        method: 'POST',
        body: formData,
      });
    },
    preview(sessionId, userId) {
      return fetch(endpoint('preview', sessionId, userId));
    },
    validate(sessionId, userId) {
      return fetch(endpoint('validate', sessionId, userId), { method: 'POST' });
    },
    download(sessionId, userId) {
      return fetch(endpoint('download', sessionId, userId));
    },
    reset(sessionId, userId) {
      return fetch(endpoint('reset', sessionId, userId), { method: 'POST' });
    },
  };
}
