/** Limits for the AI assistant chat. Shared so the client and the API agree. */
export const ASSISTANT_MESSAGE_MAX_LENGTH = 500;
/** Earlier turns the client may send back for context (user and assistant). */
export const ASSISTANT_HISTORY_MAX_ITEMS = 10;
/** One earlier turn; assistant replies are capped at 2000 characters by the API. */
export const ASSISTANT_HISTORY_ITEM_MAX_LENGTH = 2000;
/** All earlier turns together. */
export const ASSISTANT_HISTORY_MAX_TOTAL = 6000;

export type AssistantRole = "user" | "assistant";

export interface AssistantTurn {
  role: AssistantRole;
  content: string;
}

/** `ok`: answer from the model. `offline`: no key configured, a fixed stub text. */
export interface AssistantReply {
  reply: string;
  source: "ok" | "offline";
}
