/** A duplicated browser tab inherits sessionStorage, so claim the scope before any API request. */
type SessionWindow = Window & { __workspaceSessionPromises?: Record<string, Promise<string>> };

export function createWorkspaceSession(storageKey: string): Promise<string> {
  const page = window as SessionWindow;
  const sessions = page.__workspaceSessionPromises ??= {};
  return sessions[storageKey] ??= claimWorkspaceSession(storageKey);
}

async function claimWorkspaceSession(storageKey: string): Promise<string> {
  const freshScope = () => crypto.randomUUID();
  let scope: string;
  let inherited = false;
  try {
    const stored = sessionStorage.getItem(storageKey);
    inherited = Boolean(stored);
    scope = stored || freshScope();
    if (!stored) sessionStorage.setItem(storageKey, scope);
  } catch {
    scope = freshScope();
  }

  const lockClaim = await reserveScopeLock(storageKey, scope);
  if (lockClaim !== null) {
    if (!lockClaim) {
      scope = freshScope();
      try { sessionStorage.setItem(storageKey, scope); } catch { /* private mode */ }
      await reserveScopeLock(storageKey, scope);
    }
    return scope;
  }

  if (typeof BroadcastChannel === 'undefined') return scope;

  const channel = new BroadcastChannel(`${storageKey}_claims`);
  const instance = freshScope();
  const probe = freshScope();
  let occupied = false;

  channel.onmessage = ({ data }) => {
    if (!data || data.scope !== scope || data.instance === instance) return;
    if (data.type === 'probe') {
      channel.postMessage({ type: 'occupied', scope, probe: data.probe, instance });
    } else if (data.type === 'occupied' && data.probe === probe) {
      occupied = true;
    }
  };

  if (!inherited) return Promise.resolve(scope);

  channel.postMessage({ type: 'probe', scope, probe, instance });
  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (occupied) {
        scope = freshScope();
        try { sessionStorage.setItem(storageKey, scope); } catch { /* private mode */ }
      }
      resolve(scope);
    }, 250);
  });
}

async function reserveScopeLock(storageKey: string, scope: string): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.locks) return null;
  return new Promise((resolve) => {
    navigator.locks.request(`workspace-session:${storageKey}:${scope}`, { ifAvailable: true }, async (lock) => {
      resolve(Boolean(lock));
      if (lock) await new Promise<void>(() => {});
    }).catch(() => resolve(null));
  });
}
