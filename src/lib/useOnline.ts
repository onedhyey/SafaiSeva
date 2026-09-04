// Connectivity signal for the offline capture queue (T3.1).
//
// Returns the browser's real `navigator.onLine` state, updated on the online/offline
// events. Callers OR this with the `simulateOffline` demo setting to get an effective
// "can we reach the server right now?" flag.

import { useEffect, useState } from 'react';

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(readOnline);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    // Re-sync in case an event fired between render and effect.
    setOnline(readOnline());
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
