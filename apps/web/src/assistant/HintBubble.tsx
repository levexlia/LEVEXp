import { HINT_WIDTH, type HintId } from "./hints";

/** Robot pose while a hint is shown (scene17): palm to the left, the bubble is left of the robot. */
export function hintRobotSrc(reducedMotion: boolean): string {
  return reducedMotion ? "/art/scene17/static/robot_hint_left_static.svg" : "/art/scene17/robot_hint_left.svg";
}

/**
 * Bubble «Помощник» (scene17 .lx-hint) above the map robot. Appears once (lxHintIn 320 ms, none under
 * reduced motion); × hides this trigger until the next player day. role=status: read once, no sound.
 */
export function HintBubble({ id, text, onDismiss }: { id: HintId; text: string; onDismiss: () => void }) {
  const width = HINT_WIDTH[id];
  return (
    <div className="lx-hint-wrap lx-hint-in map-hint" data-hint={id} role="status" style={{ ["--lx-hint-w" as string]: `${width}px` }}>
      <div className="lx-hint">
        <div className="lx-hint__in">
          <div className="lx-hint__meta"><i />Помощник</div>
          <div className="lx-hint__txt">{text}</div>
          <button type="button" className="lx-hint__x" aria-label="Скрыть до завтра" onClick={onDismiss} />
        </div>
      </div>
      <img className="lx-hint__tail" src="/art/scene17/hint_tail.svg" width={14} height={10} alt="" />
    </div>
  );
}
