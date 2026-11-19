import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function current(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/** True when the player asked the system for less motion. Follows changes live. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(current);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(QUERY);
    const update = () => setReduce(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduce;
}
