// Keyboard shortcuts for Bookmark Hero
console.log('Keyboard shortcuts script loaded!');

// Action functions for direct keyboard shortcuts
function triggerEditAction(cardElement) {
    console.log('🔧 Triggering edit action for card:', cardElement);
    
    if (!window.getBookmarkFromCard || !window.openEditModal) {
        console.error('Required functions not available');
        return;
    }
    
    const bookmarkData = window.getBookmarkFromCard(cardElement);
    console.log('📋 Extracted bookmark data:', bookmarkData);
    
    if (bookmarkData) {
        console.log('✅ Opening edit modal for:', bookmarkData.title);
        console.log('📝 Full bookmark data being passed:', {
            id: bookmarkData.id,
            title: bookmarkData.title,
            url: bookmarkData.url,
            parentId: bookmarkData.parentId
        });
        window.openEditModal(bookmarkData);
    } else {
        console.error('❌ Could not extract bookmark data from card');
        console.log('Card HTML:', cardElement.outerHTML);
    }
}

function triggerDeleteAction(cardElement) {
    console.log('🗑️ Triggering delete action for card:', cardElement);
    
    if (!window.getBookmarkFromCard || !window.deleteBookmark) {
        console.error('Required functions not available');
        return;
    }
    
    const bookmarkData = window.getBookmarkFromCard(cardElement);
    if (bookmarkData && confirm(`Are you sure you want to delete "${bookmarkData.title}"?`)) {
        console.log('Deleting bookmark:', bookmarkData.title);
        
        // Find next card to focus on after deletion
        const allCards = Array.from(document.querySelectorAll('.card'));
        const currentIndex = allCards.indexOf(cardElement);
        const nextCard = allCards[currentIndex + 1] || allCards[currentIndex - 1];
        
        window.deleteBookmark(bookmarkData);
        
        // Focus next card after a short delay
        setTimeout(() => {
            if (nextCard && document.contains(nextCard)) {
                nextCard.focus();
                console.log('Focused next card after deletion');
            }
        }, 100);
    }
}

function triggerCaptureAction(cardElement) {
    console.log('📸 Triggering capture action for card:', cardElement);
    
    if (!window.getBookmarkFromCard || !window.captureScreenshot) {
        console.error('Required functions not available');
        return;
    }
    
    const bookmarkData = window.getBookmarkFromCard(cardElement);
    if (bookmarkData) {
        console.log('Capturing screenshot for:', bookmarkData.title, 'URL:', bookmarkData.url);
        window.captureScreenshot(bookmarkData.url, bookmarkData.title, function() {
            console.log('Screenshot capture completed');
            // Optionally refresh the card or show some feedback
        });
    } else {
        console.error('Could not extract bookmark data from card');
    }
}

function triggerOpenUrl(cardElement) {
    console.log('🔗 Triggering open URL for card:', cardElement);
    const link = cardElement.querySelector('a');
    if (link && link.href) {
        console.log('Opening link:', link.href);
        window.open(link.href, '_blank');
    } else {
        console.log('No link found in card');
    }
}

// Function to improve focus visibility
function highlightFocusedCard(cardElement) {
    // Remove highlight from all cards
    document.querySelectorAll('.card').forEach(card => {
        card.style.outline = '';
        card.style.boxShadow = '';
    });
    
    // Highlight the focused card
    if (cardElement) {
        cardElement.style.outline = '3px solid #3b82f6';
        cardElement.style.boxShadow = '0 0 0 1px #3b82f6';
        console.log('🎯 Highlighted focused card:', cardElement.querySelector('h3')?.textContent || 'Unknown title');
    }
}

// Wait for DOM and main.js to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('Keyboard shortcuts: DOM loaded');
    initializeKeyboardShortcuts();
});

// Also try immediate initialization if DOM is already loaded
if (document.readyState === 'loading') {
    console.log('Keyboard shortcuts: DOM still loading, waiting...');
} else {
    console.log('Keyboard shortcuts: DOM already loaded, initializing immediately');
    initializeKeyboardShortcuts();
}

function initializeKeyboardShortcuts() {
    console.log('Initializing keyboard shortcuts...');
    
    // Wait a bit for main.js to finish setting up window.showPopupMenu
    setTimeout(() => {
        console.log('Keyboard shortcuts ready. showPopupMenu available:', typeof window.showPopupMenu === 'function');
        setupKeyboardListeners();
        setupDOMObserver();
    }, 200);
}

// Tab navigation order and arrow key navigation for bookmark cards
let currentBookmarkIndex = -1;
let bookmarkCards = [];
let currentMenuIndex = -1;
let menuItems = [];

// Update bookmark cards array when DOM changes
function updateBookmarkCards() {
    bookmarkCards = Array.from(document.querySelectorAll('.card'));
    // Add tabindex to bookmark cards for keyboard navigation
    bookmarkCards.forEach((card, index) => {
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-bookmark-index', index);
    });
}

// Function to open bookmark card menu programmatically
// Function to open bookmark card menu
function openBookmarkCardMenu(bookmarkCard) {
    console.log('=== OPENING MENU DEBUG ===');
    console.log('Opening menu for bookmark card:', bookmarkCard);
    console.log('Card classes:', bookmarkCard.className);
    
    try {
        // Find the more button (three dots) - it's typically an img or button with more icon
        const moreButton = bookmarkCard.querySelector('img[src*="more"], button[src*="more"], img[alt*="more"], [class*="more"]');
        
        if (!moreButton) {
            // Try alternative selectors for the more button
            const possibleButtons = bookmarkCard.querySelectorAll('img, button');
            console.log('Available buttons/images in card:', possibleButtons.length);
            
            // Look for the more button by checking src or other attributes
            for (let btn of possibleButtons) {
                console.log('Button/Image:', btn, 'src:', btn.src, 'alt:', btn.alt, 'class:', btn.className);
                if (btn.src && (btn.src.includes('more') || btn.src.includes('menu'))) {
                    console.log('✓ Found more button by src, triggering click event...');
                    
                    // Create and dispatch click event
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    btn.dispatchEvent(clickEvent);
                    
                    console.log('✓ More button clicked successfully');
                    
                    // Wait for menu to be created and set up navigation
                    setTimeout(() => {
                        setupBookmarkMenuNavigation();
                    }, 100);
                    return;
                }
            }
            console.log('❌ More button not found');
            return;
        }
        
        console.log('✓ Found more button, triggering click event...');
        
        // Create and dispatch click event
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        moreButton.dispatchEvent(clickEvent);
        
        console.log('✓ More button clicked successfully');
        
        // Wait for menu to be created and set up navigation
        setTimeout(() => {
            setupBookmarkMenuNavigation();
        }, 100);
        
    } catch (error) {
        console.log('❌ Error clicking more button:', error);
    }
}// Function to initialize menu navigation
function initializeMenuNavigation() {
    // Wait a bit for the menu to be created
    setTimeout(() => {
        const menu = document.querySelector('.absolute.z-10.flex.flex-col.bg-zinc-800.w-44.h-32.rounded');
        if (menu) {
            menuItems = Array.from(menu.querySelectorAll('button'));
            currentMenuIndex = 0;
            if (menuItems.length > 0) {
                menuItems[0].focus();
                highlightMenuItem(0);
            }
        }
    }, 50);
}

function setupMenuKeyboardNavigation() {
        // Find the actual popup menu that was created
        const popupMenu = document.querySelector('.absolute.z-10.flex.flex-col.bg-zinc-800.w-44.h-32.rounded');
        if (!popupMenu) {
            console.log('Popup menu not found');
            return;
        }
        
        // Get all menu item buttons
        menuItems = Array.from(popupMenu.querySelectorAll('button'));
        currentMenuIndex = 0;
        
        if (menuItems.length > 0) {
            // Focus the first menu item
            menuItems[0].focus();
            highlightMenuItem(0);
            console.log('✅ Menu navigation set up with', menuItems.length, 'items');
        }
    }

// New function specifically for bookmark menu navigation  
function setupBookmarkMenuNavigation() {
    console.log('🔍 Setting up bookmark menu navigation...');
    
    // Look for the popup menu in document.body (where it gets appended)
    const popupMenu = document.querySelector('.absolute.z-10.flex.flex-col.bg-zinc-800.w-44.h-32.rounded');
    
    if (!popupMenu) {
        console.log('❌ Popup menu not found in body');
        return;
    }
    
    console.log('✅ Found popup menu:', popupMenu);
    
    // Get all button elements inside the menu
    const buttons = Array.from(popupMenu.querySelectorAll('button'));
    console.log('Found buttons in menu:', buttons.length);
    
    if (buttons.length === 0) {
        console.log('❌ No buttons found in popup menu');
        return;
    }
    
    // Store menu items for navigation
    menuItems = buttons;
    currentMenuIndex = 0;
    
    // Focus the first button
    buttons[0].focus();
    console.log('✅ Focused first menu item:', buttons[0].textContent);
    
    // Add visual highlight
    highlightMenuItem(0);
}

// Function to highlight menu item
function highlightMenuItem(index) {
    menuItems.forEach((item, i) => {
        const container = item.parentElement;
        if (i === index) {
            container.classList.add('bg-zinc-600');
            container.classList.remove('hover:bg-zinc-700');
        } else {
            container.classList.remove('bg-zinc-600');
            container.classList.add('hover:bg-zinc-700');
        }
    });
}

// Function to handle menu navigation
function handleMenuNavigation(event) {
    if (menuItems.length === 0) return false;
    // Unify navigation for menu and filter dropdown
    let handled = false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation(); // Stop event from bubbling to card navigation
        if (event.key === 'ArrowDown') {
            currentMenuIndex = (currentMenuIndex + 1) % menuItems.length;
        } else {
            currentMenuIndex = currentMenuIndex === 0 ? menuItems.length - 1 : currentMenuIndex - 1;
        }
        highlightMenuItem(currentMenuIndex);
        menuItems[currentMenuIndex].focus();
        handled = true;
    } else if (event.key === 'Enter' || event.key === ' ') {
        // Enter/Space handling is now done at the top level for better control
        // This section is kept for completeness but shouldn't be reached for Enter
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        console.log('🎯 Menu Enter/Space pressed (fallback handler)');
        if (menuItems[currentMenuIndex]) {
            menuItems[currentMenuIndex].click();
        }
        handled = true;
    } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation(); // Stop event from bubbling
        closeMenu();
        handled = true;
    }
    return handled;
}

// Function to close menu
function closeMenu() {
    const menu = document.querySelector('.absolute.z-10.flex.flex-col.bg-zinc-800.w-44.h-32.rounded');
    if (menu) {
        menu.remove();
        console.log('✅ Bookmark menu closed');
    }
    menuItems = [];
    currentMenuIndex = -1;
    
    // Return focus to the previously focused bookmark card
    if (bookmarkCards[currentBookmarkIndex]) {
        bookmarkCards[currentBookmarkIndex].focus();
    }
}

// Function to get all focusable elements in tab order
function getFocusableElements() {
    const elements = [];
    
    // Add basic controls
    const searchInput = document.getElementById('search-input');
    const filter = document.getElementById('filter');
    const recentsView = document.getElementById('recents-view');
    const folderView = document.getElementById('folder-view');
    const settingsBtn = document.getElementById('settings-btn');
    
    if (searchInput) elements.push(searchInput);
    if (filter) elements.push(filter);
    if (recentsView) elements.push(recentsView);
    if (folderView) elements.push(folderView);
    
    // Add main headings and their first bookmark cards only
    const folderList = document.getElementById('folder-list');
    if (folderList) {
        // Get all main sections (direct children of folder-list)
        const mainSections = Array.from(folderList.children);
        for (let section of mainSections) {
            // Add main headings (h1, h2) - these are section titles
            const mainHeadings = section.querySelectorAll('h1, h2');
            mainHeadings.forEach(heading => {
                // Make headings focusable
                heading.setAttribute('tabindex', '0');
                elements.push(heading);
                // After each heading, add the first bookmark card in that section
                let firstCard = null;
                // Try to find the first card after the heading
                let next = heading.nextElementSibling;
                while (next && !firstCard) {
                    if (next.classList && next.classList.contains('card')) {
                        firstCard = next;
                        break;
                    }
                    // Search inside containers
                    const cardInContainer = next.querySelector ? next.querySelector('.card') : null;
                    if (cardInContainer) {
                        firstCard = cardInContainer;
                        break;
                    }
                    next = next.nextElementSibling;
                }
                // Fallback: search in section
                if (!firstCard) {
                    firstCard = section.querySelector('.card');
                }
                if (firstCard) {
                    elements.push(firstCard);
                }
            });
            // Handle sections without explicit headings but with cards
            if (mainHeadings.length === 0) {
                const firstCard = section.querySelector('.card');
                if (firstCard) {
                    elements.push(firstCard);
                }
            }
        }
    }
    
    // Add settings button at the end
    if (settingsBtn) elements.push(settingsBtn);
    
    return elements.filter(el => el && !el.hidden && !el.disabled && getComputedStyle(el).display !== 'none');
}

// Function to focus bookmark card by index
function focusBookmarkCard(index) {
    if (index >= 0 && index < bookmarkCards.length) {
        currentBookmarkIndex = index;
        bookmarkCards[index].focus();
        // Scroll card into view
        bookmarkCards[index].scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
        });
    }
}

// Function to handle arrow key navigation within bookmark cards
function handleBookmarkNavigation(event) {
    if (bookmarkCards.length === 0) return false;
    
    const focusedElement = document.activeElement;
    const isBookmarkFocused = focusedElement.classList.contains('card');
    
    if (!isBookmarkFocused) return false;
    
    // Find the immediate parent container that holds this card
    // Look for grid containers or section containers
    let parentContainer = focusedElement.closest('.grid');
    if (!parentContainer) {
        parentContainer = focusedElement.closest('[class*="grid"]');
    }
    if (!parentContainer) {
        // Fallback: find the section container
        parentContainer = focusedElement.closest('#folder-list > *');
    }

    if (!parentContainer) return false;

    // Get cards only from current container (section or subfolder)
    const containerCards = Array.from(parentContainer.querySelectorAll('.card'));
    const currentContainerIndex = containerCards.indexOf(focusedElement);

    if (currentContainerIndex === -1) return false;

    let newContainerIndex = currentContainerIndex;
    
    // Calculate grid dimensions for current container
    const containerWidth = parentContainer.offsetWidth;
    const cardWidth = 240; // min-w-60 = 240px
    const cardsPerRow = Math.max(1, Math.floor(containerWidth / cardWidth));
    
    switch(event.key) {
        case 'ArrowRight':
            newContainerIndex = (currentContainerIndex + 1) % containerCards.length;
            break;
        case 'ArrowLeft':
            newContainerIndex = currentContainerIndex === 0 ? containerCards.length - 1 : currentContainerIndex - 1;
            break;
        case 'ArrowDown':
            newContainerIndex = Math.min(currentContainerIndex + cardsPerRow, containerCards.length - 1);
            break;
        case 'ArrowUp':
            newContainerIndex = Math.max(currentContainerIndex - cardsPerRow, 0);
            break;
        default:
            return false;
    }
    
    event.preventDefault();
    
    const targetCard = containerCards[newContainerIndex];
    if (targetCard) {
        // Update global bookmark index for consistency
        currentBookmarkIndex = containerCards.indexOf(targetCard);
        targetCard.focus();
        
        // Highlight the newly focused card
        highlightFocusedCard(targetCard);
        
        targetCard.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
        });
    }
    
    return true;
}

// Enhanced Tab navigation
function handleTabNavigation(event) {
    if (event.key !== 'Tab') return false;
    
    const focusableElements = getFocusableElements();
    const currentElement = document.activeElement;
    let currentIndex = focusableElements.indexOf(currentElement);
    
    // If current element is a bookmark card that's not the first in its section,
    // find the corresponding first card in focusable elements
    if (currentIndex === -1 && currentElement.classList.contains('card')) {
        // Find the section this card belongs to and get its first card
        const parentGrid = currentElement.closest('.grid, [class*="grid"]') || 
                          currentElement.closest('#folder-list > *');
        if (parentGrid) {
            const firstCardInSection = parentGrid.querySelector('.card');
            currentIndex = focusableElements.indexOf(firstCardInSection);
        }
    }
    
    if (currentIndex === -1) {
        // If not found, start from beginning
        currentIndex = -1;
    }
    
    let nextIndex;
    if (event.shiftKey) {
        // Shift+Tab - go backwards
        nextIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
    } else {
        // Tab - go forwards
        nextIndex = (currentIndex + 1) % focusableElements.length;
    }
    
    event.preventDefault();
    const nextElement = focusableElements[nextIndex];
    
    // If focusing a bookmark card, update current index for arrow navigation
    if (nextElement.classList.contains('card')) {
        currentBookmarkIndex = parseInt(nextElement.getAttribute('data-bookmark-index'));
    }
    
    nextElement.focus();
    
    // Scroll to element if needed
    if (nextElement.scrollIntoView) {
        nextElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
        });
    }
    
    return true;
}

// Initialize bookmark cards when DOM is loaded
function initializeTabNavigation() {
    updateBookmarkCards();
    
    // Update bookmark cards when new content is loaded
    const observer = new MutationObserver(() => {
        updateBookmarkCards();
    });
    
    const folderList = document.getElementById('folder-list');
    if (folderList) {
        observer.observe(folderList, { childList: true, subtree: true });
    }
}

function setupDOMObserver() {
    // Set up mutation observer for dynamic content
    const observer = new MutationObserver(() => {
        updateBookmarkCards();
    });
    
    const folderList = document.getElementById('folder-list');
    if (folderList) {
        observer.observe(folderList, { childList: true, subtree: true });
        console.log('DOM observer set up for folder-list');
    } else {
        console.log('folder-list element not found for DOM observer');
    }
}

function setupKeyboardListeners() {
    console.log('Setting up keyboard event listeners...');
    
    document.addEventListener("keydown", function (event) {
        console.log('Key pressed:', event.key, 'Target:', event.target.tagName, 'ID:', event.target.id);
    
    // Handle direct bookmark actions when a card is focused
    const focusedElement = document.activeElement;
    if (focusedElement && focusedElement.classList.contains('card')) {
        
        // Highlight the focused card for better visibility
        highlightFocusedCard(focusedElement);
        
        // Handle "E" key to edit bookmark
        if (event.key.toLowerCase() === "e") {
            console.log('✏️ E key pressed - opening edit modal');
            event.preventDefault();
            triggerEditAction(focusedElement);
            return;
        }
        
        // Handle "Delete" key to delete bookmark
        if (event.key === "Delete" || event.key === "Backspace") {
            console.log('🗑️ Delete key pressed - deleting bookmark');
            event.preventDefault();
            triggerDeleteAction(focusedElement);
            return;
        }
        
        // Handle "C" key to capture/recapture screenshot
        if (event.key.toLowerCase() === "c") {
            console.log('📸 C key pressed - capturing screenshot');
            event.preventDefault();
            triggerCaptureAction(focusedElement);
            return;
        }
        
        // Handle "Enter" key to open bookmark URL
        if (event.key === "Enter") {
            console.log('🔗 Enter key pressed - opening bookmark link');
            event.preventDefault();
            triggerOpenUrl(focusedElement);
            return;
        }
    }
    
    // Handle Tab navigation
    if (handleTabNavigation(event)) {
        return;
    }
    
    // Handle arrow key navigation for bookmark cards
    if (handleBookmarkNavigation(event)) {
        // Close menu if open when navigating between cards
        if (menuItems.length > 0) {
            closeMenu();
        }
        return;
    }
    
    // Handle Escape key first (always allow it to work)
    if (event.key === "Escape") {
        console.log('Escape key pressed - unfocusing elements');
        console.log('Current active element:', document.activeElement.tagName, document.activeElement.id);
        event.preventDefault();
        
        // Close menu if open
        if (menuItems.length > 0) {
            closeMenu();
            return;
        }
        
        // Close settings modal if open (highest priority)
        const settingsModal = document.getElementById("settings-modal");
        if (settingsModal && !settingsModal.classList.contains("hidden")) {
            settingsModal.classList.add("hidden");
            console.log('Closed settings modal');
            return;
        }
        
        // Close edit modal if open
        const editModal = document.getElementById("edit-modal");
        if (editModal && !editModal.classList.contains("hidden")) {
            editModal.classList.add("hidden");
            console.log('Closed edit modal');
            return;
        }
        
        // Unfocus search input if it's focused
        const searchInput = document.getElementById("search-input");
        if (searchInput && document.activeElement === searchInput) {
            searchInput.blur();
            console.log('Unfocused search input');
            return;
        }
        
        // Unfocus filter dropdown if focused
        const filterDropdown = document.getElementById("filter");
        if (filterDropdown && document.activeElement === filterDropdown) {
            filterDropdown.blur();
            console.log('Unfocused filter dropdown');
            return;
        }
        
        // Unfocus any other focused element
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
            console.log('Unfocused active element:', document.activeElement.tagName);
            return;
        }
        
        console.log('No element to unfocus');
        return;
    }
    
    // Skip if user is typing in an input field (but allow select dropdown to receive keys)
    // Don't skip for Escape key as we handle it above
    if ((event.target.tagName === 'INPUT' || 
         event.target.tagName === 'TEXTAREA' || 
         event.target.isContentEditable) && 
         event.target.id !== 'filter') {
        console.log('Skipping - user is typing in input field');
        return;
    }
    
    // Focus search bar and scroll to top on 's' key
    if (event.key.toLowerCase() === "s") {
        console.log('S key pressed - focusing search');
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        const searchInput = document.getElementById("search-input");
        if (searchInput) {
            searchInput.focus();
            if (searchInput.value) {
                searchInput.select();
            }
        }
        return;
    }
    
    // F key toggles filter dropdown open/close
    if (event.key.toLowerCase() === "f") {
        console.log('F key pressed - toggling filter');
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        const filterDropdown = document.getElementById("filter");
        if (filterDropdown) {
            if (document.activeElement === filterDropdown) {
                filterDropdown.blur();
            } else {
                filterDropdown.focus();
                if (filterDropdown.showPicker) {
                    filterDropdown.showPicker();
                } else {
                    const rect = filterDropdown.getBoundingClientRect();
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: rect.left + rect.width - 20,
                        clientY: rect.top + rect.height / 2
                    });
                    filterDropdown.dispatchEvent(clickEvent);
                }
            }
        }
        return;
    }
    
    // Refresh page on 'r' key
    if (event.key.toLowerCase() === "r") {
        console.log('R key pressed - refreshing page');
        event.preventDefault();
        window.location.reload();
        return;
    }
    
    // Open settings modal on 'h' key
    if (event.key.toLowerCase() === "h") {
        console.log('H key pressed - opening settings');
        event.preventDefault();
        const settingsBtn = document.getElementById("settings-btn");
        const settingsModal = document.getElementById("settings-modal");
        if (settingsBtn && settingsModal) {
            settingsBtn.click(); // Trigger the existing click handler
        }
        return;
    }
    
    // Existing shortcuts
    if (event.key === "/") {
        const searchInput = document.getElementById("search-input");
        if (searchInput && document.activeElement !== searchInput) {
            event.preventDefault();
            searchInput.focus();
        }
    }
    });
}
