import { ref, watch } from 'vue';

export function useContextNavigation({ graphView, onRestoreState }) {
  const contextId  = ref(null);
  const sourceKey  = ref(null);
  const folderPath = ref(null);

  function _read() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('view'))    graphView.value = p.get('view');
    if (p.has('context')) contextId.value  = p.get('context');
    if (p.has('source'))  sourceKey.value  = p.get('source');
    if (p.has('folder'))  folderPath.value = p.get('folder').split(',').filter(Boolean);
    return p.has('context');
  }

  function _write() {
    const p = new URLSearchParams();
    if (graphView.value)     p.set('view',    graphView.value);
    if (contextId.value)     p.set('context', contextId.value);
    if (sourceKey.value)     p.set('source',  sourceKey.value);
    if (folderPath.value?.length) p.set('folder', folderPath.value.join(','));
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }

  function openContext(id) {
    contextId.value  = id;
    sourceKey.value  = null;
    folderPath.value = null;
    _write();
  }

  function openSource(ctxId, key) {
    contextId.value  = ctxId;
    sourceKey.value  = key;
    folderPath.value = null;
    _write();
  }

  function openFolder(path) {
    folderPath.value = path;
    _write();
  }

  function closeDetail() {
    contextId.value  = null;
    sourceKey.value  = null;
    folderPath.value = null;
    _write();
  }

  function closeSource() {
    sourceKey.value  = null;
    folderPath.value = null;
    _write();
  }

  watch(() => graphView.value, _write);

  const hasUrlState = _read();
  if (hasUrlState && onRestoreState) onRestoreState();

  return { contextId, sourceKey, folderPath, openContext, openSource, openFolder, closeDetail, closeSource };
}
