/**
 * Injected on demand, never on every page.
 *
 * Runs once per invocation, reads whatever is selected, reports it and exits.
 * It holds no listeners and no state, so repeated injection is harmless.
 */
import type { PageSelection } from '../shared/messages';

const CODE_SELECTOR = 'pre, code, .highlight, [class*="language-"]';
const LANGUAGE_PATTERN = /(?:language|lang|highlight)-([a-z0-9+#]+)/i;

function elementFor(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function detectCode(range: Range | undefined, text: string) {
  const host = elementFor(range?.commonAncestorContainer ?? null)?.closest(
    CODE_SELECTOR,
  );
  if (!host) return undefined;

  // Look at the element and its ancestors: highlighters put the language on
  // either the <code> or the wrapping <pre>.
  let language: string | undefined;
  for (let el: Element | null = host; el; el = el.parentElement) {
    const match = LANGUAGE_PATTERN.exec(el.className || '');
    if (match) {
      language = match[1].toLowerCase();
      break;
    }
  }

  return { content: text, language };
}

function selectedImage(): string | undefined {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return undefined;

  const fragment = selection.getRangeAt(0).cloneContents();
  const img = fragment.querySelector('img');
  // Prefer currentSrc so a responsive image reports what actually loaded.
  return img?.getAttribute('src') ?? undefined;
}

export function captureSelection(): PageSelection {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
  const text = (selection?.toString() ?? '').trim();

  return {
    text,
    code: text ? detectCode(range, text) : undefined,
    imageUrl: selectedImage(),
    page: { url: location.href, title: document.title },
  };
}

// Injected via chrome.scripting.executeScript; the return value is handed back
// to the caller as the injection result.
captureSelection();
