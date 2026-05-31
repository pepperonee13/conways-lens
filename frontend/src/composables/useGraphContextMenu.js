import { reactive } from 'vue';
import { useToast } from './useToast.js';

export function useGraphContextMenu({ store, detailRepoName }) {
  const contextMenu = reactive({
    show: false, x: 0, y: 0,
    label: '',
    source: null,
    reason: '',
    currentContextId: null, // id of context that currently owns this source (if any)
  });

  const { show: showToast } = useToast();

  function closeContextMenu() {
    contextMenu.show = false;
  }

  function openContextMenuForContextNode(d, e) {
    e.preventDefault();
    if (d.type === 'team') return;
    // Only auto-contexts (id === repo name, not in the user-defined list) back a
    // single repo and can be folded into another context.
    const isUserDefined = store.contexts.some(c => c.id === d.id);
    const source = isUserDefined ? null : { type: 'repo', repo: d.id };
    const currentCtx = source ? store.contextForSource(source) : null;
    Object.assign(contextMenu, {
      show: true, x: e.clientX, y: e.clientY,
      label: d.name ?? d.id,
      source,
      reason: isUserDefined ? 'Already a bounded context' : '',
      currentContextId: currentCtx?.id ?? null,
    });
  }

  function openContextMenuForFolderNode(d, e) {
    e.preventDefault();
    const repo = detailRepoName.value;
    const path = d.fullPath ?? d.folderFullPath ?? d.id;
    const source = repo ? { type: 'path', repo, path } : null;
    const currentCtx = source ? store.contextForSource(source) : null;
    Object.assign(contextMenu, {
      show: true, x: e.clientX, y: e.clientY,
      label: repo ? `${repo} / ${path}` : path,
      source,
      reason: repo ? '' : 'Unknown repository',
      currentContextId: currentCtx?.id ?? null,
    });
  }

  // Direct assignment from the context menu — skips the mapping editor entirely.
  function assignToContext(contextId) {
    if (!contextMenu.source) return;
    const isMove = !!contextMenu.currentContextId;
    store.moveContextSource(contextMenu.source, contextId);
    const ctx = store.contexts.find(c => c.id === contextId);
    if (ctx) showToast(isMove ? `Moved to "${ctx.name}"` : `Added to "${ctx.name}"`);
    closeContextMenu();
  }

  // Open mapping editor for the "Create new context" path.
  function confirmAddToContext() {
    if (contextMenu.source) store.beginAddToContext(contextMenu.source, contextMenu.label);
    closeContextMenu();
  }

  return {
    contextMenu,
    closeContextMenu,
    openContextMenuForContextNode,
    openContextMenuForFolderNode,
    assignToContext,
    confirmAddToContext,
  };
}
