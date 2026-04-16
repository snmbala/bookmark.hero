/**
 * Folder management panel — organise, rename, reorder, and move bookmarks/folders.
 * Initialised via initManagePanel({ getState, getThumbnailUrl, getCallbacks }).
 */

import { invalidateCache, getCachedBookmarks } from './bookmark-manager.js';

// ─── Injected deps ─────────────────────────────────────────────────────────────
let _getState       = () => ({});
let _getThumbnailUrl = () => {};
let _updateView     = () => {};
let _getSearchTerm  = () => '';
let _rebuildLocalState   = () => {};
let _buildPopoverFilterPanel = () => {};

export function initManagePanel({ getState, getThumbnailUrl, updateView, getSearchTerm, rebuildLocalState, buildPopoverFilterPanel }) {
    _getState              = getState;
    _getThumbnailUrl       = getThumbnailUrl;
    _updateView            = updateView;
    _getSearchTerm         = getSearchTerm;
    _rebuildLocalState     = rebuildLocalState;
    _buildPopoverFilterPanel = buildPopoverFilterPanel;
}

// ─── Open / close ──────────────────────────────────────────────────────────────
export function openManagePanel() {
    const panel = document.getElementById('manage-panel');
    if (!panel) return;
    // closeAllModals is a window global set by main.js
    window.closeAllModals?.('manage-panel');
    panel.classList.remove('hidden');
    renderManageContent();
    setTimeout(() => {
        const closeBtn = document.getElementById('close-manage-btn');
        if (closeBtn) closeBtn.focus();
    }, 50);
}

export function closeManagePanel() {
    const panel = document.getElementById('manage-panel');
    if (panel) panel.classList.add('hidden');
}

// ─── Refresh helper (also called from drag-drop) ───────────────────────────────
export function refreshManageAndMain() {
    const { appState } = _getState();
    invalidateCache();
    getCachedBookmarks().then(function (newTree) {
        appState.bookmarkTree = newTree;
        _rebuildLocalState();
        if (appState.isPopoverMode) _buildPopoverFilterPanel();
        renderManageContent();
        if (appState.isPopoverMode && !document.getElementById('popover-manage-page').classList.contains('hidden')) {
            renderManageContent('popover-manage-folder-list');
        }
        _updateView(_getSearchTerm());
    });
}

// ─── Folder helpers ────────────────────────────────────────────────────────────
function getAllFoldersFlat() {
    const { appState } = _getState();
    const folders  = [];
    const SKIP_LC  = new Set(['bookmarks bar', 'other bookmarks', 'mobile bookmarks']);
    function traverse(nodes) {
        (nodes || []).forEach(function (node) {
            if (node.url) return;
            const isSystem = SKIP_LC.has((node.title || '').toLowerCase());
            if (!isSystem) folders.push(node);
            traverse(node.children);
        });
    }
    traverse(appState.bookmarkTree && appState.bookmarkTree[0] ? appState.bookmarkTree[0].children : []);
    return folders;
}

function countBookmarksDeep(node) {
    if (node.url) return 1;
    return (node.children || []).reduce((sum, child) => sum + countBookmarksDeep(child), 0);
}

function getFirstBookmarkUrl(node) {
    if (node.url) return node.url;
    for (const child of (node.children || [])) {
        const found = getFirstBookmarkUrl(child);
        if (found) return found;
    }
    return null;
}

// ─── Render ────────────────────────────────────────────────────────────────────
export function renderManageContent(containerId = 'manage-folder-list') {
    const { appState } = _getState();
    const container = document.getElementById(containerId);
    if (!container || !appState.bookmarkTree) return;
    container.innerHTML = '';

    const SKIP_LC   = new Set(['bookmarks bar', 'other bookmarks', 'mobile bookmarks']);
    const allFolders = getAllFoldersFlat();
    let rendered     = 0;

    function renderFolderNodes(nodes) {
        (nodes || []).forEach(function (node) {
            if (node.url) return;
            const isSystem = SKIP_LC.has((node.title || '').toLowerCase());
            if (isSystem) { renderFolderNodes(node.children); return; }
            container.appendChild(buildFolderCard(node, 0, allFolders));
            rendered++;
        });
    }

    renderFolderNodes(appState.bookmarkTree[0] ? appState.bookmarkTree[0].children : []);

    if (rendered === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No folders found. Create folders in Chrome to organise your bookmarks.';
        empty.className = 'text-sm text-zinc-400 dark:text-zinc-500 text-center py-10';
        container.appendChild(empty);
        return;
    }

    initManageDragDrop(container);
}

// ─── Folder card ───────────────────────────────────────────────────────────────
function buildFolderCard(folderNode, depth, allFolders) {
    const wrapper = document.createElement('div');
    wrapper.className = 'manage-folder-card';
    wrapper.setAttribute('data-folder-id', folderNode.id);
    wrapper.setAttribute('data-parent-id', folderNode.parentId || '');
    wrapper.draggable = true;
    if (depth > 0) wrapper.style.marginLeft = `${depth * 16}px`;

    const header = document.createElement('div');
    header.className = 'manage-card-header flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors';

    const dragHandle = document.createElement('div');
    dragHandle.className = 'flex-shrink-0 text-zinc-300 dark:text-zinc-600 cursor-grab hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors';
    dragHandle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'flex-shrink-0 w-14 h-10 rounded bg-zinc-100 dark:bg-zinc-700 overflow-hidden flex items-center justify-center';
    const firstUrl = getFirstBookmarkUrl(folderNode);
    if (firstUrl) {
        const img = document.createElement('img');
        img.alt = folderNode.title;
        _getThumbnailUrl(firstUrl, function (url) {
            img.src = url;
            img.className = url.startsWith('https://www.google.com/s2/favicons') ? 'w-4 h-4' : 'w-full h-full object-cover';
        });
        thumbWrap.appendChild(img);
    } else {
        thumbWrap.innerHTML = `<div class="w-full h-full flex items-center justify-center text-zinc-300 dark:text-zinc-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></div>`;
    }

    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = folderNode.title;
    nameSpan.className = 'manage-folder-name block text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors';
    nameSpan.title = 'Click to rename';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = folderNode.title;
    nameInput.className = 'manage-folder-name-input hidden w-full text-sm font-medium input px-2 py-0.5';

    const countEl = document.createElement('span');
    const bmCount = countBookmarksDeep(folderNode);
    countEl.textContent = `${bmCount} bookmark${bmCount !== 1 ? 's' : ''}`;
    countEl.className = 'text-xs text-zinc-400 dark:text-zinc-500';

    info.appendChild(nameSpan);
    info.appendChild(nameInput);
    info.appendChild(countEl);

    nameSpan.addEventListener('click', function (e) {
        e.stopPropagation();
        nameSpan.classList.add('hidden');
        nameInput.classList.remove('hidden');
        nameInput.focus();
        nameInput.select();
    });

    function saveRename() {
        const newName = nameInput.value.trim();
        nameInput.classList.add('hidden');
        nameSpan.classList.remove('hidden');
        if (!newName || newName === folderNode.title) return;
        chrome.bookmarks.update(folderNode.id, { title: newName }, function () {
            folderNode.title = newName;
            nameSpan.textContent = newName;
            refreshManageAndMain();
        });
    }

    nameInput.addEventListener('blur', saveRename);
    nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
        if (e.key === 'Escape') {
            nameInput.value = folderNode.title;
            nameInput.classList.add('hidden');
            nameSpan.classList.remove('hidden');
        }
    });

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded p-1 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors';
    expandBtn.setAttribute('aria-expanded', 'false');
    expandBtn.setAttribute('aria-label', 'Expand folder');
    expandBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.2s"><path d="m6 9 6 6 6-6"/></svg>`;

    header.appendChild(dragHandle);
    header.appendChild(thumbWrap);
    header.appendChild(info);
    header.appendChild(expandBtn);

    const bookmarksList = document.createElement('div');
    bookmarksList.className = 'hidden pl-4 mt-1 space-y-0.5 pb-1.5';

    const otherFolders = allFolders.filter(f => f.id !== folderNode.id);

    (folderNode.children || []).forEach(function (child) {
        if (child.url) {
            bookmarksList.appendChild(buildBookmarkManageRow(child, otherFolders));
        } else {
            bookmarksList.appendChild(buildFolderCard(child, 0, allFolders));
        }
    });

    if (bookmarksList.children.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No items in this folder.';
        empty.className = 'text-xs text-zinc-400 dark:text-zinc-500 py-2 pl-2';
        bookmarksList.appendChild(empty);
    }

    expandBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isExpanded = !bookmarksList.classList.contains('hidden');
        bookmarksList.classList.toggle('hidden');
        const chevron = expandBtn.querySelector('svg');
        if (chevron) chevron.style.transform = isExpanded ? '' : 'rotate(180deg)';
        expandBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        expandBtn.setAttribute('aria-label', isExpanded ? 'Expand folder' : 'Collapse folder');
    });

    wrapper.appendChild(header);
    wrapper.appendChild(bookmarksList);
    return wrapper;
}

// ─── Bookmark row inside a folder card ────────────────────────────────────────
function buildBookmarkManageRow(bmNode, targetFolders) {
    const row = document.createElement('div');
    row.className = 'bookmark-manage-row flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/60 group transition-colors';
    row.setAttribute('data-bookmark-id', bmNode.id);
    row.setAttribute('data-parent-id', bmNode.parentId || '');
    row.draggable = true;

    const dragHandle = document.createElement('div');
    dragHandle.className = 'flex-shrink-0 text-zinc-300 dark:text-zinc-600 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity';
    dragHandle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'flex-shrink-0 w-11 h-7 rounded bg-zinc-100 dark:bg-zinc-700 overflow-hidden flex items-center justify-center';
    const img = document.createElement('img');
    img.alt = bmNode.title || '';
    _getThumbnailUrl(bmNode.url, function (url) {
        img.src = url;
        img.className = url.startsWith('https://www.google.com/s2/favicons')
            ? 'w-5 h-5 object-contain flex-shrink-0'
            : 'w-full h-full object-cover';
    });
    thumbWrap.appendChild(img);

    const title = document.createElement('span');
    title.textContent = bmNode.title || bmNode.url;
    title.className = 'flex-1 min-w-0 text-sm text-zinc-700 dark:text-zinc-300 truncate';
    title.title = bmNode.url;

    const moveSelect = document.createElement('select');
    moveSelect.className = 'flex-shrink-0 text-xs input px-2 py-1 cursor-pointer max-w-[140px]';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Move to\u2026';
    moveSelect.appendChild(defaultOpt);
    targetFolders.forEach(function (folder) {
        const opt = document.createElement('option');
        opt.value = folder.id;
        opt.textContent = folder.title;
        moveSelect.appendChild(opt);
    });
    moveSelect.addEventListener('change', function () {
        const newParentId = moveSelect.value;
        if (!newParentId) return;
        chrome.bookmarks.move(bmNode.id, { parentId: newParentId }, function () {
            refreshManageAndMain();
        });
    });

    row.appendChild(dragHandle);
    row.appendChild(thumbWrap);
    row.appendChild(title);
    row.appendChild(moveSelect);
    return row;
}

// ─── Drag and drop ─────────────────────────────────────────────────────────────
function initManageDragDrop(container) {
    let dragSrc  = null;
    let dragType = null;

    container.addEventListener('dragstart', function (e) {
        const row  = e.target.closest('.bookmark-manage-row');
        const card = e.target.closest('.manage-folder-card');
        if (row) {
            dragSrc = row; dragType = 'bookmark';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'bookmark:' + row.dataset.bookmarkId);
            requestAnimationFrame(() => row.classList.add('opacity-50'));
        } else if (card) {
            dragSrc = card; dragType = 'folder';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'folder:' + card.dataset.folderId);
            requestAnimationFrame(() => card.classList.add('opacity-50'));
        }
    });

    container.addEventListener('dragend', function () {
        if (dragSrc) { dragSrc.classList.remove('opacity-50'); dragSrc = null; }
        dragType = null;
        container.querySelectorAll('.manage-drag-over').forEach(el => el.classList.remove('manage-drag-over'));
    });

    container.addEventListener('dragover', function (e) {
        const targetCard = e.target.closest('.manage-folder-card');
        if (!targetCard || targetCard === dragSrc) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.manage-drag-over').forEach(el => el.classList.remove('manage-drag-over'));
        targetCard.querySelector('.manage-card-header').classList.add('manage-drag-over');
    });

    container.addEventListener('dragleave', function (e) {
        const targetCard = e.target.closest('.manage-folder-card');
        if (targetCard && !targetCard.contains(e.relatedTarget)) {
            targetCard.querySelector('.manage-card-header')?.classList.remove('manage-drag-over');
        }
    });

    container.addEventListener('drop', function (e) {
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;
        const colonIdx  = data.indexOf(':');
        const type      = data.slice(0, colonIdx);
        const id        = data.slice(colonIdx + 1);
        const targetCard = e.target.closest('.manage-folder-card');
        if (!targetCard) return;
        targetCard.querySelector('.manage-card-header')?.classList.remove('manage-drag-over');

        if (type === 'folder' && targetCard.dataset.folderId !== id) {
            e.preventDefault();
            chrome.bookmarks.get(targetCard.dataset.folderId, function (nodes) {
                if (!nodes || !nodes[0]) return;
                const target = nodes[0];
                chrome.bookmarks.move(id, { parentId: target.parentId, index: target.index }, () => refreshManageAndMain());
            });
        } else if (type === 'bookmark') {
            e.preventDefault();
            chrome.bookmarks.move(id, { parentId: targetCard.dataset.folderId }, () => refreshManageAndMain());
        }
    });
}

// ─── Wire manage panel event listeners ────────────────────────────────────────
export function wireManageListeners() {
    const managePanelBtn = document.getElementById('manage-btn');
    const closeManageBtn = document.getElementById('close-manage-btn');
    const managePanelEl  = document.getElementById('manage-panel');

    if (managePanelBtn) managePanelBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openManagePanel();
    });
    if (closeManageBtn) closeManageBtn.addEventListener('click', closeManagePanel);
    if (managePanelEl)  managePanelEl.addEventListener('click', function (e) {
        if (e.target === managePanelEl) closeManagePanel();
    });
}
