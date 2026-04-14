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
import analytics from './modules/analytics-integration.js';
import { exportAsJSON, exportAsHTML } from './modules/export-bookmarks.js';
import {
    initDedup, checkForDuplicates, openDedupReview, advanceDedupGroup,
    closeDedupReview, wireDedupListeners, showDuplicatesView
} from './modules/dedup.js';
import {
    initManagePanel, openManagePanel, closeManagePanel,
    renderManageContent, refreshManageAndMain, wireManageListeners
} from './modules/manage-panel.js';
import {
    initAiChat, hasAiMessages, onSearchModeSet as aiOnSearchModeSet,
    setAiProvider, wireAiListeners, sendAiMessage, renderAiMessages,
    renderHistoryPanel, clearPendingImage
} from './modules/ai-chat.js';


// ─── App State ───────────────────────────────────────────────────────────────
let FILTER_IDS = new Set(); // set of selected folder id strings
let SORT_BY = 'recently-added';
let GRID_COLS = 4;
let SEARCH_MODE = 'bookmarks'; // 'bookmarks' | 'web' | 'ai'
let allBookmarks = [];
let filterOptions = [];
let bookmarkTree = null;
let _isCleaningUp = false; // prevents onRemoved loop during empty-folder cleanup

// ─── Popover mode detection ───────────────────────────────────────────────────
const isPopoverMode = new URLSearchParams(window.location.search).get('mode') === 'popover';

// ─── Grid columns toggle ─────────────────────────────────────────────────────
function applyGridColsUI() {
    document.querySelectorAll('.grid-cols-btn').forEach(btn => {
        const val = Number(btn.getAttribute('data-grid-cols'));
        const isActive = val === GRID_COLS;
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.classList.remove(
            'bg-indigo-50', 'border-2', 'border-indigo-400', 'text-indigo-700',
            'bg-white', 'text-zinc-500', 'dark:bg-indigo-500/10', 'dark:border-indigo-400', 'dark:text-indigo-200',
            'dark:bg-zinc-700', 'dark:text-zinc-300'
        );
        if (isActive) {
            btn.classList.add('bg-indigo-50', 'border-2', 'border-indigo-400', 'text-indigo-700', 'dark:bg-indigo-500/10', 'dark:border-indigo-400', 'dark:text-indigo-200');
        } else {
            btn.classList.add('bg-white', 'text-zinc-500', 'dark:bg-zinc-700', 'dark:text-zinc-300');
        }
    });
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────
let folderList, searchInput, clearSearch, searchIcon, settingsButton;

// ─── Boot ─────────────────────────────────────────────────────────────────────
getCachedBookmarks().then(function (bookmarks) {
    // Initialize analytics early
    analytics.initializeAnalytics();

    // Initialize extracted modules
    initAiChat({ setHeroCompact, isPopoverMode });
    initDedup({
        getState: () => ({ allBookmarks, filterOptions }),
        createBookmarkCard,
        closeAllModals,
        bootstrapBookmarks
    });
    initManagePanel({
        getState:             () => ({ appState: { bookmarkTree, allBookmarks, filterOptions, isPopoverMode } }),
        getThumbnailUrl,
        updateView,
        getSearchTerm,
        rebuildLocalState:    _rebuildLocalState,
        buildPopoverFilterPanel
    });
    
    bookmarkTree = bookmarks;
    folderList        = document.getElementById("folder-list");
    searchInput       = document.getElementById("search-input");
    clearSearch       = document.getElementById("clear-search");
    searchIcon        = document.getElementById("search-icon");
    settingsButton    = document.getElementById("settings-btn");

    // Greeting
    updateGreeting();

    // Theme
    initializeThemeToggle();
    // New Tab toggle (in settings)
    initNewTabToggle();
    // View mode toggle (in settings)
    initViewModeToggle();

    // Settings modal
    let settingsModalOpen = false;
    const settingsModal = document.getElementById("settings-modal");
    settingsButton.addEventListener("click", function (event) {
        event.stopPropagation();
        const willOpen = settingsModal.classList.contains('hidden');
        if (willOpen) {
            closeAllModals('settings-modal');
        }
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

    // Grid columns toggle buttons
    document.querySelectorAll('.grid-cols-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newCols = Number(btn.getAttribute('data-grid-cols'));
            GRID_COLS = newCols;
            chrome.storage.sync.set({ gridCols: GRID_COLS });
            analytics.trackGridColumnChange(newCols);
            applyGridColsUI();
            updateView(getSearchTerm());
        });
    });

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
    chrome.storage.sync.get(['sortPreference', 'hasSeenOnboarding', 'gridCols', 'searchMode', 'searchEngine', 'aiProvider'], function (result) {
        if (result.sortPreference) SORT_BY = result.sortPreference;
        if (result.gridCols) GRID_COLS = result.gridCols;
        if (result.searchMode) SEARCH_MODE = result.searchMode;
        if (result.searchEngine) SEARCH_ENGINE = result.searchEngine;
        const aiProviderInit = (result.aiProvider && result.aiProvider !== 'duckduckgo') ? result.aiProvider : 'groq';
        applyGridColsUI();
        setSearchMode(SEARCH_MODE);
        setSearchEngine(SEARCH_ENGINE);
        setAiProvider(aiProviderInit);
        bootstrapBookmarks();
        if (!result.hasSeenOnboarding) showOnboardingModal();
    });
});

// ─── Shared State Rebuilder ──────────────────────────────────────────────────
function _rebuildLocalState() {
    allBookmarks = [];
    for (const node of bookmarkTree[0].children) {
        collectBookmarks(node, allBookmarks);
    }
    filterOptions = populateFilterDropdown(bookmarkTree[0].children, onToggleFolder, () => FILTER_IDS);
}

// ─── Bootstrap (populate data then render) ───────────────────────────────────
function bootstrapBookmarks() {
    _rebuildLocalState();
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
    return getCachedBookmarks().then(function (bookmarks) {
        bookmarkTree = bookmarks;
        _rebuildLocalState();
        if (isPopoverMode) buildPopoverFilterPanel();
        updateView(getSearchTerm());
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
    updateView(getSearchTerm());
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
        analytics.trackSortOrderChange(SORT_BY);
        updateView(getSearchTerm());
    });

    const sortIcon = iconEl('arrow-up-down', 'absolute top-1/2 -translate-y-1/2 left-0 pointer-events-none opacity-50 text-zinc-600 dark:text-zinc-300');

    sortWrapper.appendChild(sortIcon);
    sortWrapper.appendChild(sortSelectEl);
    titleRow.appendChild(mainTitle);
    titleRow.appendChild(sortWrapper);

    const grid = document.createElement("div");
    const gridGap = GRID_COLS >= 5 ? 'gap-5' : 'gap-8';
    grid.className = `grid my-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-${GRID_COLS} ${gridGap}`;

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
                updateView(getSearchTerm());
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
            updateView(getSearchTerm());
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

    // Divider
    const divider = document.createElement('div');
    divider.className = 'border-t border-zinc-100 dark:border-zinc-700 my-1';
    panel.appendChild(divider);

    // "+ New folder" row
    const newFolderRow = document.createElement('div');
    newFolderRow.className = 'flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer select-none text-indigo-600 dark:text-indigo-400 transition-colors';
    newFolderRow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0"><path d="M5 12h14"/><path d="M12 5v14"/></svg><span class="text-sm">New folder</span>`;
    newFolderRow.addEventListener('click', function (e) {
        e.stopPropagation();
        // Replace row with inline input
        newFolderRow.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Folder name';
        input.className = 'flex-1 text-sm bg-transparent outline-none border-b border-indigo-400 text-zinc-800 dark:text-zinc-100 py-0.5';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'ml-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium flex-shrink-0';
        confirm.textContent = 'Add';
        newFolderRow.appendChild(input);
        newFolderRow.appendChild(confirm);
        input.focus();

        function createFolder() {
            const name = input.value.trim();
            if (!name) return;
            const parentId = getDefaultAddFolder();
            chrome.bookmarks.create({ title: name, parentId }, function (newFolder) {
                if (chrome.runtime.lastError || !newFolder) return;
                refreshApp().then(() => populateFolderDropdown(newFolder.id));
                if (hidden) hidden.value = newFolder.id;
                if (labelEl) labelEl.textContent = name;
                panel.classList.add('hidden');
                const btn   = document.getElementById('edit-folder-btn');
                const arrow = document.getElementById('edit-folder-arrow');
                if (btn)   btn.setAttribute('aria-expanded', 'false');
                if (arrow) arrow.classList.remove('rotate-180');
            });
        }

        confirm.addEventListener('click', function (e) { e.stopPropagation(); createFolder(); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); createFolder(); }
            if (e.key === 'Escape') { e.stopPropagation(); populateFolderDropdown(hidden ? hidden.value : selectedParentId); }
        });
    });
    panel.appendChild(newFolderRow);

    setSelected(selectedParentId);
}

// ─── Greeting ─────────────────────────────────────────────────────────────────
function updateGreeting() {
    const el = document.getElementById('greeting-text');
    if (!el) return;
    const h = new Date().getHours();
    el.textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ─── Hero collapse when searching ─────────────────────────────────────────────
function setHeroCompact(compact) {
    const hero = document.getElementById('hero-section');
    if (!hero) return;
    if (compact) {
        hero.classList.remove('pt-[15vh]', 'pb-6');
        hero.classList.add('pt-8', 'pb-4');
    } else {
        hero.classList.remove('pt-8', 'pb-4');
        hero.classList.add('pt-[15vh]', 'pb-6');
    }
}

// ─── Search mode switching ────────────────────────────────────────────────────
const SEARCH_MODE_CONFIG = {
    bookmarks: { placeholder: 'Search bookmarks...', showFilter: true },
    web:       { placeholder: 'Search the web...',    showFilter: false },
    ai:        { placeholder: 'Ask AI anything...',   showFilter: false }
};

// ─── Helper: Get normalized search term ────────────────────────────────────────
const getSearchTerm = () => searchInput?.value.trim().toLowerCase() || '';

const SEARCH_ENGINES = {
    google:     { name: 'Google',     url: 'https://www.google.com/search?q=',    icon: 'https://www.google.com/favicon.ico' },
    bing:       { name: 'Bing',       url: 'https://www.bing.com/search?q=',      icon: 'https://www.bing.com/favicon.ico' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=',          icon: 'https://duckduckgo.com/favicon.ico' },
    brave:      { name: 'Brave',      url: 'https://search.brave.com/search?q=',  icon: 'https://brave.com/static-assets/images/brave-favicon.png' }
};
let SEARCH_ENGINE = 'google';

function setSearchMode(mode) {
    const oldMode = SEARCH_MODE;
    
    // Force bookmarks mode in popover
    if (isPopoverMode) {
        mode = 'bookmarks';
    }
    SEARCH_MODE = mode;
    aiOnSearchModeSet(mode); // delegate AI layout changes to ai-chat module
    
    // Track mode change
    if (oldMode !== mode) {
        analytics.trackModeSwitch(oldMode, mode);
    }
    const folderList = document.getElementById('folder-list');
    const bookmarkWrap = document.getElementById('bookmark-search-wrap');
    const webWrap      = document.getElementById('web-search-wrap');
    const aiWrap       = document.getElementById('ai-chat-wrap');

    // Update tabs
    document.querySelectorAll('.search-mode-btn').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.dataset.searchMode === mode ? 'true' : 'false');
    });

    // Show/hide the correct search bar
    if (bookmarkWrap) bookmarkWrap.classList.toggle('hidden', mode !== 'bookmarks');
    if (webWrap)      webWrap.classList.toggle('hidden', mode !== 'web');
    if (aiWrap)       aiWrap.classList.toggle('hidden', mode !== 'ai');

    // Clear bookmark search
    if (searchInput) searchInput.value = '';
    if (clearSearch) clearSearch.classList.add('hidden');
    if (searchIcon) { searchIcon.classList.remove('text-indigo-500'); searchIcon.classList.add('text-zinc-400'); }

    // Mode-specific
    if (mode === 'bookmarks') {
        if (folderList) folderList.classList.remove('hidden');
        setHeroCompact(false);
        updateView('');
    } else if (mode === 'web') {
        if (folderList) folderList.classList.add('hidden');
        setHeroCompact(false);
        const webInput = document.getElementById('web-search-input');
        if (webInput) { webInput.value = ''; webInput.focus(); }
    } else if (mode === 'ai') {
        if (folderList) folderList.classList.add('hidden');
        // Layout details handled by aiOnSearchModeSet (called above)
    }

    // Persist preference (don't persist AI mode in popover)
    if (!isPopoverMode) {
        chrome.storage.sync.set({ searchMode: mode });
    }
}

function setSearchEngine(engine) {
    SEARCH_ENGINE = engine;
    const cfg = SEARCH_ENGINES[engine];
    const icon = document.getElementById('engine-icon');
    const webInput = document.getElementById('web-search-input');
    const panel = document.getElementById('engine-panel');
    if (icon) { icon.src = cfg.icon; icon.alt = cfg.name; }
    if (webInput) webInput.placeholder = 'Search ' + cfg.name + '...';
    // Mark active option
    document.querySelectorAll('.engine-option').forEach(btn => {
        btn.setAttribute('aria-selected', btn.dataset.engine === engine ? 'true' : 'false');
    });
    if (panel) panel.classList.add('hidden');
    chrome.storage.sync.set({ searchEngine: engine });
}

function executeExternalSearch(query) {
    if (!query) return;
    const cfg = SEARCH_ENGINES[SEARCH_ENGINE] || SEARCH_ENGINES.google;
    window.open(cfg.url + encodeURIComponent(query), '_self');
}

// AI chat state and functions live in modules/ai-chat.js

// ─── Close all modals helper ──────────────────────────────────────────────────
const MODAL_IDS = [
    'edit-modal', 'add-modal', 'manage-panel', 'dedup-review-modal',
    'onboarding-modal', 'broken-confirm-modal', 'settings-modal',
    'shortcuts-modal', 'feedback-panel'
];
function closeAllModals(except) {
    MODAL_IDS.forEach(id => {
        if (id === except) return;
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    });
    if (except !== 'settings-modal') {
        const sb = document.getElementById('settings-btn');
        if (sb) sb.setAttribute('aria-expanded', 'false');
    }
}
window.closeAllModals = closeAllModals;

let _editFocusReturn = null;

function openEditModal(bookmarkNode) {
    closeAllModals('edit-modal');
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

// ─── Add Bookmark Modal ───────────────────────────────────────────────────────
function populateAddFolderDropdown(selectedParentId) {
    const panel   = document.getElementById('add-folder-panel');
    const hidden  = document.getElementById('add-folder-dropdown');
    const labelEl = document.getElementById('add-folder-label');
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
            const btn   = document.getElementById('add-folder-btn');
            const arrow = document.getElementById('add-folder-arrow');
            if (btn)   btn.setAttribute('aria-expanded', 'false');
            if (arrow) arrow.classList.remove('rotate-180');
        });

        panel.appendChild(item);
    });

    // Divider
    const addDivider = document.createElement('div');
    addDivider.className = 'border-t border-zinc-100 dark:border-zinc-700 my-1';
    panel.appendChild(addDivider);

    // "+ New folder" row
    const newFolderRow = document.createElement('div');
    newFolderRow.className = 'flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer select-none text-indigo-600 dark:text-indigo-400 transition-colors';
    newFolderRow.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0"><path d="M5 12h14"/><path d="M12 5v14"/></svg><span class="text-sm">New folder</span>`;
    newFolderRow.addEventListener('click', function (e) {
        e.stopPropagation();
        // Replace row with inline input
        newFolderRow.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Folder name';
        input.className = 'flex-1 text-sm bg-transparent outline-none border-b border-indigo-400 text-zinc-800 dark:text-zinc-100 py-0.5';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'ml-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium flex-shrink-0';
        confirm.textContent = 'Add';
        newFolderRow.appendChild(input);
        newFolderRow.appendChild(confirm);
        input.focus();

        function createFolder() {
            const name = input.value.trim();
            if (!name) return;
            const parentId = getDefaultAddFolder();
            chrome.bookmarks.create({ title: name, parentId }, function (newFolder) {
                if (chrome.runtime.lastError || !newFolder) return;
                refreshApp().then(() => populateAddFolderDropdown(newFolder.id));
                if (hidden) hidden.value = newFolder.id;
                if (labelEl) labelEl.textContent = name;
                panel.classList.add('hidden');
                const btn   = document.getElementById('add-folder-btn');
                const arrow = document.getElementById('add-folder-arrow');
                if (btn)   btn.setAttribute('aria-expanded', 'false');
                if (arrow) arrow.classList.remove('rotate-180');
            });
        }

        confirm.addEventListener('click', function (e) { e.stopPropagation(); createFolder(); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); createFolder(); }
            if (e.key === 'Escape') { e.stopPropagation(); populateAddFolderDropdown(hidden ? hidden.value : selectedParentId); }
        });
    });
    panel.appendChild(newFolderRow);

    setSelected(selectedParentId);
}

function getDefaultAddFolder() {
    if (bookmarkTree && bookmarkTree[0]) {
        const children = bookmarkTree[0].children || [];
        const other = children.find(n => (n.title || '').toLowerCase() === 'other bookmarks');
        if (other) return other.id;
        // Fall back to first available top-level folder
        const firstFolder = children.find(n => !n.url);
        if (firstFolder) return firstFolder.id;
    }
    if (filterOptions.length > 1) return filterOptions[1].value;
    // Ultimate fallback: Chrome's "Other Bookmarks" folder always has id "2"
    return '2';
}

let _addFocusReturn = null;

function openAddModal() {
    closeAllModals('add-modal');
    _addFocusReturn = document.activeElement;
    document.getElementById('add-title').value = '';
    document.getElementById('add-url').value   = '';
    const err = document.getElementById('add-error');
    if (err) { err.textContent = ''; err.classList.add('hidden'); }
    populateAddFolderDropdown(getDefaultAddFolder());
    document.getElementById('add-modal').classList.remove('hidden');
    setTimeout(() => { document.getElementById('add-title').focus(); }, 50);
}

function closeAddModal() {
    document.getElementById('add-modal').classList.add('hidden');
    const fp = document.getElementById('add-folder-panel');
    const fa = document.getElementById('add-folder-arrow');
    if (fp) fp.classList.add('hidden');
    if (fa) fa.classList.remove('rotate-180');
    if (_addFocusReturn && document.contains(_addFocusReturn)) {
        _addFocusReturn.focus();
    }
    _addFocusReturn = null;
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
    updateView(getSearchTerm());
    showUndoToast(`"${bookmarkNode.title}" deleted`);

    undoTimer = setTimeout(function () {
        commitPendingDelete();
    }, 5000);
}

function deleteBookmarkDirect(bookmarkNode) {
    allBookmarks = allBookmarks.filter(b => b.bookmark.id !== bookmarkNode.id);
    updateView(getSearchTerm());
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
    updateView(getSearchTerm());
}

function showUndoToast(message) {
    const toast = document.getElementById("undo-toast");
    document.getElementById("undo-toast-message").textContent = message;
    toast.classList.remove("hidden");
}

function hideUndoToast() {
    document.getElementById("undo-toast").classList.add("hidden");
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
    closeAllModals('onboarding-modal');

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

// ─── Snackbar helper ──────────────────────────────────────────────────────────
let _snackbarTimer = null;
function showSnackbar(text, progress) {
    const el      = document.getElementById('snackbar');
    const textEl  = document.getElementById('snackbar-text');
    const barWrap = document.getElementById('snackbar-bar-wrap');
    const bar     = document.getElementById('snackbar-bar');
    if (!el) return;
    clearTimeout(_snackbarTimer);
    textEl.textContent = text;
    el.classList.remove('hidden');
    if (typeof progress === 'number') {
        barWrap.classList.remove('hidden');
        bar.style.width = Math.round(progress) + '%';
    } else {
        barWrap.classList.add('hidden');
    }
}
function hideSnackbar(delay) {
    clearTimeout(_snackbarTimer);
    if (delay) {
        _snackbarTimer = setTimeout(hideSnackbar, delay);
        return;
    }
    const el = document.getElementById('snackbar');
    if (el) el.classList.add('hidden');
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
            showSnackbar('All bookmarks already have screenshots!');
            hideSnackbar(3000);
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
            const pct = Math.round((index / total) * 100);
            if (type === 'loading') {
                const loadPct = Math.round(((index - 1) / total) * 100);
                bar.style.width = loadPct + '%';
                statusEl.textContent = `Capturing ${index}/${total}: ${name}`;
                showSnackbar(`Capturing ${index}/${total}`, loadPct);
            } else if (type === 'captured') {
                bar.style.width = pct + '%';
                statusEl.textContent = `Captured ${index}/${total}: ${name}`;
                showSnackbar(`Captured ${index}/${total}`, pct);
                updateThumbnail(url, dataUrl);
            } else if (type === 'failed') {
                bar.style.width = pct + '%';
                statusEl.textContent = `Failed ${index}/${total}: ${name}`;
                showSnackbar(`Failed ${index}/${total}`, pct);
            }
        }

        function onDone(captured, failed, stopped) {
            btn.disabled = false;
            btn.textContent = 'Capture All Missing';
            bar.style.width = stopped ? bar.style.width : '100%';
            let msg;
            if (stopped) {
                msg = `Capture stopped · Captured: ${captured}`;
            } else {
                const parts = [`Captured: ${captured}`];
                if (failed > 0) parts.push(`Failed: ${failed}`);
                msg = parts.join(' · ');
            }
            statusEl.textContent = msg;
            showSnackbar(msg, 100);
            hideSnackbar(4000);
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
        showSnackbar(`Checking links ${checked}/${total}`, Math.round((checked / total) * 100));
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
        showSnackbar('All links are reachable.');
        hideSnackbar(3000);
    } else {
        const msg = `${brokenBookmarks.length} broken link${brokenBookmarks.length > 1 ? 's' : ''} found.`;
        statusEl.textContent = msg;
        showSnackbar(msg);
        hideSnackbar(4000);
        deleteBtn.textContent = "Review & Delete";
        deleteBtn.classList.remove("hidden");
    }
}

function showBrokenConfirmModal() {
    if (brokenBookmarks.length === 0) return;
    closeAllModals('broken-confirm-modal');

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
    // Search mode tab buttons (disabled in popover - force bookmarks only)
    document.querySelectorAll('.search-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (isPopoverMode) {
                setSearchMode('bookmarks');
            } else {
                setSearchMode(btn.dataset.searchMode);
            }
        });
    });

    // Search (full-page layout only; popover has its own search wired in initPopoverMode)
    if (searchInput) {
        const performSearch = debounce(function (searchTerm) {
            // Track search
            if (searchTerm) {
                const filtered = filterBookmarks(allBookmarks, searchTerm, FILTER_IDS, SORT_BY);
                analytics.trackBookmarkSearch(searchTerm, filtered.length);
            }
            updateView(searchTerm);
        }, 300);
        searchInput.addEventListener("input", function () {
            const hasText = !!searchInput.value;
            if (SEARCH_MODE === 'bookmarks') {
                setHeroCompact(hasText);
                if (hasText) {
                    if (clearSearch) clearSearch.classList.remove("hidden");
                    if (searchIcon) { searchIcon.classList.remove("text-zinc-400"); searchIcon.classList.add("text-indigo-500"); }
                    performSearch(getSearchTerm());
                } else {
                    performSearch.cancel && performSearch.cancel();
                    if (clearSearch) clearSearch.classList.add("hidden");
                    if (searchIcon) { searchIcon.classList.remove("text-indigo-500"); searchIcon.classList.add("text-zinc-400"); }
                    updateView("");
                }
            }
        });

        if (clearSearch) clearSearch.addEventListener("click", function () {
            searchInput.value = "";
            performSearch.cancel && performSearch.cancel();
            clearSearch.classList.add("hidden");
            if (searchIcon) { searchIcon.classList.remove("text-indigo-500"); searchIcon.classList.add("text-zinc-400"); }
            if (SEARCH_MODE === 'bookmarks') {
                setHeroCompact(false);
                updateView("");
            }
        });
    }

    // ─── Web search bar ───────────────────────────────────────────────────────
    const webInput = document.getElementById('web-search-input');
    const webClear = document.getElementById('web-clear-search');

    if (webInput) {
        webInput.addEventListener('input', function () {
            if (webClear) webClear.classList.toggle('hidden', !webInput.value);
        });
        webInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                executeExternalSearch(webInput.value.trim());
            }
        });
    }
    if (webClear) webClear.addEventListener('click', function () {
        if (webInput) webInput.value = '';
        webClear.classList.add('hidden');
    });

    // ─── Search engine selector ───────────────────────────────────────────────
    const engineBtn = document.getElementById('engine-btn');
    const enginePanel = document.getElementById('engine-panel');
    if (engineBtn && enginePanel) {
        engineBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            enginePanel.classList.toggle('hidden');
        });
        document.querySelectorAll('.engine-option').forEach(function (opt) {
            opt.addEventListener('click', function (e) {
                e.stopPropagation();
                setSearchEngine(opt.dataset.engine);
                if (webInput) webInput.focus();
            });
        });
        // Close panel on outside click
        document.addEventListener('click', function () {
            enginePanel.classList.add('hidden');
        });
    }

    // AI event listeners wired by ai-chat module
    wireAiListeners();


    // Undo toast
    const undoBtn = document.getElementById("undo-btn");
    if (undoBtn) undoBtn.addEventListener("click", undoPendingDelete);

    // Dedup listeners wired by dedup module
    wireDedupListeners();

    // Export
    const exportJsonBtn = document.getElementById("export-json-btn");
    const exportHtmlBtn = document.getElementById("export-html-btn");
    if (exportJsonBtn) exportJsonBtn.addEventListener("click", function () {
        exportAsJSON(allBookmarks);
        document.getElementById("settings-modal").classList.add("hidden");
    });
    if (exportHtmlBtn) exportHtmlBtn.addEventListener("click", function () {
        exportAsHTML(allBookmarks);
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

    const feedbackForm = document.getElementById('feedback-form');
    if (feedbackForm) feedbackForm.addEventListener('submit', async function (e) {
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
                    subject: `Thumbmark Feedback — ${category}`,
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
    });  // end feedbackForm if

    // Bulk capture
    const bulkCaptureBtn = document.getElementById("bulk-capture-btn");
    if (bulkCaptureBtn) bulkCaptureBtn.addEventListener("click", bulkCaptureScreenshots);
    const bulkCaptureTopLeft = document.getElementById("bulk-capture-topleft-btn");
    if (bulkCaptureTopLeft) bulkCaptureTopLeft.addEventListener("click", bulkCaptureScreenshots);

    // Broken links
    const checkBrokenBtn  = document.getElementById("check-broken-btn");
    const deleteBrokenBtn = document.getElementById("delete-broken-btn");
    if (checkBrokenBtn)  checkBrokenBtn.addEventListener("click", checkBrokenLinks);
    if (deleteBrokenBtn) deleteBrokenBtn.addEventListener("click", showBrokenConfirmModal);
    const brokenLinkTopLeft = document.getElementById("broken-link-topleft-btn");
    if (brokenLinkTopLeft) brokenLinkTopLeft.addEventListener("click", checkBrokenLinks);

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
                if (newParentId && newParentId !== window.currentBookmarkNode.parentId) {
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

    // Manage panel listeners wired by manage-panel module
    wireManageListeners();

    // Add bookmark modal
    const addBookmarkBtn    = document.getElementById('add-bookmark-btn');
    const cancelAddBtn      = document.getElementById('cancel-add');
    const saveAddBtn        = document.getElementById('save-add');
    const addModalEl        = document.getElementById('add-modal');
    const addFolderBtn      = document.getElementById('add-folder-btn');
    const addFolderPanel    = document.getElementById('add-folder-panel');
    const addFolderArrow    = document.getElementById('add-folder-arrow');
    const addErrorEl        = document.getElementById('add-error');

    if (addBookmarkBtn) addBookmarkBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        openAddModal();
    });
    if (cancelAddBtn) cancelAddBtn.addEventListener('click', closeAddModal);
    if (addModalEl) addModalEl.addEventListener('click', function (e) {
        if (e.target === addModalEl) closeAddModal();
    });
    if (saveAddBtn) {
        saveAddBtn.addEventListener('click', function () {
            const title    = document.getElementById('add-title').value.trim();
            const url      = document.getElementById('add-url').value.trim();
            const parentId = document.getElementById('add-folder-dropdown').value;

            function showErr(msg) {
                if (addErrorEl) { addErrorEl.textContent = msg; addErrorEl.classList.remove('hidden'); }
            }
            function clearErr() {
                if (addErrorEl) { addErrorEl.textContent = ''; addErrorEl.classList.add('hidden'); }
            }

            if (!title) { showErr('Please enter a title.'); document.getElementById('add-title').focus(); return; }
            if (!url)   { showErr('Please enter a URL.');   document.getElementById('add-url').focus();   return; }
            if (!parentId) { showErr('Please select a folder.'); return; }
            clearErr();

            let finalUrl = url;
            if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl;

            chrome.bookmarks.create({ parentId, title, url: finalUrl }, function () {
                closeAddModal();
                refreshApp();
            });
        });
    }
    ['add-title', 'add-url'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
            if (addErrorEl) { addErrorEl.textContent = ''; addErrorEl.classList.add('hidden'); }
        });
    });
    if (addFolderBtn && addFolderPanel) {
        addFolderBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = !addFolderPanel.classList.contains('hidden');
            addFolderPanel.classList.toggle('hidden');
            addFolderBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
            if (addFolderArrow) addFolderArrow.classList.toggle('rotate-180', !isOpen);
        });
        addFolderPanel.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', function () {
            if (!addFolderPanel.classList.contains('hidden')) {
                addFolderPanel.classList.add('hidden');
                addFolderBtn.setAttribute('aria-expanded', 'false');
                if (addFolderArrow) addFolderArrow.classList.remove('rotate-180');
            }
        });
    }
}

// ─── Globals for keyboard-shortcuts.js ───────────────────────────────────────
window.showPopupMenu           = showPopupMenu;
window.openEditModal           = openEditModal;
window.closeEditModal          = closeEditModal;
window.deleteBookmark          = deleteBookmarkWithUndo;
window.captureScreenshot       = captureScreenshot;
window.handleScreenshotCapture = handleScreenshotCapture;
window.openManagePanel         = openManagePanel;
window.closeManagePanel        = closeManagePanel;
window.openAddModal            = openAddModal;
window.closeAddModal           = closeAddModal;
window.showSnackbar            = showSnackbar;
window.hideSnackbar            = hideSnackbar;

// ─── Capture failure feedback ─────────────────────────────────────────────────
document.addEventListener('thumbmarks:capture-failed', function () {
    showSnackbar('Screenshot capture failed. The site may have blocked it.');
    hideSnackbar(3500);
});

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
    settingsModalEl.className = 'flex flex-col relative';
    settingsModalEl.dataset.embedded = 'true'; // prevents Escape handler from treating it as a dialog
    // Strip the inner card wrapper styling so it reads as a flat embedded section
    const settingsInnerCard = settingsModalEl.querySelector('.rounded-xl');
    if (settingsInnerCard) settingsInnerCard.className = 'flex flex-col relative flex-1';
    // Hide the modal header (popover has its own settings page header / back button)
    const settingsModalHeader = document.getElementById('settings-modal-header');
    if (settingsModalHeader) settingsModalHeader.classList.add('hidden');
    // Remove max-h constraint so the parent container handles scrolling
    const settingsScrollBody = settingsModalEl.querySelector('[class*="max-h-"]');
    if (settingsScrollBody) { settingsScrollBody.classList.remove('max-h-[70vh]', 'overflow-y-auto'); }
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
    document.getElementById('popover-capture-btn').addEventListener('click', function () {
        bulkCaptureScreenshots();
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
                        subject: `Thumbmarks Feedback — ${category}`,
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

    // Floating add bookmark button (popover)
    const popoverAddBtn = document.getElementById('popover-add-bookmark-btn');
    if (popoverAddBtn) popoverAddBtn.addEventListener('click', function () {
        openAddModal();
    });
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

        // Show inline confirmation
        actions.classList.add('!hidden');

        const confirmBar = document.createElement('div');
        confirmBar.className = 'absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10 bg-white/95 dark:bg-zinc-800/95 border border-rose-200 dark:border-rose-700 rounded-md shadow-md px-2 py-1';

        const label = document.createElement('span');
        label.textContent = 'Delete?';
        label.className = 'text-xs font-medium text-zinc-700 dark:text-zinc-200 whitespace-nowrap';

        const yesBtn = document.createElement('button');
        yesBtn.textContent = 'Yes';
        yesBtn.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-500 transition-colors';

        const noBtn = document.createElement('button');
        noBtn.textContent = 'No';
        noBtn.className = 'text-xs font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors';

        function dismiss() {
            clearTimeout(autoCancel);
            confirmBar.remove();
            actions.classList.remove('!hidden');
        }

        yesBtn.addEventListener('click', function(e2) {
            e2.stopPropagation();
            e2.preventDefault();
            dismiss();
            if (window.deleteBookmark) window.deleteBookmark(bookmarkNode);
        });

        noBtn.addEventListener('click', function(e2) {
            e2.stopPropagation();
            e2.preventDefault();
            dismiss();
        });

        confirmBar.appendChild(label);
        confirmBar.appendChild(yesBtn);
        confirmBar.appendChild(noBtn);
        wrapper.appendChild(confirmBar);
        noBtn.focus();

        const autoCancel = setTimeout(dismiss, 5000);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    wrapper.appendChild(actions);
    return wrapper;
}

// ─── New Tab Toggle (settings) ──────────────────────────────────────────────

function initNewTabToggle() {
    const btn = document.getElementById('new-tab-toggle');
    if (!btn) return;

    function applyNewTabToggleUI(enabled) {
        btn.setAttribute('aria-checked', enabled ? 'true' : 'false');
        if (enabled) {
            btn.classList.remove('bg-zinc-300', 'dark:bg-zinc-600');
            btn.classList.add('bg-indigo-600');
            btn.querySelector('span').classList.remove('translate-x-0');
            btn.querySelector('span').classList.add('translate-x-4');
        } else {
            btn.classList.remove('bg-indigo-600');
            btn.classList.add('bg-zinc-300', 'dark:bg-zinc-600');
            btn.querySelector('span').classList.remove('translate-x-4');
            btn.querySelector('span').classList.add('translate-x-0');
        }
    }

    chrome.storage.sync.get(['showOnNewTab'], function (result) {
        const enabled = result.showOnNewTab !== false;
        applyNewTabToggleUI(enabled);
    });

    btn.addEventListener('click', function () {
        const current = btn.getAttribute('aria-checked') === 'true';
        const next = !current;
        chrome.storage.sync.set({ showOnNewTab: next });
        applyNewTabToggleUI(next);
    });
}

// ─── View Mode Toggle (settings) ─────────────────────────────────────────────

function initViewModeToggle() {
    chrome.storage.sync.get(['viewMode', 'showOnNewTab'], function (result) {
        updateViewModeUI(result.viewMode || 'new-tab');
    });


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

