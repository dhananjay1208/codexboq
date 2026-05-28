const SESSION_KEY = "boqai.session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

export type DemoSession = {
  username: string;
  expires_at: string;
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function login(username: string, password: string) {
  if (username !== "demo" || password !== "demo") {
    return null;
  }

  const session: DemoSession = {
    username,
    expires_at: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  };

  getStorage()?.setItem(SESSION_KEY, JSON.stringify(session));

  return session;
}

export function getSession() {
  const value = getStorage()?.getItem(SESSION_KEY);

  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value) as DemoSession;

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      logout();
      return null;
    }

    return session;
  } catch {
    logout();
    return null;
  }
}

export function logout() {
  getStorage()?.removeItem(SESSION_KEY);
}
