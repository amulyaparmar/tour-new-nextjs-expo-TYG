/**
 * Add dictated text to a draft without replacing anything the user typed while
 * the audio was being transcribed.
 */
export function appendDictationText(draft: string, transcript: string): string {
  const spokenText = transcript.trim();
  if (!spokenText) return draft;
  if (!draft.trim()) return spokenText;
  return `${draft.trimEnd()} ${spokenText}`;
}
