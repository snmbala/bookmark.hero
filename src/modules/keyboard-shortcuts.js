// Keyboard shortcuts for Thumbmark
const DEBUG = false;
const dbg = (...args) => { if (DEBUG) console.log(...args); };

// Function to trigger save changes directly
function triggerSaveChanges() {
    const currentBookmarkNode = window.currentBookmarkNode;
    if (!currentBookmarkNode) return;

    const editTitleInput = document.getElementById("edit-title");
    const editUrlInput = document.getElementById("edit-url");
    const folderDropdown = document.getElementById("folder-dropdown");

    if (!editTitleInput || !editUrlInput || !folderDropdown) return;

    const newTitle = editTitleInput.value.trim();
    const newUrl = editUrlInput.value.trim();
    const newParentId = folderDropdown.value;

    if (!newTitle || !newUrl) return;

    chrome.bookmarks.update(currentBookmarkNode.id, {
        title: newTitle,
        url: newUrl
    }, function () {
        if (newParentId !== currentBookmarkNode.parentId) {
            chrome.bookmarks.move(currentBookmarkNode.id, {
                parentId: newParentId
            }, function () {
                finalizeSave();
            });
        } else {
            finalizeSave();
        }
    });

    function finalizeSave() {
        if (window.closeEditModal) {
            window.closeEditModal();
        } else {
            const editModal = document.getElementById("edit-modal");
            if (editModal) editModal.classList.add("hidden");
        }
        if (window.refreshApp) {
            window.refreshApp();
        }
    }
}

// Action functions for direct keyboard shortcuts
function triggerEditAction(cardElement) {
    if (!window.getBookmarkFromCard || !window.openEditModal) return;
    const bookmarkData = window.getBookmarkFromCard(cardElement);
    if (bookmarkData) {
        window.openEditModal(bookmarkData);
    }
}

function triggerDeleteAction(cardElement) {
    if (!window.getBookmarkFromCard || !window.deleteBookmark) return;

    const bookmarkData = window.getBookmarkFromCard(cardElement);
    if (bookmarkData && confirm(`Are you sure you want to delete "${bookmarkData.title}"?`)) {
        const allCards = Array.from(document.querySelectorAll('.card'));
        const currentIndex = allCards.indexOf(cardElement);
        const nextCard = allCards[currentIndex + 1] || allCards[currentIndex - 1];

        window.deleteBookmark(bookmarkData);

        setTimeout(() => {
            if (window.updateBookmarkCards) window.updateBookmarkCards();
            const updatedCards = Array.from(document.querySelectorAll('.card'));
            let cardToFocus = null;
            if (nextCard && document.contains(nextCard)) {
                cardToFocus = nextCard;
            } else if (updatedCards.length > 0) {
                cardToFocus = updatedCards[Math.min(currentIndex, updatedCards.length - 1)];
            }
            if (cardToFocus) cardToFocus.focus();
        }, 300);
    }
}

function triggerCaptureAction(cardElement) {
    if (!window.getBookmarkFromCard || !window.captureScreenshot) return;
    const bookmarkData = window.getBookmarkFromCard(cardElement);
    if (bookmarkData) {
        window.captureScreenshot(bookmarkData.url, bookmarkData.title, function (url, newThumbnailUrl) {
            if (!newThumbnailUrl) return;
            document.querySelectorAll('.card').forEach(card => {
                const cardLink = card.querySelector('a[href="' + bookmarkData.url + '"]');
                if (cardLink) {
                    const thumbnailImg = card.querySelector('img[alt="' + bookmarkData.url + '"]');
                    if (thumbnailImg) thumbnailImg.src = newThumbnailUrl;
                }
            });
        });
    }
}

function triggerOpenUrl(cardElement) {
    const link = cardElement.querySelector('a');
    if (link && link.href) window.open(link.href, '_blank');
}

// Wait for DOM and main.js to be ready
if (document.readyState !== 'loading') {
    initializeKeyboardShortcuts();
}

function initializeKeyboardShortcuts() {
    setTimeout(() => {
        setupKeyboardListeners();
        setupDOMObserver();
        setupShortcutButtons();
    }, 200);
}

function setupShortcutButtons() {
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    if (shortcutsBtn) shortcutsBtn.addEventListener('click', openShortcutsModal);

    const openShortcutsBtnEl = document.getElementById('open-shortcuts-btn');
    if (openShortcutsBtnEl) openShortcutsBtnEl.addEventListener('click', function () {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.classList.add('hidden');
        openShortcutsModal();
    });

    const closeShortcutsBtn = document.getElementById('close-shortcuts-btn');
    if (closeShortcutsBtn) closeShortcutsBtn.addEventListener('click', closeShortcutsModal);
}

let currentBookmarkIndex = -1;
let bookmarkCards = [];
let hasAutoFocused = false;

function updateBookmarkCards() {
    bookmarkCards = Array.from(document.querySelectorAll('.card'));
    bookmarkCards.forEach((card, index) => {
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-bookmark-index', index);
    });
    // Auto-focus the first card once on initial page load (only if nothing else has focus)
    if (!hasAutoFocused && bookmarkCards.length > 0) {
        hasAutoFocused = true;
        setTimeout(() => {
            if (bookmarkCards.length > 0 && document.activeElement === document.body) {
                currentBookmarkIndex = 0;
                bookmarkCards[0].focus();
            }
        }, 150);
    }
}

window.updateBookmarkCards = updateBookmarkCards;

function openShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (!modal) return;
    if (typeof window.closeAllModals === 'function') window.closeAllModals('shortcuts-modal');
    modal.classList.remove('hidden');
    const closeBtn = document.getElementById('close-shortcuts-btn');
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcuts-modal');
    if (!modal) return;
    modal.classList.add('hidden');
}

window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;

function getFocusableElements() {
    const elements = [];
    const searchInput = document.getElementById('search-input');
    if (searchInput) elements.push(searchInput);

    // Fixed: was getElementById('filter') — the actual ID is 'filter-btn'
    const filterBtn = document.getElementById('filter-btn');
    if (filterBtn) elements.push(filterBtn);

    const folderList = document.getElementById('folder-list');
    if (folderList) {
        const headings = Array.from(folderList.querySelectorAll('h1, h2'));
        headings.forEach(heading => {
            elements.push(heading);
            let next = heading.nextElementSibling;
            let firstCard = null;
            while (next && !firstCard) {
                firstCard = next.classList.contains('card') ? next : next.querySelector('.card');
                if (firstCard) break;
                next = next.nextElementSibling;
            }
            if (firstCard) elements.push(firstCard);
        });
    }

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) elements.push(settingsBtn);
    return elements.filter(el => el && !el.hidden && !el.disabled && getComputedStyle(el).display !== 'none');
}

function focusBookmarkCard(index) {
    if (index >= 0 && index < bookmarkCards.length) {
        currentBookmarkIndex = index;
        bookmarkCards[index].focus();
        bookmarkCards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
}

function handleBookmarkNavigation(event) {
    if (bookmarkCards.length === 0) return false;
    const focusedElement = document.activeElement;

    // If no card is focused, arrow keys enter navigation at the first (or last) card
    if (!focusedElement.classList.contains('card')) {
        const tag = focusedElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
        // Don't intercept when a modal/dialog is open
        const openModal = ['edit-modal', 'settings-modal', 'shortcuts-modal']
            .map(id => document.getElementById(id))
            .some(el => el && !el.classList.contains('hidden'));
        if (openModal) return false;

        event.preventDefault();
        const targetIndex = (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
            ? bookmarkCards.length - 1 : 0;
        currentBookmarkIndex = targetIndex;
        bookmarkCards[targetIndex].focus();
        bookmarkCards[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
    }

    let parentContainer = focusedElement.closest('[class*="grid-cols"]')
        || focusedElement.closest('[class*="grid"]')
        || focusedElement.closest('#folder-list > *')
        || document.getElementById('folder-list');

    if (!parentContainer) return false;

    const containerCards = Array.from(parentContainer.querySelectorAll('.card'));
    const currentContainerIndex = containerCards.indexOf(focusedElement);
    if (currentContainerIndex === -1) return false;

    let cardsPerRow = Math.max(1, Math.floor(parentContainer.offsetWidth / 240));
    const computedStyle = window.getComputedStyle(parentContainer);
    const gridTemplateColumns = computedStyle.gridTemplateColumns;
    if (gridTemplateColumns && gridTemplateColumns !== 'none') {
        const columnCount = gridTemplateColumns.split(' ').length;
        if (columnCount > 0) cardsPerRow = columnCount;
    }

    let newContainerIndex = currentContainerIndex;
    switch (event.key) {
        case 'ArrowRight': newContainerIndex = (currentContainerIndex + 1) % containerCards.length; break;
        case 'ArrowLeft':  newContainerIndex = currentContainerIndex === 0 ? containerCards.length - 1 : currentContainerIndex - 1; break;
        case 'ArrowDown':  newContainerIndex = Math.min(currentContainerIndex + cardsPerRow, containerCards.length - 1); break;
        case 'ArrowUp':    newContainerIndex = Math.max(currentContainerIndex - cardsPerRow, 0); break;
        default: return false;
    }

    event.preventDefault();
    const targetCard = containerCards[newContainerIndex];
    if (targetCard) {
        currentBookmarkIndex = newContainerIndex;
        targetCard.focus();
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    return true;
}

function handleTabNavigation(event) {
    if (event.key !== 'Tab') return false;

    const shortcutsModal = document.getElementById('shortcuts-modal');
    if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) {
        event.preventDefault();
        const closeBtn = document.getElementById('close-shortcuts-btn');
        if (closeBtn) closeBtn.focus();
        return true;
    }

    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && !settingsModal.classList.contains('hidden')) {
        return handleSettingsModalTabNavigation(event);
    }

    const editModal = document.getElementById('edit-modal');
    if (editModal && !editModal.classList.contains('hidden')) {
        return handleEditModalTabNavigation(event);
    }

    const focusableElements = getFocusableElements();
    const currentElement = document.activeElement;
    let currentIndex = focusableElements.indexOf(currentElement);

    if (currentIndex === -1 && currentElement.classList.contains('card')) {
        const parentGrid = currentElement.closest('.grid, [class*="grid"]') || currentElement.closest('#folder-list > *');
        if (parentGrid) {
            const firstCardInSection = parentGrid.querySelector('.card');
            currentIndex = focusableElements.indexOf(firstCardInSection);
        }
    }

    const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1)
        : (currentIndex + 1) % focusableElements.length;

    event.preventDefault();
    const nextElement = focusableElements[nextIndex];
    if (nextElement.classList.contains('card')) {
        currentBookmarkIndex = parseInt(nextElement.getAttribute('data-bookmark-index'));
    }
    nextElement.focus();
    if (nextElement.scrollIntoView) {
        nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    return true;
}

function handleEditModalTabNavigation(event) {
    const modalElements = [
        document.getElementById('edit-title'),
        document.getElementById('edit-url'),
        document.getElementById('folder-dropdown'),
        document.getElementById('cancel-edit'),
        document.getElementById('save-edit')
    ].filter(el => el && !el.disabled && !el.hidden);

    if (modalElements.length === 0) return false;

    const currentIndex = modalElements.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? modalElements.length - 1 : currentIndex - 1)
        : (currentIndex + 1) % modalElements.length;

    event.preventDefault();
    event.stopPropagation();
    const nextElement = modalElements[nextIndex];
    if (nextElement) nextElement.focus();
    return true;
}

function handleSettingsModalTabNavigation(event) {
    const modalElements = [
        document.getElementById('close-settings-btn'),
        document.querySelector('button[data-view="new-tab"]'),
        document.querySelector('button[data-view="popover"]'),
        document.querySelector('button[data-theme="auto"]'),
        document.querySelector('button[data-theme="light"]'),
        document.querySelector('button[data-theme="dark"]'),
        document.getElementById('bulk-capture-btn'),
        document.getElementById('check-broken-btn'),
        document.getElementById('delete-broken-btn'),
        document.getElementById('export-json-btn'),
        document.getElementById('export-html-btn'),
    ].filter(el => el && !el.disabled && !el.classList.contains('hidden'));

    if (modalElements.length === 0) return false;

    const currentIndex = modalElements.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? modalElements.length - 1 : currentIndex - 1)
        : (currentIndex + 1) % modalElements.length;

    event.preventDefault();
    event.stopPropagation();
    const nextElement = modalElements[nextIndex];
    if (nextElement) nextElement.focus();
    return true;
}

function setupDOMObserver() {
    const observer = new MutationObserver(() => { updateBookmarkCards(); });
    const folderList = document.getElementById('folder-list');
    if (folderList) observer.observe(folderList, { childList: true, subtree: true });
}

function setupKeyboardListeners() {
    document.addEventListener("keydown", function (event) {
        dbg('Key pressed:', event.key, 'Target:', event.target.tagName);

        // Enter in edit modal
        const editModal = document.getElementById('edit-modal');
        if (editModal && !editModal.classList.contains('hidden') && event.key === 'Enter') {
            if (['edit-title', 'edit-url', 'save-edit'].includes(event.target.id)) {
                event.preventDefault();
                event.stopPropagation();
                triggerSaveChanges();
                return;
            }
        }

        // Actions on focused bookmark card
        const focusedElement = document.activeElement;
        if (focusedElement && focusedElement.classList.contains('card')) {
            if (event.key.toLowerCase() === "e") {
                event.preventDefault();
                triggerEditAction(focusedElement);
                return;
            }
            if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                triggerDeleteAction(focusedElement);
                return;
            }
            if (event.key.toLowerCase() === "c") {
                event.preventDefault();
                triggerCaptureAction(focusedElement);
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                triggerOpenUrl(focusedElement);
                return;
            }
        }

        if (handleTabNavigation(event)) return;
        if (handleBookmarkNavigation(event)) return;

        // Escape — priority: shortcuts modal > manage panel > edit modal > settings modal > menu > blur
        if (event.key === "Escape") {
            event.preventDefault();
            const shortcutsModalEl = document.getElementById('shortcuts-modal');
            if (shortcutsModalEl && !shortcutsModalEl.classList.contains('hidden')) {
                closeShortcutsModal();
                return;
            }
            const managePanelEl = document.getElementById('manage-panel');
            if (managePanelEl && !managePanelEl.classList.contains('hidden')) {
                if (window.closeManagePanel) window.closeManagePanel();
                return;
            }
            const addModalEl = document.getElementById("add-modal");
            if (addModalEl && !addModalEl.classList.contains("hidden")) {
                if (window.closeAddModal) window.closeAddModal();
                else addModalEl.classList.add("hidden");
                return;
            }
            const editModalEl = document.getElementById("edit-modal");
            if (editModalEl && !editModalEl.classList.contains("hidden")) {
                if (window.closeEditModal) window.closeEditModal();
                else editModalEl.classList.add("hidden");
                return;
            }
            const settingsModal = document.getElementById("settings-modal");
            if (settingsModal && !settingsModal.classList.contains("hidden") && !settingsModal.dataset.embedded) {
                settingsModal.classList.add("hidden");
                const fp = document.getElementById('feedback-panel');
                if (fp) {
                    fp.classList.add('hidden');
                    const name  = document.getElementById('feedback-name');
                    const email = document.getElementById('feedback-email');
                    const cat   = document.getElementById('feedback-category');
                    const msg   = document.getElementById('feedback-message');
                    const st    = document.getElementById('feedback-status');
                    const sub   = document.getElementById('feedback-submit');
                    if (name)  name.value  = '';
                    if (email) email.value = '';
                    if (cat)   cat.selectedIndex = 0;
                    if (msg)   msg.value   = '';
                    if (st)    { st.textContent = ''; st.classList.add('hidden'); }
                    if (sub)   { sub.disabled = false; sub.textContent = 'Send'; }
                }
                const settingsButton = document.getElementById("settings-btn");
                if (settingsButton) {
                    settingsButton.setAttribute('aria-expanded', 'false');
                    settingsButton.focus();
                }
                return;
            }
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
            return;
        }

        // Skip shortcuts when typing in inputs (excluding filter-btn)
        if ((event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)
            && event.target.id !== 'filter-btn') {
            return;
        }

        // ? — show shortcuts modal
        if (event.key === "?") {
            event.preventDefault();
            openShortcutsModal();
            return;
        }

        // s — focus search
        if (event.key.toLowerCase() === "s") {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
            const searchInput = document.getElementById("search-input");
            if (searchInput) { searchInput.focus(); if (searchInput.value) searchInput.select(); }
            return;
        }

        // f — toggle folder filter panel
        if (event.key.toLowerCase() === "f") {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
            const filterBtn = document.getElementById("filter-btn");
            if (filterBtn) { filterBtn.click(); filterBtn.focus(); }
            return;
        }

        // r — refresh
        if (event.key.toLowerCase() === "r") {
            event.preventDefault();
            if (window.refreshApp) window.refreshApp();
            else window.location.reload();
            return;
        }

        // h — toggle settings
        if (event.key.toLowerCase() === "h") {
            event.preventDefault();
            const settingsBtn = document.getElementById("settings-btn");
            if (settingsBtn) settingsBtn.click();
            return;
        }

        // / — focus search (alternative)
        if (event.key === "/") {
            const searchInput = document.getElementById("search-input");
            if (searchInput && document.activeElement !== searchInput) {
                event.preventDefault();
                searchInput.focus();
            }
        }
    });
}
