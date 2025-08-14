// Keyboard shortcuts for Bookmark Hero
console.log('Keyboard shortcuts script loaded!');

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
    function openBookmarkCardMenu(bookmarkCard) {
        console.log('=== OPENING MENU DEBUG ===');
        console.log('Opening menu for bookmark card:', bookmarkCard);
        console.log('Card classes:', bookmarkCard.className);
        
        // Find the bookmark node data
        const bookmarkLink = bookmarkCard.querySelector('a');
        const bookmarkTitle = bookmarkCard.querySelector('h3');
        
        if (!bookmarkLink || !bookmarkTitle) {
            console.log('❌ Could not find bookmark link or title in card');
            console.log('Link found:', !!bookmarkLink);
            console.log('Title found:', !!bookmarkTitle);
            return;
        }
        
        const bookmarkUrl = bookmarkLink.href;
        const bookmarkTitleText = bookmarkTitle.textContent;
        
        console.log('✓ Found bookmark data:', { url: bookmarkUrl, title: bookmarkTitleText });
        
        // Find the more button (three dots) in this card
        const moreButton = bookmarkCard.querySelector('.close-button');
        if (!moreButton) {
            console.log('❌ More button (.close-button) not found in bookmark card');
            console.log('Available buttons in card:', bookmarkCard.querySelectorAll('button').length);
            return;
        }
        
        console.log('✓ Found more button, triggering click event...');
        
        // Instead of calling showPopupMenu directly, just click the button
        // This ensures we use exactly the same flow as the mouse click
        try {
            moreButton.click();
            console.log('✓ More button clicked successfully');
            
            // After menu is created, set up keyboard navigation
            setTimeout(() => {
                setupMenuKeyboardNavigation();
            }, 10);
        } catch (error) {
            console.log('❌ Error clicking more button:', error);
        }
    }

// Function to initialize menu navigation
function initializeMenuNavigation() {
    // Wait a bit for the menu to be created
    setTimeout(() => {
        const menu = document.querySelector('.absolute.z-10.flex.flex-col.bg-zinc-800');
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
        const popupMenu = document.querySelector('.absolute.z-10.flex.flex-col.bg-zinc-800');
        if (!popupMenu) {
            console.log('Popup menu not found');
            return;
        }
        
        // Get all menu item buttons
        menuItems = Array.from(popupMenu.querySelectorAll('button'));
        currentMenuIndex = 0;
        
        console.log('Found', menuItems.length, 'menu items for keyboard navigation');
        
        if (menuItems.length > 0) {
            highlightMenuItem(0);
            menuItems[0].focus();
        }
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
    
    switch(event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentMenuIndex = (currentMenuIndex + 1) % menuItems.length;
            highlightMenuItem(currentMenuIndex);
            menuItems[currentMenuIndex].focus();
            return true;
        case 'ArrowUp':
            event.preventDefault();
            currentMenuIndex = currentMenuIndex === 0 ? menuItems.length - 1 : currentMenuIndex - 1;
            highlightMenuItem(currentMenuIndex);
            menuItems[currentMenuIndex].focus();
            return true;
        case 'Enter':
        case ' ':
            event.preventDefault();
            if (menuItems[currentMenuIndex]) {
                menuItems[currentMenuIndex].click();
            }
            return true;
        case 'Escape':
            event.preventDefault();
            closeMenu();
            return true;
        default:
            return false;
    }
}

// Function to close menu
function closeMenu() {
    const menu = document.querySelector('.absolute.z-10.flex.flex-col.bg-zinc-800');
    if (menu) {
        menu.remove();
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
    
    // Add main headings and their first bookmark cards
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
                const sectionElement = heading.parentElement || heading.nextElementSibling || section;
                let firstCard = null;
                
                // Look for first card in various possible containers
                const possibleContainers = [
                    sectionElement.querySelector('.grid'),
                    sectionElement.querySelector('[class*="grid"]'),
                    sectionElement,
                    section
                ];
                
                for (let container of possibleContainers) {
                    if (container) {
                        firstCard = container.querySelector('.card');
                        if (firstCard) break;
                    }
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
    
    const currentIndex = parseInt(focusedElement.getAttribute('data-bookmark-index'));
    
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
        currentBookmarkIndex = parseInt(targetCard.getAttribute('data-bookmark-index'));
        targetCard.focus();
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
    
    // Handle menu navigation if menu is open
    if (menuItems.length > 0) {
        if (handleMenuNavigation(event)) {
            return;
        }
    }
    
    // Handle "M" key to open bookmark card menu (check this BEFORE other navigation)
    if (event.key.toLowerCase() === "m") {
        const focusedElement = document.activeElement;
        console.log('=== M KEY DEBUG ===');
        console.log('M key pressed. Focused element tag:', focusedElement.tagName);
        console.log('M key pressed. Focused element class:', focusedElement.className);
        console.log('M key pressed. Focused element classList contains card:', focusedElement.classList.contains('card'));
        console.log('M key pressed. All classes:', Array.from(focusedElement.classList));
        console.log('Available cards on page:', document.querySelectorAll('.card').length);
        console.log('===================');
        
        // Test: Always show this message when M is pressed, regardless of focus
        console.log('🔵 M KEY RECEIVED - Processing...');
        
        if (focusedElement && focusedElement.classList.contains('card')) {
            console.log('✅ M key pressed - opening bookmark card menu for focused card');
            event.preventDefault();
            
            // Update the current bookmark index by finding it in the bookmarkCards array
            bookmarkCards = Array.from(document.querySelectorAll('.card'));
            currentBookmarkIndex = bookmarkCards.indexOf(focusedElement);
            console.log('Current bookmark index:', currentBookmarkIndex);
            
            openBookmarkCardMenu(focusedElement);
            return;
        } else {
            console.log('❌ M key pressed but no bookmark card is focused.');
            console.log('Focused element details:', {
                tag: focusedElement.tagName,
                id: focusedElement.id,
                classes: focusedElement.className
            });
            
            // Test: Let's try to find and focus the first card for testing
            const firstCard = document.querySelector('.card');
            if (firstCard) {
                console.log('🧪 TEST: Found first card, trying to focus it...');
                firstCard.focus();
                console.log('🧪 TEST: First card focused. Try M key again.');
            }
        }
    }
    
    // Handle "Enter" key to open bookmark link in new tab
    if (event.key === "Enter") {
        const focusedElement = document.activeElement;
        if (focusedElement && focusedElement.classList.contains('card')) {
            console.log('Enter key pressed - opening bookmark link');
            event.preventDefault();
            
            // Find the link inside the card
            const link = focusedElement.querySelector('a');
            if (link && link.href) {
                console.log('Opening link:', link.href);
                window.open(link.href, '_blank');
            } else {
                console.log('No link found in focused card');
            }
            return;
        }
    }
    
    // Handle Tab navigation
    if (handleTabNavigation(event)) {
        return;
    }
    
    // Handle arrow key navigation for bookmark cards
    if (handleBookmarkNavigation(event)) {
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
    
    // Focus filter dropdown on 'f' key
    if (event.key.toLowerCase() === "f") {
        console.log('F key pressed - focusing filter');
        event.preventDefault();
        // Scroll to top first, similar to search focus
        window.scrollTo({ top: 0, behavior: "smooth" });
        const filterDropdown = document.getElementById("filter");
        if (filterDropdown) {
            filterDropdown.focus();
            // For select elements, we need to dispatch a click event on the dropdown arrow or use showPicker
            if (filterDropdown.showPicker) {
                filterDropdown.showPicker();
            } else {
                // Fallback: simulate click on the dropdown area
                const rect = filterDropdown.getBoundingClientRect();
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: rect.left + rect.width - 20, // Click near the arrow
                    clientY: rect.top + rect.height / 2
                });
                filterDropdown.dispatchEvent(clickEvent);
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
