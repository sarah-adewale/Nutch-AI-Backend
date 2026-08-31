/**
 * Service worker.
 *
 * MV3 tears this down whenever it is idle, so every listener is registered at
 * module scope (Chrome needs them present the moment the worker wakes) and no
 * state is kept in memory — anything that must survive goes to storage.
 */
import { isExtensionMessage, type PageSelection } from '../shared/messages';
import * as storage from '../shared/storage';

const CONTEXT_MENU_ID = 'nutch-ask';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Ask Nutch about this',
    contexts: ['selection', 'image'],
  });

  // Clicking the toolbar icon opens the panel without a round trip.
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      /* older Chrome: the action listener below covers it */
    });
});

/**
 * Reads the selection from a tab by injecting the content script on demand.
 * Returns undefined for pages Chrome forbids scripting (the Web Store, other
 * extensions, chrome:// URLs), which is expected rather than an error.
 */
async function readSelection(tabId: number): Promise<PageSelection | undefined> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    return result?.result as PageSelection | undefined;
  } catch {
    return undefined;
  }
}

async function openWithSelection(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.windowId) return;

  const selection = await readSelection(tab.id);
  if (selection) {
    // Stored rather than sent: the panel may not be listening yet, and a
    // message with no receiver is dropped silently.
    await storage.set('pendingSelection', selection);
  }

  await chrome.sidePanel.open({ windowId: tab.windowId });
}

chrome.action.onClicked.addListener((tab) => {
  void openWithSelection(tab);
});

chrome.contextMenus.onClicked.addListener((_info, tab) => {
  if (tab) void openWithSelection(tab);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-nutch') return;
  void chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => tab && openWithSelection(tab));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return false;

  if (message.type === 'panel:ready') {
    void storage.get('pendingSelection').then(async (selection) => {
      if (selection) {
        await storage.remove('pendingSelection');
        sendResponse({ type: 'selection:deliver', selection });
      } else {
        sendResponse({ type: 'selection:none' });
      }
    });
    // Keeps the message channel open for the async reply above.
    return true;
  }

  return false;
});
