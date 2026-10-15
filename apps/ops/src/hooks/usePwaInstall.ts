import { useSyncExternalStore } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallState = { canPrompt: boolean; installed: boolean };
const subscribers = new Set<() => void>();
let deferredPrompt: InstallPromptEvent | null = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

let state: InstallState = { canPrompt: false, installed: isStandalone() };

function update(next: InstallState) {
  if (state.canPrompt === next.canPrompt && state.installed === next.installed) return;
  state = next;
  subscribers.forEach((subscriber) => subscriber());
}

// Capture the browser prompt before the auth page or its button mounts.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  update({ canPrompt: true, installed: false });
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  update({ canPrompt: false, installed: true });
});
window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
  update({ canPrompt: Boolean(deferredPrompt), installed: isStandalone() });
});

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

async function install() {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  deferredPrompt = null;
  update({ canPrompt: false, installed: state.installed });
  await prompt.prompt();
  return (await prompt.userChoice).outcome === 'accepted';
}

export default function usePwaInstall() {
  const { canPrompt, installed } = useSyncExternalStore(subscribe, () => state);
  return { canPrompt, installed, install };
}
