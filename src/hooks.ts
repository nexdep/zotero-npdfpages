import {
  clearPDFPageCounts,
  installPDFPageCountSearchCondition,
  refreshPDFPageCounts,
  registerPDFPageCountColumn,
  registerPDFPageCountNotifier,
} from "./modules/pdfPageCount";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  try {
    await refreshPDFPageCounts();
    addon.data.restoreSearchConditions = installPDFPageCountSearchCondition();
    addon.data.pdfPageCountColumnDataKey = registerPDFPageCountColumn();
    addon.data.pdfPageCountNotifierID = registerPDFPageCountNotifier();
  } catch (error) {
    addon.data.startupError = error;
    throw error;
  } finally {
    // Mark initialized as true to confirm plugin loading status
    // outside of the plugin (e.g. scaffold testing process)
    addon.data.initialized = true;
  }
}

async function onMainWindowLoad(_win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  if (addon.data.pdfPageCountColumnDataKey) {
    Zotero.ItemTreeManager.unregisterColumn(
      addon.data.pdfPageCountColumnDataKey,
    );
    Zotero.ItemTreeManager.refreshColumns();
    addon.data.pdfPageCountColumnDataKey = false;
  }

  if (addon.data.pdfPageCountNotifierID) {
    Zotero.Notifier.unregisterObserver(addon.data.pdfPageCountNotifierID);
    addon.data.pdfPageCountNotifierID = undefined;
  }

  addon.data.restoreSearchConditions?.();
  addon.data.restoreSearchConditions = undefined;
  clearPDFPageCounts();

  ztoolkit.unregisterAll();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
