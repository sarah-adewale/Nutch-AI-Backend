/**
 * The message contract between content script, side panel and service worker.
 *
 * MV3 service workers are killed aggressively, so nothing may be held in module
 * scope and every exchange has to be self-contained. Messages are a discriminated
 * union so a missed case is a type error rather than a silent no-op at runtime.
 */

/** What the user highlighted on the page. */
export interface PageSelection {
  /** Plain text of the selection. Empty when an image was selected. */
  text: string;
  /** Present when the selection sits inside a code block. */
  code?: {
    content: string;
    /** Language inferred from the element's class, e.g. `language-ts`. */
    language?: string;
  };
  /** Source URL of a selected image. */
  imageUrl?: string;
  /** Where the selection came from, shown as provenance in the sidebar. */
  page: { url: string; title: string };
}

export type ExtensionMessage =
  /** Content script → worker: the user invoked Nutch on this selection. */
  | { type: 'selection:captured'; selection: PageSelection }
  /** Worker → panel: render this selection. */
  | { type: 'selection:deliver'; selection: PageSelection }
  /** Panel → worker: the panel mounted and wants anything pending. */
  | { type: 'panel:ready' }
  /** Worker → panel: nothing is pending. */
  | { type: 'selection:none' };

export type MessageOf<T extends ExtensionMessage['type']> = Extract<
  ExtensionMessage,
  { type: T }
>;

/** Narrows an unknown runtime payload to a known message. */
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'selection:captured' ||
    type === 'selection:deliver' ||
    type === 'panel:ready' ||
    type === 'selection:none'
  );
}

export function sendMessage(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}
