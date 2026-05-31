import { reactive } from 'vue';

export function useGraphContextMenu({ store, detailRepoName }) {
  const contextMenu = reactive({ show: false, x: 0, y: 0, label: '', source: null, reason: '' });

  function closeContextMenu() {
    contextMenu.show = false;
  }

  function openContextMenuForContextNode(d, e) {
    e.preventDefault();
    // Only auto-contexts (id === repo name, not in the user-defined list) back a
    // single repo and can be folded into another context.
    const isUserDefined = store.contexts.some(c => c.id === d.id);
    Object.assign(contextMenu, {
      show: true, x: e.clientX, y: e.clientY,
      label: d.name ?? d.id,
      source: isUserDefined ? null : { type: 'repo', repo: d.id },
      reason: isUserDefined ? 'Already a bounded context' : '',
    });
  }

  function openContextMenuForFolderNode(d, e) {
    e.preventDefault();
    const repo = detailRepoName.value;
    const path = d.fullPath ?? d.folderFullPath ?? d.id;
    Object.assign(contextMenu, {
      show: true, x: e.clientX, y: e.clientY,
      label: repo ? `${repo} / ${path}` : path,
      source: repo ? { type: 'path', repo, path } : null,
      reason: repo ? '' : 'Unknown repository',
    });
  }

  function confirmAddToContext() {
    if (contextMenu.source) store.beginAddToContext(contextMenu.source, contextMenu.label);
    closeContextMenu();
  }

  return {
    contextMenu,
    closeContextMenu,
    openContextMenuForContextNode,
    openContextMenuForFolderNode,
    confirmAddToContext,
  };
}
