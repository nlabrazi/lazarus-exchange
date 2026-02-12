export function friendlyErrorFromApi({ status, text, json }) {
  const raw = text || (json ? JSON.stringify(json) : '');

  if (status === 400) {
    return {
      user: "Invalid request. Please refresh the page and try again.",
      dev: { status, raw },
    };
  }

  if (status === 401) {
    return {
      user: "Unauthorized access. Your session link may be invalid.",
      dev: { status, raw },
    };
  }

  if (status === 403) {
    return {
      user: "Access denied. This session is not valid anymore.",
      dev: { status, raw },
    };
  }

  if (status === 404) {
    return {
      user: "Session not found. It may have expired.",
      dev: { status, raw },
    };
  }

  if (status === 409) {
    return {
      user: "This invite cannot be used because the session already has a peer.",
      dev: { status, raw },
    };
  }

  if (status === 410) {
    return {
      user: "This invite link is no longer valid (expired or already used).",
      dev: { status, raw },
    };
  }

  if (status === 413) {
    return {
      user: "File too large. Please upload a smaller file.",
      dev: { status, raw },
    };
  }

  if (status === 429) {
    return {
      user: "Too many requests. Please wait a few seconds before trying again.",
      dev: { status, raw },
    };
  }

  if (status === 502) {
    return {
      user: "Temporary server issue. Please try again shortly.",
      dev: { status, raw },
    };
  }

  if (status >= 500) {
    return {
      user: "A server error occurred. Please try again later.",
      dev: { status, raw },
    };
  }

  return {
    user: "An unexpected error occurred. Please try again.",
    dev: { status, raw },
  };
}
