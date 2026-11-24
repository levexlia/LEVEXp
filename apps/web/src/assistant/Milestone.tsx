/**
 * scene16 C: a bright, short moment when places open (levels 2 and 4 only). Never blocks the game:
 * one tap anywhere, ✕, «На карту» or Esc closes it, and it closes by itself after 2 s. No aria-modal.
 * Focus goes to ✕ and comes back to where it was (or to the map robot). The polite live text lives
 * in the App (`.lxC-live`), so it exists before and is emptied after.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { MAP_NODES } from "@levex/domain";
import { placeIconUrl } from "../map/placeIcons";
import { tabIconUrl, uiIconUrl } from "../theme/uiArt";
import { CHAT_ART, happyRobotSrc, joyFxSrc } from "./art";
import { MILESTONE_MS, milestoneLine, placesOpenedAt } from "./joy";

const pad2 = (value: number) => String(value).padStart(2, "0");

export function Milestone({
  level,
  reducedMotion,
  onClose,
  onMap,
  fallbackFocus,
}: {
  level: number;
  reducedMotion: boolean;
  onClose: () => void;
  /** «На карту»: close and show the map. */
  onMap: () => void;
  /** Where focus goes if the element that had it is gone (the map robot). */
  fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const [previous] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const places = placesOpenedAt(level);
  const proofOpens = MAP_NODES.some((node) => node.id === "workshop" && node.unlockLevel === level);

  useEffect(() => {
    close.current?.focus();
    // Capture phase: Esc closes only this moment, not the sheet that may be open under it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const timer = window.setTimeout(onClose, MILESTONE_MS);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.clearTimeout(timer);
      const back = previous && previous !== document.body && previous.isConnected ? previous : fallbackFocus.current;
      back?.focus?.();
    };
  }, [onClose, previous, fallbackFocus]);

  return (
    <div
      className={`lxC-ov${reducedMotion ? " is-static" : " is-anim"}`}
      role="dialog"
      aria-label="Новый уровень"
      data-level={level}
      onClick={onClose}
    >
      <div className="lxC-dim" aria-hidden="true" />
      {reducedMotion ? null : (
        <div className="lxC-fx" aria-hidden="true">
          <i className="lxC-rays" />
          <i className="lxC-wave" />
        </div>
      )}
      <button type="button" ref={close} className="lxC-x" aria-label="Закрыть" onClick={(event) => { event.stopPropagation(); onClose(); }}>
        <img src={CHAT_ART.close} width={32} height={32} alt="" />
      </button>
      <div className="lxC-body">
        <p className="lxC-meta" aria-hidden="true">◆ Новый уровень ◆</p>
        <div className="lxC-tok" aria-hidden="true">
          <img src={joyFxSrc("milestone_token", reducedMotion)} width={200} height={200} alt="" />
          <b className="lxC-num">{pad2(level)}</b>
          <span className="lxC-days">Уровень</span>
        </div>
        <h2 className="lxC-ttl">Уровень {pad2(level)}</h2>
        <p className="lxC-sub">{places.length > 1 ? "На карте открылись новые места." : "На карте открылось новое место."}</p>
        <ul className="lxC-cards">
          {places.map((place) => (
            <li key={place.id} className="lxC-card" style={{ ["--c" as string]: `var(--lx-place-${place.id})` }}>
              <span className="in">
                <img src={placeIconUrl(place.id)} width={30} height={30} alt="" />
                <span>
                  <span className="nm">{place.name}</span>
                  <span className="cst">Место открыто</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        {proofOpens ? (
          <p className="lxC-rw"><span className="in"><img src={uiIconUrl("camera")} width={18} height={18} alt="" />Proof теперь доступен</span></p>
        ) : null}
        <p className="lxC-say"><b>Помощник:</b> «{milestoneLine(level)}»</p>
        <img className="lxC-robot" src={happyRobotSrc("bright", reducedMotion)} width={120} height={180} alt="" />
        <button type="button" className="lx-btn lx-focus-ring lxC-map" onClick={(event) => { event.stopPropagation(); onMap(); }}>
          <span className="lx-btn__in"><img src={tabIconUrl("map", true)} width={18} height={18} alt="" />На карту</span>
        </button>
        {reducedMotion ? null : <div className="lxC-timerbar" aria-hidden="true"><i className="C-timer" /></div>}
      </div>
    </div>
  );
}
