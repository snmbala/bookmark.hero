// Import all modules
import { initializeThemeToggle } from './modules/theme.js';
import { populateFilterDropdown } from './modules/filter.js';
import { iconEl } from './modules/icons.js';
import { captureScreenshot, getThumbnailUrl, updateThumbnail, bulkCaptureInWindow } from './modules/thumbnail.js';
import { handleScreenshotCapture } from './modules/captureScreenshot.js';
import './modules/keyboard-shortcuts.js';
import {
    debounce,
    getCachedBookmarks,
    invalidateCache,
    collectBookmarks,
    filterBookmarks,
    expandFolderIds,
    findDuplicateBookmarks,
    findSameDomainGroups
} from './modules/bookmark-manager.js';
import {
    createBookmarkCard,
    getDynamicTitle
} from './modules/ui-renderer.js';

// ─── App State ───────────────────────────────────────────────────────────────
let FILTER_IDS = new Set(); // set of selected folder id strings
let SORT_BY = 'recently-added';
let allBookmarks = [];
let filterOptions = [];
let bookmarkTree = null;
let _isCleaningUp = false; // prevents onRemoved loop during empty-folder cleanup

// ─── Popover mode detection ───────────────────────────────────────────────────
const isPopoverMode = new URLSearchParams(window.location.search).get('mode') === 'popover';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
let folderList, searchInput, clearSearch, searchIcon, settingsButton;

// ─── Boot ─────────────────────────────────────────────────────────────────────
getCachedBookmarks().then(function (bookmarks) {
    bookmarkTree = bookmarks;
    folderList        = document.getElementById("folder-list");
    searchInput       = document.getElementById("search-input");
    clearSearch       = document.getElementById("clear-search");
    searchIcon        = document.getElementById("search-icon");
    settingsButton    = document.getElementById("settings-btn");

    // Show header border only after scrolling
    const appHeader = document.getElementById('app-header');
    const onScroll = () => {
        if (window.scrollY > 0) {
            appHeader.classList.add('border-zinc-100', 'dark:border-zinc-800');
            appHeader.classList.remove('border-transparent');
        } else {
            appHeader.classList.remove('border-zinc-100', 'dark:border-zinc-800');
            appHeader.classList.add('border-transparent');
        }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // Theme
    initializeThemeToggle();
    // View mode toggle (in settings)
    initViewModeToggle();

    // Settings modal
    let settingsModalOpen = false;
    const settingsModal = document.getElementById("settings-modal");
    settingsButton.addEventListener("click", function (event) {
        event.stopPropagation();
        settingsModal.classList.toggle("hidden");
        settingsModalOpen = !settingsModal.classList.contains("hidden");
        settingsButton.setAttribute('aria-expanded', settingsModalOpen ? 'true' : 'false');
        if (settingsModalOpen) {
            // Ensure modal card is visible (may have been hidden when feedback was open)
            const modalCard = settingsModal.querySelector(':scope > div:first-child');
            if (modalCard) modalCard.classList.remove("hidden");
            document.getElementById("feedback-panel")?.classList.add("hidden");
            updateStorageUsage();
            setTimeout(() => {
                const autoButton = document.querySelector('button[data-theme="auto"]');
                if (autoButton) autoButton.focus();
            }, 100);
        }
    });
    // Close on backdrop click (clicking the dark overlay outside the card)
    settingsModal.addEventListener("click", function (e) {
        if (e.target === settingsModal) {
            settingsModal.classList.add("hidden");
            document.getElementById('feedback-panel')?.classList.add('hidden');
            resetFeedbackPanel();
            settingsModalOpen = false;
            settingsButton.setAttribute('aria-expanded', 'false');
            return;
        }
        e.stopPropagation();
    });
    // Close button inside the modal header
    const closeSettingsBtn = document.getElementById("close-settings-btn");
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener("click", function () {
            settingsModal.classList.add("hidden");
            document.getElementById('feedback-panel')?.classList.add('hidden');
            resetFeedbackPanel();
            settingsModalOpen = false;
            settingsButton.setAttribute('aria-expanded', 'false');
        });
    }
    document.addEventListener("click", function () {
        if (settingsModalOpen && !settingsModal.classList.contains("hidden")) {
            settingsModal.classList.add("hidden");
            document.getElementById('feedback-panel')?.classList.add('hidden');
            resetFeedbackPanel();
            settingsModalOpen = false;
            settingsButton.setAttribute('aria-expanded', 'false');
        }
    });

    // Restore saved sort preference and check first-run state
    chrome.storage.sync.get(['sortPreference', 'hasSeenOnboarding'], function (result) {
        if (result.sortPreference) SORT_BY = result.sortPreference;
        bootstrapBookmarks();
        if (!result.hasSeenOnboarding) showOnboardingModal();
    });
});

// ─── Bootstrap (populate data then render) ───────────────────────────────────
function bootstrapBookmarks() {
    allBookmarks = [];
    for (const node of bookmarkTree[0].children) {
        collectBookmarks(node, allBookmarks);
    }
    filterOptions = populateFilterDropdown(bookmarkTree[0].children, onToggleFolder, () => FILTER_IDS);
    wireEventListeners();
    initFilterPanel();
    if (isPopoverMode) initPopoverMode();
    updateView("");
    checkForDuplicates();
    cleanupEmptyFolders();
}

// ─── Refresh app state without full page reload ───────────────────────────────
function refreshApp() {
    invalidateCache();
    getCachedBookmarks().then(function (bookmarks) {
        bookmarkTree = bookmarks;
        allBookmarks = [];
        for (const node of bookmarkTree[0].children) {
            collectBookmarks(node, allBookmarks);
        }
        filterOptions = populateFilterDropdown(bookmarkTree[0].children, onToggleFolder, () => FILTER_IDS);
        if (isPopoverMode) buildPopoverFilterPanel();
        const searchTerm = searchInput.value.trim().toLowerCase();
        updateView(searchTerm);
        checkForDuplicates();
        cleanupEmptyFolders();
    });
}
window.refreshApp = refreshApp;

// ─── Folder filter helpers ────────────────────────────────────────────────────
function onToggleFolder(id, checked) {
    if (checked) FILTER_IDS.add(id);
    else FILTER_IDS.delete(id);
    updateFilterLabel();
    updateView(searchInput.value.trim().toLowerCase());
}

function updateFilterLabel() {
    const label = document.getElementById('filter-label');
    if (label) {
        label.textContent = FILTER_IDS.size > 0
            ? `${FILTER_IDS.size} folder${FILTER_IDS.size > 1 ? 's' : ''}`
            : 'All Folders';
    }
    const arrow = document.getElementById('filter-dropdown-arrow');
    if (arrow) {
        arrow.classList.toggle('rotate-180', !document.getElementById('filter-panel').classList.contains('hidden'));
    }
}

function initFilterPanel() {
    const btn  = document.getElementById('filter-btn');
    const panel = document.getElementById('filter-panel');
    const arrow = document.getElementById('filter-dropdown-arrow');
    if (!btn || !panel) return;

    // Move panel to <body> to fully escape the header's backdrop-filter containing block.
    // backdrop-filter creates a new stacking context that traps position:fixed children.
    document.body.appendChild(panel);
    panel.style.position = 'fixed';
    panel.style.zIndex   = '9999';

    function positionPanel() {
        const rect = btn.getBoundingClientRect();
        panel.style.top   = (rect.bottom + 4) + 'px';
        panel.style.right = (window.innerWidth - rect.right) + 'px';
        panel.style.left  = 'auto';
    }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = !panel.classList.contains('hidden');
        if (!isOpen) positionPanel();
        panel.classList.toggle('hidden');
        btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        if (arrow) arrow.classList.toggle('rotate-180', !isOpen);
    });

    // Close on outside click
    document.addEventListener('click', function () {
        if (!panel.classList.contains('hidden')) {
            panel.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
            if (arrow) arrow.classList.remove('rotate-180');
        }
    });

    panel.addEventListener('click', e => e.stopPropagation());
}

// ─── Real-time Chrome bookmark sync ──────────────────────────────────────────
chrome.bookmarks.onCreated.addListener(function () { refreshApp(); });
chrome.bookmarks.onRemoved.addListener(function () { if (!_isCleaningUp) refreshApp(); });
chrome.bookmarks.onMoved.addListener(function ()   { refreshApp(); });
chrome.bookmarks.onChanged.addListener(function ()  { refreshApp(); });

// ─── Real-time thumbnail updates (e.g. background auto-capture on bookmark create) ───
chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    for (const url of Object.keys(changes)) {
        const newValue = changes[url].newValue;
        if (newValue && typeof newValue === 'string' && newValue.startsWith('data:')) {
            updateThumbnail(url, newValue);
        }
    }
});

let _activeScrollHandler = null;

// ─── View rendering ───────────────────────────────────────────────────────────
function updateView(searchTerm) {
    if (isPopoverMode) {
        showPopoverList(searchTerm);
    } else {
        showGridView(searchTerm);
    }
}

function showGridView(searchTerm) {
    // Remove previous infinite-scroll handler before wiping the DOM
    if (_activeScrollHandler) {
        window.removeEventListener('scroll', _activeScrollHandler);
        _activeScrollHandler = null;
    }

    const expandedIds = FILTER_IDS.size > 0
        ? [...expandFolderIds([...FILTER_IDS], bookmarkTree)]
        : [];
    const filteredBookmarks = filterBookmarks(allBookmarks, searchTerm, expandedIds, SORT_BY);

    folderList.innerHTML = "";

    const gridContainer = document.createElement("div");
    gridContainer.className = "container mx-auto";

    // Title row: h1 on the left, sort dropdown on the right
    const titleRow = document.createElement("div");
    titleRow.className = "flex items-center justify-between w-full py-2";

    const mainTitle = document.createElement("h1");
    mainTitle.textContent = getDynamicTitle(searchTerm, FILTER_IDS.size > 0 ? [...FILTER_IDS][0] : 0, filteredBookmarks.length, filterOptions);
    mainTitle.className = "font-semibold text-lg text-zinc-800 dark:text-zinc-50";

    const sortWrapper = document.createElement("div");
    sortWrapper.className = "relative flex-shrink-0";

    const sortSelectEl = document.createElement("select");
    sortSelectEl.className = "pl-6 pr-2 py-1 text-sm cursor-pointer appearance-none bg-transparent text-zinc-600 dark:text-zinc-300 focus:outline-none";
    sortSelectEl.title = "Sort bookmarks";
    sortSelectEl.setAttribute('aria-label', 'Sort bookmarks');
    [
        { value: "recently-added",  label: "Recently Added" },
        { value: "title",           label: "Name (A\u2013Z)" },
        { value: "domain",          label: "Domain" }
    ].forEach(({ value, label }) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        opt.selected = value === SORT_BY;
        sortSelectEl.appendChild(opt);
    });
    sortSelectEl.addEventListener("change", function () {
        SORT_BY = sortSelectEl.value;
        chrome.storage.sync.set({ sortPreference: SORT_BY });
        updateView(searchInput.value.trim().toLowerCase());
    });

    const sortIcon = iconEl('arrow-up-down', 'absolute top-1/2 -translate-y-1/2 left-0 pointer-events-none opacity-50 text-zinc-600 dark:text-zinc-300');

    sortWrapper.appendChild(sortIcon);
    sortWrapper.appendChild(sortSelectEl);
    titleRow.appendChild(mainTitle);
    titleRow.appendChild(sortWrapper);

    const grid = document.createElement("div");
    grid.className = "grid my-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8";

    gridContainer.appendChild(titleRow);

    // Folder filter tags row (only visible when folders are selected)
    if (FILTER_IDS.size > 0) {
        const tagsRow = document.createElement("div");
        tagsRow.className = "flex flex-wrap items-center gap-2 mb-1";

        FILTER_IDS.forEach(function (id) {
            const option = filterOptions.find(o => String(o.value) === String(id));
            const labelText = option ? option.label.replace(/^[-\s]+/, '') : id;

            const tag = document.createElement("span");
            tag.className = "flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-medium rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700";

            const tagLabel = document.createElement("span");
            tagLabel.textContent = labelText;

            const removeBtn = document.createElement("button");
            removeBtn.textContent = "×";
            removeBtn.className = "text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-100 text-base leading-none font-bold px-0.5";
            removeBtn.title = `Remove: ${labelText}`;
            removeBtn.addEventListener("click", function () {
                FILTER_IDS.delete(id);
                updateFilterLabel();
                const cb = document.querySelector(`#filter-panel input[value="${id}"]`);
                if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
                updateView(searchInput.value.trim().toLowerCase());
            });

            tag.appendChild(tagLabel);
            tag.appendChild(removeBtn);
            tagsRow.appendChild(tag);
        });

        const clearAllBtn = document.createElement("button");
        clearAllBtn.textContent = "Clear all";
        clearAllBtn.className = "text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 underline underline-offset-2";
        clearAllBtn.addEventListener("click", function () {
            FILTER_IDS.clear();
            updateFilterLabel();
            // Uncheck all checkboxes in the panel
            document.querySelectorAll('#filter-panel input[type="checkbox"]').forEach(cb => { cb.checked = false; cb.dispatchEvent(new Event('change')); });
            updateView(searchInput.value.trim().toLowerCase());
        });
        tagsRow.appendChild(clearAllBtn);

        gridContainer.appendChild(tagsRow);
    }

    gridContainer.appendChild(grid);
    folderList.appendChild(gridContainer);

    const BATCH_SIZE = 100;
    let currentBatch = 0;
    let isLoading = false;

    function loadBatch() {
        if (isLoading) return;
        isLoading = true;
        const start = currentBatch * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, filteredBookmarks.length);
        const fragment = document.createDocumentFragment();
        for (let i = start; i < end; i++) {
            const bm = filteredBookmarks[i];
            if (!bm.children) {
                fragment.appendChild(createBookmarkCard(bm.bookmark, searchTerm, bm.folder, allBookmarks, filterOptions));
            }
        }
        grid.appendChild(fragment);
        currentBatch++;
        isLoading = false;
        if (window.updateBookmarkCards) window.updateBookmarkCards();
    }

    if (filteredBookmarks.length > 0) {
        loadBatch();
        if (filteredBookmarks.length > BATCH_SIZE) {
            const scrollHandler = () => {
                if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200) {
                    if (currentBatch * BATCH_SIZE < filteredBookmarks.length && !isLoading) loadBatch();
                }
            };
            window.addEventListener('scroll', scrollHandler);
            _activeScrollHandler = scrollHandler;
        }
    } else {
        // ── Empty state ──────────────────────────────────────────────────────
        if (allBookmarks.length === 0) {
            // No bookmarks in Chrome at all
            const emptyWrap = document.createElement("div");
            emptyWrap.className = "flex flex-col items-center justify-center py-20 text-center";
            emptyWrap.innerHTML = `
                <div class="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                </div>
                <p class="text-base font-semibold text-zinc-700 dark:text-zinc-300 mb-1">No bookmarks yet</p>
                <p class="text-sm text-zinc-400 dark:text-zinc-500 max-w-xs">Add bookmarks in Chrome and they'll appear here automatically.</p>`;
            gridContainer.appendChild(emptyWrap);
        } else if (searchTerm) {
            // Active search returned nothing
            const noResults = document.createElement("div");
            noResults.className = "flex flex-col items-center justify-center py-16 text-center";
            noResults.innerHTML = `
                <div class="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-500 mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                </div>
                <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">No results for <span class="font-semibold text-zinc-800 dark:text-zinc-200">"${searchTerm}"</span></p>
                <p class="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Try a different keyword or clear the search.</p>`;
            gridContainer.appendChild(noResults);
        } else {
            // Folder filter active but empty
            const noResults = document.createElement("p");
            noResults.textContent = "No bookmarks in this folder.";
            noResults.className = "text-zinc-500 dark:text-zinc-400 mt-4 text-sm";
            gridContainer.appendChild(noResults);
        }
    }
}

// ─── Popup menu ───────────────────────────────────────────────────────────────
let currentPopupMenu = null;
let currentBookmarkNode = null;

function showPopupMenu(event, bookmarkNode) {
    if (currentPopupMenu) currentPopupMenu.remove();
    currentBookmarkNode = bookmarkNode;

    // Ensure folder dropdown is populated
    populateFolderDropdown(bookmarkNode.parentId);

    const popupMenu = document.createElement("div");
    const isDark = document.documentElement.classList.contains('dark');
    popupMenu.className = `popup-menu absolute z-10 flex flex-col w-44 rounded shadow-lg text-sm font-light flex-center flex-col ${
        isDark
            ? 'bg-zinc-800 text-zinc-100'
            : 'bg-white text-zinc-800 border border-zinc-200'
    }`;

    function createIconButton(text, iconName, btnClass, onClick) {
        const container = document.createElement("div");
        const isDark = document.documentElement.classList.contains('dark');
        container.className = `flex-start w-full h-9 px-3 py-1.5 cursor-pointer ${
            isDark ? 'hover:bg-zinc-700 active:bg-zinc-600' : 'hover:bg-zinc-100 active:bg-zinc-200'
        }`;
        const icon = iconEl(iconName, 'w-4 h-4 mr-3 flex-shrink-0');
        container.appendChild(icon);
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.className = btnClass || "flex-start text-left w-full";
        btn.addEventListener("click", onClick);
        container.appendChild(btn);
        return container;
    }

    getThumbnailUrl(bookmarkNode.url, function (thumbnailUrl) {
        const buttonText = thumbnailUrl.startsWith("https://www.google.com/s2/favicons?domain=")
            ? "Capture Thumbnail"
            : "Recapture";

        popupMenu.appendChild(createIconButton(buttonText, "camera", null, function (e) {
            e.preventDefault();
            window.handleScreenshotCapture(bookmarkNode.url, bookmarkNode.title);
            closePopupMenu();
        }));
        popupMenu.appendChild(createIconButton("Edit", "pencil", null, function (e) {
            closePopupMenu();
            e.preventDefault();
            openEditModal(bookmarkNode);
        }));
        popupMenu.appendChild(createIconButton("Delete", "trash-2", "flex-grow text-left", function (e) {
            e.preventDefault();
            closePopupMenu();
            deleteBookmarkWithUndo(bookmarkNode);
        }));
    });

    const rect = event.target.getBoundingClientRect();
    popupMenu.style.top  = `${rect.bottom + window.scrollY + 4}px`;
    popupMenu.style.right = `${window.innerWidth - rect.right - 4}px`;
    document.body.appendChild(popupMenu);
    currentPopupMenu = popupMenu;

    function handleOutsideClick() {
        closePopupMenu();
        document.removeEventListener("click", handleOutsideClick);
    }
    document.addEventListener("click", handleOutsideClick);
    event.stopPropagation();
}

function closePopupMenu() {
    if (currentPopupMenu) { currentPopupMenu.remove(); currentPopupMenu = null; }
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function populateFolderDropdown(selectedParentId) {
    const panel   = document.getElementById('edit-folder-panel');
    const hidden  = document.getElementById('folder-dropdown');
    const labelEl = document.getElementById('edit-folder-label');
    if (!panel) return;

    const rows = [];

    function setSelected(value) {
        if (hidden) hidden.value = value || '';
        const opt = filterOptions.find(o => String(o.value) === String(value));
        if (labelEl) labelEl.textContent = opt ? opt.label : 'Select folder';
        rows.forEach(({ el, val }) => {
            const active = String(val) === String(value);
            el.classList.toggle('bg-indigo-50',           active);
            el.classList.toggle('dark:bg-indigo-900/30',  active);
            el.classList.toggle('text-indigo-700',        active);
            el.classList.toggle('dark:text-indigo-300',   active);
        });
    }

    panel.innerHTML = '';

    filterOptions.slice(1).forEach(function (option) {
        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 pr-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer select-none text-zinc-700 dark:text-zinc-200 transition-colors';
        item.style.paddingLeft = `${12 + option.depth * 14}px`;

        const icon = document.createElement('span');
        icon.className = 'flex-shrink-0 pointer-events-none';
        icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`;

        const label = document.createElement('span');
        label.textContent = option.label;
        label.className = 'text-sm truncate pointer-events-none';

        item.appendChild(icon);
        item.appendChild(label);
        rows.push({ el: item, val: option.value });

        item.addEventListener('click', function (e) {
            e.stopPropagation();
            setSelected(String(option.value));
            panel.classList.add('hidden');
            const btn   = document.getElementById('edit-folder-btn');
            const arrow = document.getElementById('edit-folder-arrow');
            if (btn)   btn.setAttribute('aria-expanded', 'false');
            if (arrow) arrow.classList.remove('rotate-180');
        });

        panel.appendChild(item);
    });

    setSelected(selectedParentId);
}

let _editFocusReturn = null;

function openEditModal(bookmarkNode) {
    _editFocusReturn = document.activeElement;
    const editModal = document.getElementById("edit-modal");
    document.getElementById("edit-title").value = bookmarkNode.title || "";
    document.getElementById("edit-url").value   = bookmarkNode.url   || "";
    populateFolderDropdown(bookmarkNode.parentId);
    window.currentBookmarkNode = bookmarkNode;
    editModal.classList.remove("hidden");
    setTimeout(() => { document.getElementById('edit-title').focus(); }, 50);
}

function closeEditModal() {
    document.getElementById("edit-modal").classList.add("hidden");
    const fp = document.getElementById('edit-folder-panel');
    const fa = document.getElementById('edit-folder-arrow');
    if (fp) fp.classList.add('hidden');
    if (fa) fa.classList.remove('rotate-180');
    if (_editFocusReturn && document.contains(_editFocusReturn)) {
        _editFocusReturn.focus();
    }
    _editFocusReturn = null;
}

// ─── Manage Panel ─────────────────────────────────────────────────────────────
function openManagePanel() {
    const panel = document.getElementById('manage-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderManageContent();
    setTimeout(() => {
        const closeBtn = document.getElementById('close-manage-btn');
        if (closeBtn) closeBtn.focus();
    }, 50);
}

function closeManagePanel() {
    const panel = document.getElementById('manage-panel');
    if (panel) panel.classList.add('hidden');
}

function getAllFoldersFlat() {
    const folders = [];
    const SKIP_LC = new Set(['bookmarks bar', 'other bookmarks', 'mobile bookmarks']);
    function traverse(nodes) {
        (nodes || []).forEach(function (node) {
            if (node.url) return;
            const isSystem = SKIP_LC.has((node.title || '').toLowerCase());
            if (!isSystem) folders.push(node);
            traverse(node.children);
        });
    }
    traverse(bookmarkTree && bookmarkTree[0] ? bookmarkTree[0].children : []);
    return folders;
}

function countBookmarksDeep(node) {
    if (node.url) return 1;
    return (node.children || []).reduce(function (sum, child) {
        return sum + countBookmarksDeep(child);
    }, 0);
}

function getFirstBookmarkUrl(node) {
    if (node.url) return node.url;
    for (const child of (node.children || [])) {
        const found = getFirstBookmarkUrl(child);
        if (found) return found;
    }
    return null;
}

function buildFolderCard(folderNode, depth, allFolders) {
    const wrapper = document.createElement('div');
    wrapper.className = 'manage-folder-card';
    wrapper.setAttribute('data-folder-id', folderNode.id);
    wrapper.setAttribute('data-parent-id', folderNode.parentId || '');
    wrapper.draggable = true;
    if (depth > 0) wrapper.style.marginLeft = `${depth * 16}px`;

    // ── Card header ──
    const header = document.createElement('div');
    header.className = 'manage-card-header flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors';

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'flex-shrink-0 text-zinc-300 dark:text-zinc-600 cursor-grab hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors';
    dragHandle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

    // Thumbnail
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'flex-shrink-0 w-14 h-10 rounded bg-zinc-100 dark:bg-zinc-700 overflow-hidden flex items-center justify-center';
    const firstUrl = getFirstBookmarkUrl(folderNode);
    if (firstUrl) {
        const img = document.createElement('img');
        img.alt = folderNode.title;
        getThumbnailUrl(firstUrl, function (url) {
            img.src = url;
            if (url.startsWith('https://www.google.com/s2/favicons')) {
                img.className = 'w-4 h-4';
            } else {
                img.className = 'w-full h-full object-cover';
            }
        });
        thumbWrap.appendChild(img);
    } else {
        thumbWrap.innerHTML = `<div class="w-full h-full flex items-center justify-center text-zinc-300 dark:text-zinc-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg></div>`;
    }

    // Info area (name + count)
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

    // Rename logic
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
            refreshApp();
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

    // Expand/collapse button
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

    // ── Bookmark rows (collapsed by default) ──
    const bookmarksList = document.createElement('div');
    bookmarksList.className = 'hidden pl-4 mt-1 space-y-0.5 pb-1.5';

    const otherFolders = allFolders.filter(function (f) { return f.id !== folderNode.id; });

    (folderNode.children || []).forEach(function (child) {
        if (child.url) {
            bookmarksList.appendChild(buildBookmarkManageRow(child, otherFolders));
        } else {
            // sub-folder: render nested card
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

function buildBookmarkManageRow(bmNode, targetFolders) {
    const row = document.createElement('div');
    row.className = 'bookmark-manage-row flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/60 group transition-colors';
    row.setAttribute('data-bookmark-id', bmNode.id);
    row.setAttribute('data-parent-id', bmNode.parentId || '');
    row.draggable = true;

    // Drag handle (shown on hover)
    const dragHandle = document.createElement('div');
    dragHandle.className = 'flex-shrink-0 text-zinc-300 dark:text-zinc-600 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity';
    dragHandle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;

    // Thumbnail
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'flex-shrink-0 w-11 h-7 rounded bg-zinc-100 dark:bg-zinc-700 overflow-hidden flex items-center justify-center';
    const img = document.createElement('img');
    img.alt = bmNode.title || '';
    getThumbnailUrl(bmNode.url, function (url) {
        img.src = url;
        if (url.startsWith('https://www.google.com/s2/favicons')) {
            img.className = 'w-5 h-5 object-contain flex-shrink-0';
        } else {
            img.className = 'w-full h-full object-cover';
        }
    });
    thumbWrap.appendChild(img);

    // Title
    const title = document.createElement('span');
    title.textContent = bmNode.title || bmNode.url;
    title.className = 'flex-1 min-w-0 text-sm text-zinc-700 dark:text-zinc-300 truncate';
    title.title = bmNode.url;

    // Move-to dropdown
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

function refreshManageAndMain() {
    invalidateCache();
    getCachedBookmarks().then(function (newTree) {
        bookmarkTree = newTree;
        allBookmarks = [];
        for (const node of bookmarkTree[0].children) {
            collectBookmarks(node, allBookmarks);
        }
        filterOptions = populateFilterDropdown(bookmarkTree[0].children, onToggleFolder, () => FILTER_IDS);
        if (isPopoverMode) buildPopoverFilterPanel();
        renderManageContent();
        if (isPopoverMode && !document.getElementById('popover-manage-page').classList.contains('hidden')) {
            renderManageContent('popover-manage-folder-list');
        }
        const searchTerm = searchInput.value.trim().toLowerCase();
        updateView(searchTerm);
    });
}

function renderManageContent(containerId = 'manage-folder-list') {
    const container = document.getElementById(containerId);
    if (!container || !bookmarkTree) return;
    container.innerHTML = '';

    const SKIP_LC = new Set(['bookmarks bar', 'other bookmarks', 'mobile bookmarks']);
    const allFolders = getAllFoldersFlat();
    let rendered = 0;

    function renderFolderNodes(nodes) {
        (nodes || []).forEach(function (node) {
            if (node.url) return;
            const isSystem = SKIP_LC.has((node.title || '').toLowerCase());
            if (isSystem) {
                renderFolderNodes(node.children);
                return;
            }
            container.appendChild(buildFolderCard(node, 0, allFolders));
            rendered++;
        });
    }

    renderFolderNodes(bookmarkTree[0] ? bookmarkTree[0].children : []);

    if (rendered === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No folders found. Create folders in Chrome to organise your bookmarks.';
        empty.className = 'text-sm text-zinc-400 dark:text-zinc-500 text-center py-10';
        container.appendChild(empty);
        return;
    }

    initManageDragDrop(container);
}

function initManageDragDrop(container) {
    let dragSrc = null;
    let dragType = null;

    container.addEventListener('dragstart', function (e) {
        const row = e.target.closest('.bookmark-manage-row');
        const card = e.target.closest('.manage-folder-card');

        if (row) {
            dragSrc = row;
            dragType = 'bookmark';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'bookmark:' + row.dataset.bookmarkId);
            requestAnimationFrame(function () { row.classList.add('opacity-50'); });
        } else if (card) {
            dragSrc = card;
            dragType = 'folder';
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'folder:' + card.dataset.folderId);
            requestAnimationFrame(function () { card.classList.add('opacity-50'); });
        }
    });

    container.addEventListener('dragend', function () {
        if (dragSrc) { dragSrc.classList.remove('opacity-50'); dragSrc = null; }
        dragType = null;
        container.querySelectorAll('.manage-drag-over').forEach(function (el) {
            el.classList.remove('manage-drag-over');
        });
    });

    container.addEventListener('dragover', function (e) {
        const targetCard = e.target.closest('.manage-folder-card');
        if (!targetCard || targetCard === dragSrc) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.manage-drag-over').forEach(function (el) {
            el.classList.remove('manage-drag-over');
        });
        targetCard.querySelector('.manage-card-header').classList.add('manage-drag-over');
    });

    container.addEventListener('dragleave', function (e) {
        const targetCard = e.target.closest('.manage-folder-card');
        if (targetCard && !targetCard.contains(e.relatedTarget)) {
            const hdr = targetCard.querySelector('.manage-card-header');
            if (hdr) hdr.classList.remove('manage-drag-over');
        }
    });

    container.addEventListener('drop', function (e) {
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;

        const colonIdx = data.indexOf(':');
        const type = data.slice(0, colonIdx);
        const id   = data.slice(colonIdx + 1);
        const targetCard = e.target.closest('.manage-folder-card');
        if (!targetCard) return;

        const hdr = targetCard.querySelector('.manage-card-header');
        if (hdr) hdr.classList.remove('manage-drag-over');

        if (type === 'folder' && targetCard.dataset.folderId !== id) {
            e.preventDefault();
            chrome.bookmarks.get(targetCard.dataset.folderId, function (nodes) {
                if (!nodes || !nodes[0]) return;
                const target = nodes[0];
                chrome.bookmarks.move(id, { parentId: target.parentId, index: target.index }, function () {
                    refreshManageAndMain();
                });
            });
        } else if (type === 'bookmark') {
            e.preventDefault();
            const targetFolderId = targetCard.dataset.folderId;
            chrome.bookmarks.move(id, { parentId: targetFolderId }, function () {
                refreshManageAndMain();
            });
        }
    });
}

// ─── Delete with Undo ─────────────────────────────────────────────────────────
let undoTimer = null;
let pendingDelete = null;

function deleteBookmarkWithUndo(bookmarkNode) {
    // If there's already a pending delete, commit it immediately
    if (pendingDelete) commitPendingDelete();

    // Save the full {bookmark, folder} entry so undo can restore folder context
    pendingDelete = allBookmarks.find(b => b.bookmark.id === bookmarkNode.id)
        || { bookmark: bookmarkNode, folder: "" };
    allBookmarks = allBookmarks.filter(b => b.bookmark.id !== bookmarkNode.id);
    updateView(searchInput.value.trim().toLowerCase());
    showUndoToast(`"${bookmarkNode.title}" deleted`);

    undoTimer = setTimeout(function () {
        commitPendingDelete();
    }, 5000);
}

function deleteBookmarkDirect(bookmarkNode) {
    allBookmarks = allBookmarks.filter(b => b.bookmark.id !== bookmarkNode.id);
    updateView(searchInput.value.trim().toLowerCase());
    chrome.bookmarks.remove(bookmarkNode.id, function () {
        chrome.storage.local.remove([bookmarkNode.url]);
    });
}

function commitPendingDelete() {
    if (!pendingDelete) return;
    const entry = pendingDelete;
    pendingDelete = null;
    clearTimeout(undoTimer);
    chrome.bookmarks.remove(entry.bookmark.id, function () {
        chrome.storage.local.remove([entry.bookmark.url]);
    });
    hideUndoToast();
}

function undoPendingDelete() {
    if (!pendingDelete) return;
    clearTimeout(undoTimer);
    const entry = pendingDelete;
    pendingDelete = null;
    hideUndoToast();
    // Restore the full entry including original folder context
    allBookmarks.push(entry);
    updateView(searchInput.value.trim().toLowerCase());
}

function showUndoToast(message) {
    const toast = document.getElementById("undo-toast");
    document.getElementById("undo-toast-message").textContent = message;
    toast.classList.remove("hidden");
}

function hideUndoToast() {
    document.getElementById("undo-toast").classList.add("hidden");
}

// ─── Duplicate detection ──────────────────────────────────────────────────────
function checkForDuplicates() {
    const groups = findDuplicateBookmarks(allBookmarks);
    const banner = document.getElementById("duplicate-banner");
    if (groups.length > 0) {
        document.getElementById("duplicate-count").textContent = groups.length;
        banner.classList.remove("hidden");
    } else {
        banner.classList.add("hidden");
    }
}

// ─── Dedup review modal ───────────────────────────────────────────────────────
let _dedupGroups = [];
let _dedupIndex = 0;

function openDedupReview() {
    const groups = findSameDomainGroups(allBookmarks);
    if (groups.length === 0) {
        alert('No same-domain bookmarks found.');
        return;
    }
    _dedupGroups = groups;
    _dedupIndex = 0;
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
    const bm = entry.bookmark;
    const row = document.createElement('div');
    row.className = 'flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700';
    row.dataset.bmId = bm.id;

    const favicon = document.createElement('img');
    try {
        favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=32`;
    } catch (e) { favicon.src = ''; }
    favicon.className = 'w-5 h-5 mt-0.5 flex-shrink-0 rounded object-contain';
    favicon.onerror = function () { this.style.display = 'none'; };

    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0';
    const title = document.createElement('p');
    title.className = 'text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate';
    title.textContent = bm.title || '(no title)';
    const url = document.createElement('p');
    url.className = 'text-xs text-zinc-500 dark:text-zinc-400 truncate';
    url.textContent = bm.url;
    const meta = document.createElement('p');
    meta.className = 'text-xs text-zinc-400 dark:text-zinc-500 mt-0.5';
    meta.textContent = [
        entry.folder ? `in ${entry.folder}` : '',
        bm.dateAdded ? new Date(bm.dateAdded).toLocaleDateString() : ''
    ].filter(Boolean).join('  ·  ');
    info.appendChild(title);
    info.appendChild(url);
    info.appendChild(meta);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'flex-shrink-0 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-2 py-1 rounded border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = function () {
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

function _advanceDedupGroup() {
    _dedupIndex++;
    if (_dedupIndex >= _dedupGroups.length) {
        document.getElementById('dedup-review-modal').classList.add('hidden');
        bootstrapBookmarks();
        return;
    }
    _renderDedupGroup();
}

function _closeDedupReview() {
    document.getElementById('dedup-review-modal').classList.add('hidden');
    bootstrapBookmarks();
}

function showDuplicatesView() {
    const groups = findDuplicateBookmarks(allBookmarks);
    if (groups.length === 0) return;

    folderList.innerHTML = "";
    const container = document.createElement("div");
    container.className = "w-full max-w-[1064px] mx-auto";

    const title = document.createElement("h1");
    title.textContent = `Duplicate Bookmarks (${groups.length} groups)`;
    title.className = "font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50 mb-4";
    container.appendChild(title);

    groups.forEach(function (group) {
        const groupDiv = document.createElement("div");
        groupDiv.className = "mb-6 p-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10";

        const urlLabel = document.createElement("p");
        urlLabel.className = "text-xs text-zinc-500 dark:text-zinc-400 mb-3 truncate";
        urlLabel.textContent = group[0].bookmark.url;
        groupDiv.appendChild(urlLabel);

        const cardsGrid = document.createElement("div");
        cardsGrid.className = "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";
        group.forEach(entry => {
            cardsGrid.appendChild(createBookmarkCard(entry.bookmark, "", entry.folder, allBookmarks, filterOptions));
        });
        groupDiv.appendChild(cardsGrid);
        container.appendChild(groupDiv);
    });

    folderList.appendChild(container);
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportAsJSON() {
    const data = allBookmarks.map(b => ({
        id:        b.bookmark.id,
        title:     b.bookmark.title,
        url:       b.bookmark.url,
        folder:    b.folder,
        dateAdded: b.bookmark.dateAdded,
        dateLastUsed: b.bookmark.dateLastUsed
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'bookmarks.json');
}

function exportAsHTML() {
    const lines = [
        '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        '<TITLE>Bookmarks</TITLE>',
        '<H1>Bookmarks</H1>',
        '<DL><p>'
    ];
    allBookmarks.forEach(b => {
        const addDate = b.bookmark.dateAdded ? Math.floor(b.bookmark.dateAdded / 1000) : '';
        lines.push(`    <DT><A HREF="${b.bookmark.url}" ADD_DATE="${addDate}">${b.bookmark.title || ''}</A>`);
    });
    lines.push('</DL><p>');
    const blob = new Blob([lines.join('\n')], { type: 'text/html' });
    triggerDownload(blob, 'bookmarks.html');
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── Bulk screenshot capture ──────────────────────────────────────────────────
// Check if a URL is network-reachable (DNS + TCP) before attempting screenshot.
// Uses no-cors so CORS policy never blocks us; throws only on real network errors.
async function isUrlReachable(url) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
        clearTimeout(timer);
        return true;
    } catch (_) {
        return false;
    }
}

// ─── First-run onboarding ─────────────────────────────────────────────────────
function showOnboardingModal() {
    const modal = document.getElementById('onboarding-modal');
    if (!modal) return;

    const withUrl = allBookmarks.filter(b => b.bookmark.url);
    const count = withUrl.length;

    // Bookmark count
    const countEl = document.getElementById('onboarding-bookmark-count');
    if (countEl) countEl.textContent = count.toLocaleString();

    // Build folder breakdown
    const folderCounts = {};
    for (const { folder } of allBookmarks) {
        if (folder) folderCounts[folder] = (folderCounts[folder] || 0) + 1;
    }
    const folderEntries = Object.entries(folderCounts).sort((a, b) => b[1] - a[1]);

    const folderCountEl = document.getElementById('onboarding-folder-count');
    if (folderCountEl) folderCountEl.textContent = folderEntries.length.toLocaleString();

    const folderListEl = document.getElementById('onboarding-folder-list');
    if (folderListEl) {
        folderListEl.innerHTML = folderEntries.map(([name, cnt]) =>
            `<div class="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                <div class="flex items-center gap-2 min-w-0">
                    <svg class="flex-shrink-0 text-zinc-400 dark:text-zinc-500" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
                    <span class="text-sm text-zinc-700 dark:text-zinc-300 truncate">${name}</span>
                </div>
                <span class="text-xs font-medium text-zinc-400 dark:text-zinc-500 ml-2 flex-shrink-0">${cnt}</span>
            </div>`
        ).join('');
    }

    // Show modal (full-page overlay works in both new-tab and popover mode)
    modal.classList.remove('hidden');

    const captureBtn    = document.getElementById('onboarding-capture-btn');
    const captureLabel  = document.getElementById('onboarding-capture-label');
    const skipBtn       = document.getElementById('onboarding-skip-btn');
    const backBtn       = document.getElementById('onboarding-back-btn');
    const progressWrap  = document.getElementById('onboarding-progress-wrap');
    const progressBar   = document.getElementById('onboarding-progress-bar');
    const progressStatus = document.getElementById('onboarding-progress-status');

    // Async: check how many thumbnails are missing and update button label
    const allUrls = withUrl.map(b => b.bookmark.url);
    chrome.storage.local.get(allUrls, function (existing) {
        const missingCount = allUrls.filter(u => !existing[u]).length;
        if (captureLabel) {
            if (missingCount > 0) {
                captureLabel.textContent = `Capture ${missingCount.toLocaleString()} Screenshot${missingCount === 1 ? '' : 's'}`;
            } else {
                captureLabel.textContent = 'All Screenshots Captured';
                captureBtn.disabled = true;
            }
        }
    });

    function dismiss() {
        modal.classList.add('hidden');
        chrome.storage.sync.set({ hasSeenOnboarding: true });
    }

    skipBtn.addEventListener('click', dismiss, { once: true });
    if (backBtn) backBtn.addEventListener('click', dismiss, { once: true });

    captureBtn.addEventListener('click', function () {
        chrome.storage.sync.set({ hasSeenOnboarding: true });

        const sorted = filterBookmarks(allBookmarks, '', new Set(), SORT_BY);
        const missing = sorted.filter(b => b.bookmark.url);
        const urls = missing.map(b => b.bookmark.url);

        chrome.storage.local.get(urls, function (result) {
            const toCapture = missing.filter(b => !result[b.bookmark.url]);

            if (toCapture.length === 0) {
                dismiss();
                return;
            }

            const total = toCapture.length;

            captureBtn.disabled = true;
            skipBtn.classList.add('hidden');
            progressWrap.classList.remove('hidden');
            progressBar.style.width = '0%';
            if (captureLabel) captureLabel.textContent = 'Starting…';

            function onProgress(type, url, index, _total, dataUrl) {
                if (type === 'loading') {
                    progressBar.style.width = Math.round(((index - 1) / total) * 100) + '%';
                    progressStatus.textContent = `Capturing ${index} of ${total}…`;
                    if (captureLabel) captureLabel.textContent = `Capturing ${index} / ${total}`;
                } else if (type === 'captured') {
                    progressBar.style.width = Math.round((index / total) * 100) + '%';
                    updateThumbnail(url, dataUrl);
                } else if (type === 'failed') {
                    progressBar.style.width = Math.round((index / total) * 100) + '%';
                }
            }

            function onDone(captured, failed, stopped) {
                progressBar.style.width = stopped ? progressBar.style.width : '100%';
                const parts = [`Done — ${captured} captured`];
                if (failed > 0) parts.push(`${failed} failed`);
                if (stopped) parts[0] = `Stopped — ${captured} captured`;
                progressStatus.textContent = parts.join(' · ');
                updateStorageUsage();
                setTimeout(dismiss, 2000);
            }

            bulkCaptureInWindow(toCapture, onProgress, onDone);
        });
    }, { once: true });
}

function bulkCaptureScreenshots() {
    const statusEl = document.getElementById('bulk-capture-status');
    const barWrap  = document.getElementById('bulk-capture-bar-wrap');
    const bar      = document.getElementById('bulk-capture-bar');
    const btn      = document.getElementById('bulk-capture-btn');

    const sorted = filterBookmarks(allBookmarks, '', new Set(), SORT_BY);
    const missing = sorted.filter(b => b.bookmark.url);
    const urls = missing.map(b => b.bookmark.url);

    chrome.storage.local.get(urls, function (result) {
        const toCapture = missing.filter(b => !result[b.bookmark.url]);

        if (toCapture.length === 0) {
            statusEl.textContent = 'All bookmarks already have screenshots!';
            statusEl.classList.remove('hidden');
            return;
        }

        const total = toCapture.length;
        const titleMap = new Map(toCapture.map(e => [e.bookmark.url, e.bookmark.title || e.bookmark.url]));

        btn.disabled = true;
        btn.textContent = 'Capturing…';
        statusEl.classList.remove('hidden');
        barWrap.classList.remove('hidden');
        bar.style.width = '0%';

        function onProgress(type, url, index, _total, dataUrl) {
            const name = titleMap.get(url) || url;
            if (type === 'loading') {
                bar.style.width = Math.round(((index - 1) / total) * 100) + '%';
                statusEl.textContent = `Capturing ${index}/${total}: ${name}`;
            } else if (type === 'captured') {
                bar.style.width = Math.round((index / total) * 100) + '%';
                statusEl.textContent = `Captured ${index}/${total}: ${name}`;
                updateThumbnail(url, dataUrl);
            } else if (type === 'failed') {
                bar.style.width = Math.round((index / total) * 100) + '%';
                statusEl.textContent = `Failed ${index}/${total}: ${name}`;
            }
        }

        function onDone(captured, failed, stopped) {
            btn.disabled = false;
            btn.textContent = 'Capture All Missing';
            bar.style.width = stopped ? bar.style.width : '100%';
            if (stopped) {
                statusEl.textContent = `Capture stopped · Captured: ${captured}`;
            } else {
                const parts = [`Captured: ${captured}`];
                if (failed > 0) parts.push(`Failed: ${failed}`);
                statusEl.textContent = parts.join(' · ');
            }
            updateStorageUsage();
            setTimeout(function () { barWrap.classList.add('hidden'); bar.style.width = '0%'; }, 3000);
        }

        bulkCaptureInWindow(toCapture, onProgress, onDone);
    });
}

// ─── Broken link validation ───────────────────────────────────────────────────
let brokenBookmarks = [];

async function checkBrokenLinks() {
    const statusEl  = document.getElementById("check-broken-status");
    const btn       = document.getElementById("check-broken-btn");
    const deleteBtn = document.getElementById("delete-broken-btn");

    brokenBookmarks = [];
    btn.disabled = true;
    btn.textContent = "Checking…";
    statusEl.textContent = "";
    statusEl.classList.remove("hidden");
    deleteBtn.classList.add("hidden");

    const toCheck = allBookmarks.filter(b => b.bookmark.url);
    const total   = toCheck.length;
    let checked   = 0;

    async function checkOne(entry) {
        const reachable = await isUrlReachable(entry.bookmark.url);
        checked++;
        statusEl.textContent = `Checking ${checked} / ${total}…`;
        if (!reachable) brokenBookmarks.push(entry.bookmark);
    }

    // Run 3 checks concurrently for speed
    const CONCURRENCY = 3;
    for (let i = 0; i < toCheck.length; i += CONCURRENCY) {
        await Promise.all(toCheck.slice(i, i + CONCURRENCY).map(checkOne));
    }

    btn.disabled = false;
    btn.textContent = "Check Broken Links";

    if (brokenBookmarks.length === 0) {
        statusEl.textContent = "All links are reachable.";
    } else {
        statusEl.textContent = `${brokenBookmarks.length} broken link${brokenBookmarks.length > 1 ? 's' : ''} found.`;
        deleteBtn.textContent = "Review & Delete";
        deleteBtn.classList.remove("hidden");
    }
}

function showBrokenConfirmModal() {
    if (brokenBookmarks.length === 0) return;

    const modal       = document.getElementById('broken-confirm-modal');
    const listEl      = document.getElementById('broken-confirm-list');
    const deleteLabel = document.getElementById('broken-confirm-delete-label');
    const deleteBtn   = document.getElementById('broken-confirm-delete');
    const cancelBtn   = document.getElementById('broken-confirm-cancel');
    const closeBtn    = document.getElementById('broken-confirm-close');

    function renderList() {
        listEl.innerHTML = brokenBookmarks.map(function (bm, idx) {
            const title = bm.title || bm.url;
            return `<div class="flex items-center gap-2 py-2 px-2">
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">${title}</p>
                    <p class="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">${bm.url}</p>
                </div>
                <button data-delete-idx="${idx}" aria-label="Delete this bookmark"
                    class="flex-shrink-0 p-1.5 rounded-md text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>`;
        }).join('');
        deleteLabel.textContent = `Delete All (${brokenBookmarks.length})`;
    }

    renderList();
    modal.classList.remove('hidden');

    function closeModal() {
        listEl.removeEventListener('click', onListClick);
        modal.classList.add('hidden');
    }

    function syncSettingsPanel() {
        const statusEl     = document.getElementById('check-broken-status');
        const deleteAllBtn = document.getElementById('delete-broken-btn');
        if (brokenBookmarks.length === 0) {
            if (statusEl) statusEl.textContent = 'All broken links deleted.';
            if (deleteAllBtn) deleteAllBtn.classList.add('hidden');
        } else {
            if (statusEl) statusEl.textContent = `${brokenBookmarks.length} broken link${brokenBookmarks.length > 1 ? 's' : ''} found.`;
            if (deleteAllBtn) deleteAllBtn.textContent = 'Review & Delete';
        }
    }

    // Delegated handler for per-row delete buttons
    function onListClick(e) {
        const btn = e.target.closest('[data-delete-idx]');
        if (!btn) return;
        const idx = parseInt(btn.getAttribute('data-delete-idx'), 10);
        const bm = brokenBookmarks[idx];
        if (!bm) return;

        chrome.bookmarks.remove(bm.id, function () {
            chrome.storage.local.remove([bm.url]);
            refreshApp();
        });
        brokenBookmarks.splice(idx, 1);
        syncSettingsPanel();

        if (brokenBookmarks.length === 0) {
            closeModal();
        } else {
            renderList();
        }
    }

    listEl.addEventListener('click', onListClick);
    closeBtn.addEventListener('click', closeModal, { once: true });
    cancelBtn.addEventListener('click', closeModal, { once: true });
    deleteBtn.addEventListener('click', function () {
        closeModal();
        bulkDeleteBroken();
    }, { once: true });
}

function bulkDeleteBroken() {
    if (brokenBookmarks.length === 0) return;
    const btn       = document.getElementById("delete-broken-btn");
    const statusEl  = document.getElementById("check-broken-status");
    const total     = brokenBookmarks.length;

    btn.disabled = true;
    btn.textContent = "Deleting…";

    let i = 0;
    function removeNext() {
        if (i >= brokenBookmarks.length) {
            brokenBookmarks = [];
            btn.classList.add("hidden");
            btn.disabled = false;
            statusEl.textContent = `Deleted ${total} broken bookmark${total > 1 ? 's' : ''}.`;
            refreshApp();
            return;
        }
        const bm = brokenBookmarks[i++];
        chrome.bookmarks.remove(bm.id, function () {
            chrome.storage.local.remove([bm.url]);
            removeNext();
        });
    }
    removeNext();
}

// ─── Empty folder removal ─────────────────────────────────────────────────────
// Returns ids of outermost folders that contain zero bookmarks at any depth.
// System root folders (Bookmarks Bar etc.) are never added but are traversed.
function findEmptyFolderIds(tree) {
    const SKIP_LC = new Set(['bookmarks bar', 'other bookmarks', 'mobile bookmarks']);
    const isSkipped = title => SKIP_LC.has((title || '').toLowerCase());
    const emptyIds = [];

    function hasBookmark(node) {
        if (node.url) return true;
        return (node.children || []).some(hasBookmark);
    }

    function collect(nodes) {
        (nodes || []).forEach(function (node) {
            if (node.url) return;                          // skip individual bookmarks
            if (isSkipped(node.title)) { collect(node.children); return; } // enter root folders, never delete them
            if (!hasBookmark(node)) {
                emptyIds.push(node.id);                    // whole subtree is empty — delete at this level
            } else {
                collect(node.children);                    // contains bookmarks — descend to find empty sub-folders
            }
        });
    }

    if (tree && tree[0]) collect(tree[0].children);
    return emptyIds;
}

// Silent: called automatically on load and after every refresh.
// Uses _isCleaningUp to prevent onRemoved from firing extra refreshApp calls.
async function cleanupEmptyFolders() {
    if (_isCleaningUp) return;
    const emptyIds = findEmptyFolderIds(bookmarkTree);
    if (emptyIds.length === 0) return;

    _isCleaningUp = true;
    for (const id of emptyIds) {
        await new Promise(resolve => {
            chrome.bookmarks.removeTree(id, function () {
                void chrome.runtime.lastError; // folder may already be gone
                resolve();
            });
        });
    }
    _isCleaningUp = false;
    refreshApp();
}

// ─── Storage usage ─────────────────────────────────────────────────────────────
function updateStorageUsage() {
    chrome.storage.local.getBytesInUse(null, function (bytesInUse) {
        const MB = (bytesInUse / (1024 * 1024)).toFixed(1);
        const LIMIT_MB = 20;
        const pct = Math.min(100, ((bytesInUse / (1024 * 1024)) / LIMIT_MB) * 100).toFixed(0);

        const textEl = document.getElementById("storage-usage-text");
        const barEl  = document.getElementById("storage-usage-bar");
        if (textEl) textEl.textContent = `${MB} MB / ${LIMIT_MB} MB`;
        if (barEl)  {
            barEl.style.width = `${pct}%`;
            barEl.className = `h-1.5 rounded-full transition-all ${
                pct > 80 ? 'bg-rose-600' : pct > 60 ? 'bg-amber-500' : 'bg-indigo-500'
            }`;
        }
    });
}

// ─── Get bookmark data from card element ──────────────────────────────────────
function getBookmarkFromCard(cardElement) {
    const bookmarkId  = cardElement.getAttribute('data-bookmark-id');
    const bookmarkUrl = cardElement.getAttribute('data-bookmark-url');
    const parentId    = cardElement.getAttribute('data-parent-id');
    if (!bookmarkId) return null;
    const entry = allBookmarks.find(b => b.bookmark.id === bookmarkId);
    if (entry) return entry.bookmark;
    // Fallback: reconstruct minimal node
    const link = cardElement.querySelector('a[href]');
    return {
        id:       bookmarkId,
        url:      bookmarkUrl || (link ? link.href : ''),
        title:    link ? link.textContent.trim() : '',
        parentId: parentId || '1'
    };
}
window.getBookmarkFromCard = getBookmarkFromCard;

// ─── Wire all event listeners ─────────────────────────────────────────────────
function resetFeedbackPanel() {
    const name   = document.getElementById('feedback-name');
    const email  = document.getElementById('feedback-email');
    const msg    = document.getElementById('feedback-message');
    const cat    = document.getElementById('feedback-category');
    const status = document.getElementById('feedback-status');
    const submit = document.getElementById('feedback-submit');
    if (name)   name.value   = '';
    if (email)  email.value  = '';
    if (msg)    msg.value    = '';
    if (cat)    cat.selectedIndex = 0;
    if (status) { status.textContent = ''; status.classList.add('hidden'); }
    if (submit) { submit.disabled = false; submit.textContent = 'Send'; }
}

function wireEventListeners() {
    // Search
    const performSearch = debounce(function (searchTerm) { updateView(searchTerm); }, 300);
    searchInput.addEventListener("input", function () {
        if (searchInput.value) {
            clearSearch.classList.remove("hidden");
            searchIcon.classList.remove("text-zinc-400");
            searchIcon.classList.add("text-indigo-500");
            performSearch(searchInput.value.trim().toLowerCase());
        } else {
            performSearch.cancel && performSearch.cancel();
            clearSearch.classList.add("hidden");
            searchIcon.classList.remove("text-indigo-500");
            searchIcon.classList.add("text-zinc-400");
            updateView("");
        }
    });

    clearSearch.addEventListener("click", function () {
        searchInput.value = "";
        performSearch.cancel && performSearch.cancel();
        clearSearch.classList.add("hidden");
        searchIcon.classList.remove("text-indigo-500");
        searchIcon.classList.add("text-zinc-400");
        updateView("");
    });


    // Undo toast
    document.getElementById("undo-btn").addEventListener("click", function () {
        undoPendingDelete();
    });

    // Duplicate banner
    document.getElementById("show-duplicates-btn").addEventListener("click", function () {
        showDuplicatesView();
    });

    // Dedup button (top-left controls)
    document.getElementById("dedup-btn").addEventListener("click", function () {
        openDedupReview();
    });

    // Dedup review modal controls
    document.getElementById('dedup-review-close').addEventListener('click', _closeDedupReview);
    document.getElementById('dedup-skip-btn').addEventListener('click', _advanceDedupGroup);
    document.getElementById('dedup-next-btn').addEventListener('click', _advanceDedupGroup);
    document.getElementById('dedup-review-modal').addEventListener('click', function (e) {
        if (e.target === this) _closeDedupReview();
    });

    // Export
    document.getElementById("export-json-btn").addEventListener("click", function () {
        exportAsJSON();
        document.getElementById("settings-modal").classList.add("hidden");
    });
    document.getElementById("export-html-btn").addEventListener("click", function () {
        exportAsHTML();
        document.getElementById("settings-modal").classList.add("hidden");
    });

    // Feedback inline panel (main page only — button was moved to popover footer)
    const feedbackBtn = document.getElementById("feedback-btn");
    if (feedbackBtn) {
        feedbackBtn.addEventListener("click", function () {
            const settingsModal = document.getElementById("settings-modal");
            if (settingsModal) {
                settingsModal.classList.remove("hidden");
                const modalCard = settingsModal.querySelector(':scope > div:first-child');
                if (modalCard) modalCard.classList.add("hidden");
            }
            document.getElementById("feedback-panel").classList.remove("hidden");
        });
    }

    const feedbackCloseBtn = document.getElementById("feedback-close-btn");
    if (feedbackCloseBtn) {
        feedbackCloseBtn.addEventListener("click", function () {
            document.getElementById("feedback-panel").classList.add("hidden");
            const settingsModal = document.getElementById("settings-modal");
            if (settingsModal) {
                settingsModal.classList.add("hidden");
                const modalCard = settingsModal.querySelector(':scope > div:first-child');
                if (modalCard) modalCard.classList.remove("hidden");
            }
            resetFeedbackPanel();
        });
    }

    const WEB3FORMS_KEY = '56a936e3-0acc-4228-b78a-35aa7b5ddd13';

    document.getElementById('feedback-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        const name     = document.getElementById('feedback-name').value.trim();
        const email    = document.getElementById('feedback-email').value.trim();
        const category = document.getElementById('feedback-category').value;
        const message  = document.getElementById('feedback-message').value.trim();
        const submit   = document.getElementById('feedback-submit');
        const status   = document.getElementById('feedback-status');

        if (!name) {
            status.textContent = 'Please enter your name.';
            status.className = 'text-xs text-center text-red-500';
            status.classList.remove('hidden');
            return;
        }

        if (!message) {
            status.textContent = 'Please enter a message.';
            status.className = 'text-xs text-center text-red-500';
            status.classList.remove('hidden');
            return;
        }

        submit.disabled = true;
        submit.textContent = 'Sending…';
        status.classList.add('hidden');

        try {
            const res = await fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    access_key: WEB3FORMS_KEY,
                    subject: `Bookmark Hero Feedback — ${category}`,
                    name,
                    email: email || 'Not provided',
                    category,
                    message
                })
            });
            const data = await res.json();
            if (data.success) {
                status.textContent = 'Thanks! Your feedback was sent.';
                status.className = 'text-xs text-center text-green-600 dark:text-green-400';
                document.getElementById('feedback-name').value = '';
                document.getElementById('feedback-email').value = '';
                document.getElementById('feedback-message').value = '';
                document.getElementById('feedback-category').selectedIndex = 0;
                submit.textContent = 'Send';
                submit.disabled = false;
            } else {
                throw new Error('Failed');
            }
        } catch {
            status.textContent = 'Something went wrong. Please try again.';
            status.className = 'text-xs text-center text-red-500';
            submit.textContent = 'Send';
            submit.disabled = false;
        }
        status.classList.remove('hidden');
    });

    // Bulk capture
    document.getElementById("bulk-capture-btn").addEventListener("click", function () {
        bulkCaptureScreenshots();
    });

    // Broken links
    document.getElementById("check-broken-btn").addEventListener("click", function () {
        checkBrokenLinks();
    });
    document.getElementById("delete-broken-btn").addEventListener("click", function () {
        showBrokenConfirmModal();
    });

    // Edit modal
    const cancelEditButton = document.getElementById("cancel-edit");
    const saveEditButton   = document.getElementById("save-edit");
    const editModal        = document.getElementById("edit-modal");

    if (cancelEditButton) cancelEditButton.addEventListener("click", closeEditModal);

    if (saveEditButton) {
        saveEditButton.addEventListener("click", function () {
            if (!window.currentBookmarkNode) return;
            const newTitle    = document.getElementById("edit-title").value.trim();
            const newUrl      = document.getElementById("edit-url").value.trim();
            const newParentId = document.getElementById("folder-dropdown").value;

            if (!newTitle || !newUrl) return;

            chrome.bookmarks.update(window.currentBookmarkNode.id, { title: newTitle, url: newUrl }, function () {
                if (newParentId !== window.currentBookmarkNode.parentId) {
                    chrome.bookmarks.move(window.currentBookmarkNode.id, { parentId: newParentId }, function () {
                        closeEditModal();
                        refreshApp();
                    });
                } else {
                    closeEditModal();
                    refreshApp();
                }
            });
        });
    }

    if (editModal) {
        editModal.addEventListener("click", function (e) {
            if (e.target === editModal) closeEditModal();
        });
    }

    // Edit folder dropdown open/close
    const editFolderBtn   = document.getElementById('edit-folder-btn');
    const editFolderPanel = document.getElementById('edit-folder-panel');
    const editFolderArrow = document.getElementById('edit-folder-arrow');

    if (editFolderBtn && editFolderPanel) {
        editFolderBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = !editFolderPanel.classList.contains('hidden');
            editFolderPanel.classList.toggle('hidden');
            editFolderBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
            if (editFolderArrow) editFolderArrow.classList.toggle('rotate-180', !isOpen);
        });

        editFolderPanel.addEventListener('click', e => e.stopPropagation());

        document.addEventListener('click', function () {
            if (!editFolderPanel.classList.contains('hidden')) {
                editFolderPanel.classList.add('hidden');
                editFolderBtn.setAttribute('aria-expanded', 'false');
                if (editFolderArrow) editFolderArrow.classList.remove('rotate-180');
            }
        });
    }

    // Manage panel
    const managePanelBtn  = document.getElementById('manage-btn');
    const closeManageBtn  = document.getElementById('close-manage-btn');
    const managePanelEl   = document.getElementById('manage-panel');

    if (managePanelBtn) managePanelBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openManagePanel();
    });
    if (closeManageBtn) closeManageBtn.addEventListener('click', closeManagePanel);
    if (managePanelEl) managePanelEl.addEventListener('click', function (e) {
        if (e.target === managePanelEl) closeManagePanel();
    });
}

// ─── Globals for keyboard-shortcuts.js ───────────────────────────────────────
window.showPopupMenu         = showPopupMenu;
window.openEditModal         = openEditModal;
window.closeEditModal        = closeEditModal;
window.deleteBookmark        = deleteBookmarkWithUndo;
window.captureScreenshot     = captureScreenshot;
window.handleScreenshotCapture = handleScreenshotCapture;
window.openManagePanel       = openManagePanel;
window.closeManagePanel      = closeManagePanel;

// ─── Popover mode ─────────────────────────────────────────────────────────────

function initPopoverMode() {
    // Chrome popup size = document size. Set explicit dimensions so the popup
    // window is the right size; fixed inset-0 would give a zero-height document.
    document.documentElement.style.width    = '380px';
    document.documentElement.style.height   = '560px';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.width    = '380px';
    document.body.style.height   = '560px';
    document.body.style.overflow = 'hidden';
    document.body.style.margin   = '0';

    // Show popover layout, hide the normal page layout
    document.getElementById('popover-layout').classList.remove('hidden');
    document.getElementById('app-header').classList.add('hidden');
    document.querySelector('main').classList.add('hidden');
    document.querySelector('footer').classList.add('hidden');

    // Move settings-modal into the settings page content area (strip modal positioning)
    const settingsPageContent = document.getElementById('popover-settings-content');
    const settingsModalEl = document.getElementById('settings-modal');
    settingsModalEl.className = 'flex flex-col relative overflow-hidden';
    settingsModalEl.dataset.embedded = 'true'; // prevents Escape handler from treating it as a dialog
    // Strip the inner card wrapper styling so it reads as a flat embedded section
    const settingsInnerCard = settingsModalEl.querySelector('.rounded-xl');
    if (settingsInnerCard) settingsInnerCard.className = 'flex flex-col relative overflow-hidden flex-1';
    // Hide the modal header (popover has its own settings page header / back button)
    const settingsModalHeader = document.getElementById('settings-modal-header');
    if (settingsModalHeader) settingsModalHeader.classList.add('hidden');
    settingsPageContent.appendChild(settingsModalEl);
    settingsModalEl.classList.remove('hidden');

    // In popover mode delete immediately — no undo toast
    window.deleteBookmark = deleteBookmarkDirect;

    // Wire popover search (syncs value to main searchInput so existing code works)
    const popoverSearch = document.getElementById('popover-search-input');
    const popoverClear  = document.getElementById('popover-clear-search');

    const debouncedSearch = debounce(function () {
        const term = popoverSearch.value.trim().toLowerCase();
        searchInput.value = term;
        popoverClear.classList.toggle('hidden', !term);
        updateView(term);
    }, 200);

    popoverSearch.addEventListener('input', debouncedSearch);
    popoverClear.addEventListener('click', function () {
        popoverSearch.value = '';
        searchInput.value   = '';
        popoverClear.classList.add('hidden');
        updateView('');
    });

    // Wire footer buttons
    document.getElementById('popover-dedup-btn').addEventListener('click', function () {
        openDedupReview();
    });
    document.getElementById('popover-manage-btn').addEventListener('click', function () {
        document.getElementById('popover-manage-page').classList.remove('hidden');
        renderManageContent('popover-manage-folder-list');
    });
    document.getElementById('popover-manage-back').addEventListener('click', function () {
        document.getElementById('popover-manage-page').classList.add('hidden');
    });

    document.getElementById('popover-settings-btn').addEventListener('click', function () {
        document.getElementById('popover-settings-page').classList.remove('hidden');
        updateStorageUsage();
    });
    document.getElementById('popover-settings-back').addEventListener('click', function () {
        document.getElementById('popover-settings-page').classList.add('hidden');
        document.getElementById('feedback-panel').classList.add('hidden');
    });

    // Build folder filter panel
    buildPopoverFilterPanel();

    const filterBtn   = document.getElementById('popover-filter-btn');
    const filterPanel = document.getElementById('popover-filter-panel');

    // Move to body to escape the search bar's overflow:hidden clipping context
    document.body.appendChild(filterPanel);
    filterPanel.style.position = 'fixed';
    filterPanel.style.zIndex   = '9999';

    function positionPopoverPanel() {
        const rect = filterBtn.getBoundingClientRect();
        filterPanel.style.top   = (rect.bottom + 4) + 'px';
        filterPanel.style.right = (window.innerWidth - rect.right) + 'px';
        filterPanel.style.left  = 'auto';
    }

    filterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        const isOpen = !filterPanel.classList.contains('hidden');
        if (!isOpen) positionPopoverPanel();
        filterPanel.classList.toggle('hidden');
        filterBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    });
    document.addEventListener('click', function () {
        if (!filterPanel.classList.contains('hidden')) {
            filterPanel.classList.add('hidden');
            filterBtn.setAttribute('aria-expanded', 'false');
        }
    });
    filterPanel.addEventListener('click', e => e.stopPropagation());

    // Popover Feedback Page
    const WEB3FORMS_KEY_POPOVER = '56a936e3-0acc-4228-b78a-35aa7b5ddd13';
    const popoverFeedbackBtn  = document.getElementById('popover-feedback-btn');
    const popoverFeedbackPage = document.getElementById('popover-feedback-page');
    const popoverFeedbackBack = document.getElementById('popover-feedback-back');

    if (popoverFeedbackBtn && popoverFeedbackPage && popoverFeedbackBack) {
        popoverFeedbackBtn.addEventListener('click', function () {
            popoverFeedbackPage.classList.remove('hidden');
        });
        popoverFeedbackBack.addEventListener('click', function () {
            popoverFeedbackPage.classList.add('hidden');
        });
    }

    const popoverFeedbackForm = document.getElementById('popover-feedback-form');
    if (popoverFeedbackForm) {
        popoverFeedbackForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const name     = document.getElementById('popover-feedback-name').value.trim();
            const email    = document.getElementById('popover-feedback-email').value.trim();
            const category = document.getElementById('popover-feedback-category').value;
            const message  = document.getElementById('popover-feedback-message').value.trim();
            const submit   = document.getElementById('popover-feedback-submit');
            const status   = document.getElementById('popover-feedback-status');

            if (!name) {
                status.textContent = 'Please enter your name.';
                status.className = 'text-xs text-center text-red-500';
                status.classList.remove('hidden');
                return;
            }
            if (!message) {
                status.textContent = 'Please enter a message.';
                status.className = 'text-xs text-center text-red-500';
                status.classList.remove('hidden');
                return;
            }

            submit.disabled = true;
            submit.textContent = 'Sending…';
            status.classList.add('hidden');

            try {
                const res = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        access_key: WEB3FORMS_KEY_POPOVER,
                        subject: `Bookmark Hero Feedback — ${category}`,
                        name,
                        email: email || 'Not provided',
                        category,
                        message
                    })
                });
                const data = await res.json();
                if (data.success) {
                    status.textContent = 'Thanks! Your feedback was sent.';
                    status.className = 'text-xs text-center text-green-600 dark:text-green-400';
                    document.getElementById('popover-feedback-name').value = '';
                    document.getElementById('popover-feedback-email').value = '';
                    document.getElementById('popover-feedback-message').value = '';
                    document.getElementById('popover-feedback-category').selectedIndex = 0;
                    submit.textContent = 'Send';
                    submit.disabled = false;
                } else {
                    throw new Error('Failed');
                }
            } catch {
                status.textContent = 'Something went wrong. Please try again.';
                status.className = 'text-xs text-center text-red-500';
                submit.textContent = 'Send';
                submit.disabled = false;
            }
            status.classList.remove('hidden');
        });
    }
}

function buildPopoverFilterPanel() {
    const panel = document.getElementById('popover-filter-panel');
    if (!panel) return;
    panel.innerHTML = '';

    const allItem = document.createElement('div');
    allItem.className = `flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer text-sm font-medium ${FILTER_IDS.size === 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-200'}`;
    allItem.textContent = 'All Folders';
    allItem.addEventListener('click', function () {
        FILTER_IDS.clear();
        updatePopoverFilterLabel();
        updateFilterLabel();
        buildPopoverFilterPanel();
        updateView(document.getElementById('popover-search-input').value.trim().toLowerCase());
    });
    panel.appendChild(allItem);

    const divider = document.createElement('div');
    divider.className = 'h-px bg-zinc-100 dark:bg-zinc-700 mx-2 my-1';
    panel.appendChild(divider);

    filterOptions.forEach(function (opt) {
        if (opt.type === 'divider') {
            const d = document.createElement('div');
            d.className = 'h-px bg-zinc-100 dark:bg-zinc-700 mx-2 my-1';
            panel.appendChild(d);
            return;
        }
        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 py-1.5 pr-3 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer';
        item.style.paddingLeft = `${12 + (opt.depth || 0) * 12}px`;

        const TICK_SVG = `<svg width="9" height="7" viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 3L3.5 5.5L8 1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt.value;
        cb.className = 'sr-only';
        cb.checked = FILTER_IDS.has(String(opt.value));

        const checkmark = document.createElement('div');
        function updateCbCheckmark(checked) {
            if (checked) {
                checkmark.className = 'w-3.5 h-3.5 flex-shrink-0 rounded border border-indigo-500 bg-indigo-500 flex items-center justify-center transition-colors';
                checkmark.innerHTML = TICK_SVG;
            } else {
                checkmark.className = 'w-3.5 h-3.5 flex-shrink-0 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent flex items-center justify-center transition-colors';
                checkmark.innerHTML = '';
            }
        }
        updateCbCheckmark(cb.checked);
        cb.addEventListener('change', () => updateCbCheckmark(cb.checked));

        const lbl = document.createElement('span');
        lbl.className = 'text-sm text-zinc-700 dark:text-zinc-200 truncate';
        lbl.textContent = opt.label ? opt.label.replace(/^[-\s]+/, '') : '';

        item.appendChild(cb);
        item.appendChild(checkmark);
        item.appendChild(lbl);
        item.addEventListener('click', function (e) {
            e.stopPropagation();
            const checked = !FILTER_IDS.has(String(opt.value));
            if (checked) FILTER_IDS.add(String(opt.value));
            else FILTER_IDS.delete(String(opt.value));
            cb.checked = checked;
            updateCbCheckmark(checked);
            updatePopoverFilterLabel();
            updateFilterLabel();
            updateView(document.getElementById('popover-search-input').value.trim().toLowerCase());
        });
        panel.appendChild(item);
    });
}

function updatePopoverFilterLabel() {
    const label = document.getElementById('popover-filter-label');
    if (label) {
        label.textContent = FILTER_IDS.size > 0
            ? `${FILTER_IDS.size} folder${FILTER_IDS.size > 1 ? 's' : ''}`
            : 'All Folders';
    }
}

function showPopoverList(searchTerm) {
    const expandedIds = FILTER_IDS.size > 0
        ? [...expandFolderIds([...FILTER_IDS], bookmarkTree)]
        : [];
    const filteredBookmarks = filterBookmarks(allBookmarks, searchTerm, expandedIds, SORT_BY);

    const listEl = document.getElementById('popover-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (filteredBookmarks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'flex flex-col items-center justify-center py-12 text-center px-4';
        empty.innerHTML = `
            <div class="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-300 dark:text-zinc-600 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </div>
            <p class="text-xs text-zinc-400 dark:text-zinc-500">${searchTerm ? `No results for "${searchTerm}"` : 'No bookmarks found'}</p>`;
        listEl.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    filteredBookmarks.forEach(function (bm) {
        if (bm.children) return;
        fragment.appendChild(buildPopoverCard(bm.bookmark, bm.folder));
    });
    listEl.appendChild(fragment);
}

function buildPopoverCard(bookmarkNode, folderName) {
    const wrapper = document.createElement('div');
    wrapper.className = 'relative group border-b border-zinc-100 dark:border-zinc-800';

    const card = document.createElement('a');
    card.href   = bookmarkNode.url;
    card.target = '_blank';
    card.rel    = 'noopener noreferrer';
    card.className = 'flex items-center gap-3 px-3 py-2.5 pr-16 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer no-underline';

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'w-16 h-11 rounded-md flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 overflow-hidden';
    const img = document.createElement('img');
    img.alt = '';
    getThumbnailUrl(bookmarkNode.url, function (url) {
        img.src = url;
        if (url.startsWith('https://www.google.com/s2/favicons')) {
            thumb.classList.add('flex', 'items-center', 'justify-center');
            img.className = 'w-5 h-5 object-contain flex-shrink-0';
        } else {
            img.className = 'w-full h-full object-cover';
        }
    });
    thumb.appendChild(img);

    // Text
    const info = document.createElement('div');
    info.className = 'flex-1 min-w-0';

    const title = document.createElement('div');
    title.className = 'text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate leading-tight';
    title.textContent = bookmarkNode.title || bookmarkNode.url;

    const domain = document.createElement('div');
    domain.className = 'text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5';
    try { domain.textContent = new URL(bookmarkNode.url).hostname.replace(/^www\./, ''); }
    catch (_) { domain.textContent = bookmarkNode.url; }

    info.appendChild(title);
    info.appendChild(domain);

    if (folderName) {
        const folder = document.createElement('div');
        folder.className = 'text-xs text-indigo-400 dark:text-indigo-500 truncate mt-0.5';
        folder.textContent = folderName;
        info.appendChild(folder);
    }

    card.appendChild(thumb);
    card.appendChild(info);
    wrapper.appendChild(card);

    // Hover action buttons: edit + delete
    const actions = document.createElement('div');
    actions.className = 'absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10';

    const btnBase = 'flex items-center justify-center w-6 h-6 rounded bg-white/90 dark:bg-zinc-800/90 shadow-sm border border-zinc-200/80 dark:border-zinc-600/80 cursor-pointer';

    const editBtn = document.createElement('button');
    editBtn.setAttribute('aria-label', 'Edit ' + bookmarkNode.title);
    editBtn.className = btnBase + ' text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400';
    editBtn.appendChild(iconEl('pencil', 'w-3 h-3'));
    editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (window.openEditModal) window.openEditModal(bookmarkNode);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('aria-label', 'Delete ' + bookmarkNode.title);
    deleteBtn.className = btnBase + ' text-zinc-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400';
    deleteBtn.appendChild(iconEl('trash-2', 'w-3 h-3'));
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (window.deleteBookmark) window.deleteBookmark(bookmarkNode);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    wrapper.appendChild(actions);
    return wrapper;
}

// ─── View Mode Toggle (settings) ─────────────────────────────────────────────

function initViewModeToggle() {
    chrome.storage.sync.get(['viewMode', 'showOnNewTab'], function (result) {
        updateViewModeUI(result.viewMode || 'new-tab');
        updateNewTabToggleUI(result.showOnNewTab !== false);
    });

    const newTabToggle = document.getElementById('new-tab-toggle');
    if (newTabToggle) {
        newTabToggle.addEventListener('click', function () {
            const current = newTabToggle.getAttribute('aria-checked') === 'true';
            const next = !current;
            chrome.storage.sync.set({ showOnNewTab: next });
            updateNewTabToggleUI(next);
        });
    }

    document.querySelectorAll('.view-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const mode = btn.dataset.view;
            chrome.storage.sync.set({ viewMode: mode });
            updateViewModeUI(mode);
            // Immediately update the toolbar icon behaviour
            if (mode === 'popover') {
                chrome.action.setPopup({ popup: chrome.runtime.getURL('main.html') + '?mode=popover' });
            } else {
                chrome.action.setPopup({ popup: '' });
            }
        });
    });
}

function updateViewModeUI(mode) {
    document.querySelectorAll('.view-mode-btn').forEach(function (btn) {
        const active = btn.dataset.view === mode;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.classList.remove(
            'bg-indigo-50', 'border-2', 'border-indigo-400', 'text-indigo-700',
            'dark:bg-indigo-500/10', 'dark:border-indigo-400', 'dark:text-indigo-200',
            'bg-white', 'text-zinc-500', 'dark:bg-zinc-700', 'dark:text-zinc-300',
            'shadow-sm', 'text-zinc-900', 'dark:text-zinc-100', 'dark:text-zinc-400'
        );
        if (active) {
            btn.classList.add('bg-indigo-50', 'border-2', 'border-indigo-400', 'text-indigo-700',
                'dark:bg-indigo-500/10', 'dark:border-indigo-400', 'dark:text-indigo-200');
        } else {
            btn.classList.add('bg-white', 'text-zinc-500', 'dark:bg-zinc-700', 'dark:text-zinc-300');
        }
    });
}

function updateNewTabToggleUI(enabled) {
    const toggle = document.getElementById('new-tab-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
    const thumb = toggle.querySelector('span');
    if (enabled) {
        toggle.classList.remove('bg-zinc-300', 'dark:bg-zinc-600');
        toggle.classList.add('bg-indigo-500');
        if (thumb) { thumb.classList.remove('translate-x-1'); thumb.classList.add('translate-x-4'); }
    } else {
        toggle.classList.remove('bg-indigo-500');
        toggle.classList.add('bg-zinc-300', 'dark:bg-zinc-600');
        if (thumb) { thumb.classList.remove('translate-x-4'); thumb.classList.add('translate-x-1'); }
    }
}
