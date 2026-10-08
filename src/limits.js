// Limits shared by the Worker and the slash-command registration script.
// Components V2 messages allow 4000 characters of text in total; the meeting
// card adds ~300 characters of chrome, so these caps guarantee Discord accepts
// the card (the meeting is saved before the card is sent).
export const TITLE_MAX = 200;
export const REU_DESCRIPTION_MAX = 1500;
export const REU_DURATION_MAX_MINUTES = 24 * 60;
