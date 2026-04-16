/**
 * Duplicate bookmark detection and review UI.
 * Initialised once via initDedup({ getState, createBookmarkCard, closeAllModals, bootstrapBookmarks }).
 */

import { findDuplicateBookmarks, findSameDomainGroups } from './bookmark-manager.js';

// ─── Injected deps ─────────────────────────────────────────────────────────────
let _getState        = () => ({});
let _createCard      = () => document.createElement('div');
let _closeAllModals  = () => {};
let _bootstrapBookmarks = () => {};

export function initDedup({ getState, createBookmarkCard, closeAllModals, bootstrapBookmarks }) {
    _getState           = getState;
    _createCard         = createBookmarkCard;
    _closeAllModals     = closeAllModals;
    _bootstrapBookmarks = bootstrapBookmarks;
}

// ─── Duplicate banner ──────────────────────────────────────────────────────────
export function checkForDuplicates() {
    const { allBookmarks } = _getState();
    const groups = findDuplicateBookmarks(allBookmarks);
    const banner = document.getElementById('duplicate-banner');
    if (!banner) return;
    if (groups.length > 0) {
        document.getElementById('duplicate-count').textContent = groups.length;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// ─── Duplicates flat list view ─────────────────────────────────────────────────
export function showDuplicatesView(folderListEl) {
    const { allBookmarks, filterOptions } = _getState();
    const groups = findDuplicateBookmarks(allBookmarks);
    if (groups.length === 0) return;

    folderListEl.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'w-full max-w-[1064px] mx-auto';

    const title = document.createElement('h1');
    title.textContent = `Duplicate Bookmarks (${groups.length} groups)`;
    title.className = 'font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50 mb-4';
    container.appendChild(title);

    groups.forEach(function (group) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-6 p-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10';

        const urlLabel = document.createElement('p');
        urlLabel.className = 'text-xs text-zinc-500 dark:text-zinc-400 mb-3 truncate';
        urlLabel.textContent = group[0].bookmark.url;
        groupDiv.appendChild(urlLabel);

        const cardsGrid = document.createElement('div');
        cardsGrid.className = 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
        group.forEach(entry => {
            cardsGrid.appendChild(_createCard(entry.bookmark, '', entry.folder, allBookmarks, filterOptions));
        });
        groupDiv.appendChild(cardsGrid);
        container.appendChild(groupDiv);
    });

    folderListEl.appendChild(container);
}

// ─── Same-domain dedup review modal ───────────────────────────────────────────
let _dedupGroups = [];
let _dedupIndex  = 0;

export function openDedupReview() {
    const { allBookmarks } = _getState();
    _closeAllModals('dedup-review-modal');
    const groups = findSameDomainGroups(allBookmarks);
    if (groups.length === 0) {
        alert('No same-domain bookmarks found.');
        return;
    }
    _dedupGroups = groups;
    _dedupIndex  = 0;
    _renderDedupGroup();
    document.getElementById('dedup-review-modal').classList.remove('hidden');
}

function _renderDedupGroup() {
    const group = _dedupGroups[_dedupIndex];
    const total = _dedupGroups.length;
    document.getElementById('dedup-progress').textContent = `Group ${_dedupIndex + 1} of ${total}`;
    try {
        document.getElementById('dedup-domain').textContent = new URL(group[0].bookmark.url).hostname;
    } catch (e) {
        document.getElementById('dedup-domain').textContent = '';
    }
    const list = document.getElementById('dedup-group-list');
    list.innerHTML = '';
    group.forEach(entry => list.appendChild(_createDedupRow(entry)));
    document.getElementById('dedup-next-btn').textContent = _dedupIndex === total - 1 ? 'Done' : 'Next →';
}

function _createDedupRow(entry) {
    const bm  = entry.bookmark;
    const row = document.createElement('div');
    row.className = 'flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700';
    row.dataset.bmId = bm.id;

    const favicon = document.createElement('img');
    try { favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=32`; }
    catch (e) { favicon.src = ''; }
    favicon.className = 'w-5 h-5 mt-0.5 flex-shrink-0 rounded object-contain';
    favicon.onerror = function () { this.style.display = 'none'; };

    const info  = document.createElement('div');
    info.className = 'flex-1 min-w-0';
    const titleEl = document.createElement('p');
    titleEl.className = 'text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate';
    titleEl.textContent = bm.title || '(no title)';
    const urlEl = document.createElement('p');
    urlEl.className = 'text-xs text-zinc-500 dark:text-zinc-400 truncate';
    urlEl.textContent = bm.url;
    const meta = document.createElement('p');
    meta.className = 'text-xs text-zinc-400 dark:text-zinc-500 mt-0.5';
    meta.textContent = [
        entry.folder ? `in ${entry.folder}` : '',
        bm.dateAdded ? new Date(bm.dateAdded).toLocaleDateString() : ''
    ].filter(Boolean).join('  ·  ');
    info.appendChild(titleEl);
    info.appendChild(urlEl);
    info.appendChild(meta);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'flex-shrink-0 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1 rounded border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = function () {
        const { allBookmarks } = _getState();
        chrome.bookmarks.remove(bm.id, () => {
            row.remove();
            const idx = allBookmarks.findIndex(e => e.bookmark.id === bm.id);
            if (idx !== -1) allBookmarks.splice(idx, 1);
        });
    };

    row.appendChild(favicon);
    row.appendChild(info);
    row.appendChild(deleteBtn);
    return row;
}

export function advanceDedupGroup() {
    _dedupIndex++;
    if (_dedupIndex >= _dedupGroups.length) {
        document.getElementById('dedup-review-modal').classList.add('hidden');
        _bootstrapBookmarks();
        return;
    }
    _renderDedupGroup();
}

export function closeDedupReview() {
    document.getElementById('dedup-review-modal').classList.add('hidden');
    _bootstrapBookmarks();
}

// ─── Wire dedup modal event listeners (called from wireEventListeners) ─────────
export function wireDedupListeners() {
    const dedupBtn   = document.getElementById('dedup-btn');
    const dedupClose = document.getElementById('dedup-review-close');
    const dedupSkip  = document.getElementById('dedup-skip-btn');
    const dedupNext  = document.getElementById('dedup-next-btn');
    const dedupModal = document.getElementById('dedup-review-modal');
    const showDupBtn = document.getElementById('show-duplicates-btn');

    if (dedupBtn)   dedupBtn.addEventListener('click', openDedupReview);
    if (dedupClose) dedupClose.addEventListener('click', closeDedupReview);
    if (dedupSkip)  dedupSkip.addEventListener('click', advanceDedupGroup);
    if (dedupNext)  dedupNext.addEventListener('click', advanceDedupGroup);
    if (dedupModal) dedupModal.addEventListener('click', function (e) {
        if (e.target === this) closeDedupReview();
    });
    if (showDupBtn) showDupBtn.addEventListener('click', function () {
        const folderList = document.getElementById('folder-list');
        if (folderList) showDuplicatesView(folderList);
    });
}
