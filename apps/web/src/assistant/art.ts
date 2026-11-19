/**
 * Scene 15 assistant robot (levex_design/scene15, INTEGRATION.md).
 * Files live in public/art/scene15; reduced motion uses the static copies.
 */
export const ROBOT_STATES = ["idle", "listening", "thinking", "speaking"] as const;
/**
 * States the app shows. `happy` (robot_happy.svg) is in public/ but not used:
 * when to show it is Лия's call.
 */
export type RobotState = (typeof ROBOT_STATES)[number];

const SCENE15 = "/art/scene15";

export function robotSrc(state: RobotState, reducedMotion: boolean): string {
  return reducedMotion ? `${SCENE15}/static/robot_${state}_static.svg` : `${SCENE15}/robot_${state}.svg`;
}

/** Default map art (idle). */
export const ASSISTANT_ROBOT_SVG = robotSrc("idle", false);

/** Box 80×120 on screen; the 48×96 body sits at (16, 20) inside it, feet at y = 116. */
export const ASSISTANT_ROBOT_SIZE = { width: 80, height: 120 };

export const CHAT_ART = {
  close: `${SCENE15}/chat/chat_close.svg`,
  send: `${SCENE15}/chat/chat_send.svg`,
  sendDisabled: `${SCENE15}/chat/chat_send_disabled.svg`,
  stop: `${SCENE15}/chat/chat_stop.svg`,
};

export function typingSrc(reducedMotion: boolean): string {
  return reducedMotion ? `${SCENE15}/static/chat_typing_static.svg` : `${SCENE15}/chat/chat_typing.svg`;
}

/**
 * Robot state from the chat:
 * - closed → idle;
 * - waiting for the API → thinking;
 * - field focused and not empty → listening;
 * - the last line is the assistant's answer (until the player types again or closes) → speaking;
 * - otherwise (greeting only, error, cleared field) → idle.
 */
export function robotStateFor(chat: {
  open: boolean;
  loading: boolean;
  typing: boolean;
  answerShown: boolean;
}): RobotState {
  if (!chat.open) return "idle";
  if (chat.loading) return "thinking";
  if (chat.typing) return "listening";
  if (chat.answerShown) return "speaking";
  return "idle";
}
