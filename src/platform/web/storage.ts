// Browser implementation of the content save storage (shared by the game and
// the developer editor on the same origin). Everything stays on this machine.

import type { SaveStorage } from '../../content/library';

const SAVE_KEY = 'psychopomp.save';

/** localStorage-backed save; failures (private mode, quota) never break the game. */
export function browserStorage(): SaveStorage {
  return {
    read() {
      try {
        return window.localStorage.getItem(SAVE_KEY);
      } catch {
        return null;
      }
    },
    write(text: string) {
      try {
        window.localStorage.setItem(SAVE_KEY, text);
      } catch {
        // Storage unavailable: the change stays in memory for this session.
      }
    },
  };
}
