// Keyboard shortcuts for Bookmark Hero
console.log('Keyboard shortcuts script loaded!');

document.addEventListener("keydown", function (event) {
    console.log('Key pressed:', event.key, 'Target:', event.target.tagName, 'ID:', event.target.id);
    
    // Handle Escape key first (always allow it to work)
    if (event.key === "Escape") {
        console.log('Escape key pressed - unfocusing elements');
        console.log('Current active element:', document.activeElement.tagName, document.activeElement.id);
        event.preventDefault();
        
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
