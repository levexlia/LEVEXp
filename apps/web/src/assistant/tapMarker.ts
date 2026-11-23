/**
 * «Нажми» marker over the map robot (scene15 robot_tap_marker.svg).
 * Shown until the player opens the chat for the first time; then hidden for good (localStorage).
 */

export const CHAT_OPENED_KEY = "levex.assistant.chatOpened";

const SCENE15 = "/art/scene15";

export function tapMarkerSrc(reducedMotion: boolean): string {
  return reducedMotion ? `${SCENE15}/static/robot_tap_marker_static.svg` : `${SCENE15}/robot_tap_marker.svg`;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function storage(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Private mode / blocked storage: behave as a fresh player.
    return null;
  }
}

/** True until the chat has been opened once on this device. */
export function shouldShowTapMarker(store: Store | null = storage()): boolean {
  try {
    return store?.getItem(CHAT_OPENED_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Remembers that the chat was opened, so the marker stays hidden. */
export function rememberChatOpened(store: Store | null = storage()): void {
  try {
    store?.setItem(CHAT_OPENED_KEY, "1");
  } catch {
    // Storage full or blocked: the marker just hides for this session.
  }
}
