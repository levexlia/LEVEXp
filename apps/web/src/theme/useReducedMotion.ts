import { useSyncExternalStore } from "react";
import { REDUCED_MOTION_QUERY, readReducedMotion } from "./motion";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True while the player asks for reduced motion; follows the OS setting live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => readReducedMotion(), () => false);
}
