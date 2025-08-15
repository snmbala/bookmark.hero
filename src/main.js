// Import all modules
import { initializeThemeToggle, updateSettingsIconColor } from './modules/theme.js';
import { populateFilterDropdown, updateClearFilterButton } from './modules/filter.js';
import { captureScreenshot, getThumbnailUrl } from './modules/thumbnail.js';
import { handleScreenshotCapture } from './modules/captureScreenshot.js';

chrome.bookmarks.getTree(function (bookmarks) {
    const folderList = document.getElementById("folder-list");
    const searchInput = document.getElementById("search-input");
    const clearSearch = document.getElementById("clear-search");
    const searchIcon = document.getElementById("search-icon");
    const filterDropdown = document.getElementById("filter");
    const folderViewButton = document.getElementById("folder-view");
    const recentsViewButton = document.getElementById("recents-view");
    const recentsIconSvg = document.getElementById("recents-icon");
    const settingsButton = document.getElementById("settings-btn");

    let FILTER_ID = 0;
    let gridViewEnabled = true;
    let allBookmarks = [];
    let filterOptions = [{ label: "All", value: "all", level: 0, id: 0 }];

    // Bookmark tree cache for performance
    let bookmarkCache = { data: null, timestamp: 0 };
    const CACHE_TTL = 5000; // 5 seconds

    // Performance optimization: Debounce function with cancellation support
    function debounce(func, wait) {
        let timeout;
        const executedFunction = function(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
        
        // Add cancel method to clear pending execution
        executedFunction.cancel = function() {
            clearTimeout(timeout);
        };
        
        return executedFunction;
    }

    // Performance optimization: Cached bookmark retrieval
    function getCachedBookmarks() {
        const now = Date.now();
        if (bookmarkCache.data && (now - bookmarkCache.timestamp) < CACHE_TTL) {
            return Promise.resolve(bookmarkCache.data);
        }
        
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((bookmarks) => {
                bookmarkCache.data = bookmarks;
                bookmarkCache.timestamp = now;
                resolve(bookmarks);
            });
        });
    }

    // Initialize theme handlers
    initializeThemeToggle();
    
    // Initialize settings icon color
    document.addEventListener("DOMContentLoaded", updateSettingsIconColor);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateSettingsIconColor);

    // Settings modal handling
    let settingsModalOpen = false;
    const settingsModal = document.getElementById("settings-modal");
    settingsButton.addEventListener("click", function (event) {
        event.stopPropagation();
        settingsModal.classList.toggle("hidden");
        settingsModalOpen = !settingsModal.classList.contains("hidden");
        
        // If modal is now open, focus the first theme button
        if (settingsModalOpen) {
            setTimeout(() => {
                const autoButton = document.querySelector('button[data-theme="auto"]');
                if (autoButton) {
                    autoButton.focus();
                    console.log('🎯 Focused Auto theme button in settings modal');
                }
            }, 100);
        }
    });
    settingsModal.addEventListener("click", function (event) {
        event.stopPropagation();
    });
    document.addEventListener("click", function () {
        if (settingsModalOpen && !settingsModal.classList.contains("hidden")) {
            settingsModal.classList.add("hidden");
            settingsModalOpen = false;
        }
    });

    // Collect bookmarks function
    function collectBookmarks(node, folderName = "") {
        if (node.children) {
            folderName = node.title;
            for (const child of node.children) {
                collectBookmarks(child, folderName);
            }
        } else {
            allBookmarks.push({ bookmark: node, folder: folderName });
        }
    }

    // Populate allBookmarks array
    for (const node of bookmarks[0].children) {
        collectBookmarks(node);
    }

    // Sort bookmarks based on recently used
    let sortedBookmarks = allBookmarks.sort((a, b) => {
        const lastVisitedA = a.bookmark.dateLastUsed || a.bookmark.dateAdded;
        const lastVisitedB = b.bookmark.dateLastUsed || b.bookmark.dateAdded;
        return lastVisitedB - lastVisitedA;
    });

    // Performance optimization: Debounced search handler
    const performSearch = debounce(function(searchTerm) {
        if (gridViewEnabled) {
            showGridView(searchTerm);
        } else {
            filterBookmarks(bookmarks, searchTerm);
        }
    }, 300); // 300ms debounce delay

    // Search functionality
    searchInput.addEventListener("input", function () {
        if (searchInput.value) {
            clearSearch.classList.remove("hidden");
            if (document.activeElement === searchInput) {
                searchIcon.src = "assets/icons/search-blue.svg";
            } else {
                searchIcon.src = "assets/icons/search.svg";
            }
            const searchTerm = searchInput.value.trim().toLowerCase();
            performSearch(searchTerm);
        } else {
            // Cancel any pending debounced search when input is cleared
            performSearch.cancel && performSearch.cancel();
            clearSearch.classList.add("hidden");
            searchIcon.src = "assets/icons/search.svg";
            if (gridViewEnabled) {
                showGridView("");
            } else {
                filterBookmarks(bookmarks, "");
            }
        }
    });

    clearSearch.addEventListener("click", function () {
        searchInput.value = "";
        // Cancel any pending debounced search when manually clearing
        performSearch.cancel && performSearch.cancel();
        clearSearch.classList.add("hidden");
        searchIcon.src = "assets/icons/search.svg";
        if (gridViewEnabled) {
            showGridView("");
        } else {
            filterBookmarks(bookmarks, "");
        }
    });

    // Toggle view functionality
    function toggleView() {
        gridViewEnabled = !gridViewEnabled;
        
        // Reset search input and clear search state
        searchInput.value = "";
        clearSearch.classList.add("hidden");
        searchIcon.src = "assets/icons/search.svg";
        
        // Reset filter dropdown to "All"
        filterDropdown.value = "all";
        FILTER_ID = 0;
        updateFilterIcon();
        
        const searchTerm = "";
        const folderIcons = document.querySelectorAll(".folder-icon");
        const settingsIcon = document.getElementById('settings-icon-svg');
        
        if (gridViewEnabled) {
            // Handle grid view (recent view)
            folderIcons.forEach(icon => {
                icon.style.fill = "none";
                icon.style.stroke = "#a1a1aa";
            });

            folderViewButton.classList.remove("active");
            folderViewButton.classList.add("in-active");

            recentsIconSvg.style.fill = "#4f46e5";
            recentsIconSvg.style.stroke = "#4f46e5";
            recentsViewButton.classList.add("active");
            recentsViewButton.classList.remove("in-active");

            if (settingsIcon) {
                settingsIcon.querySelectorAll('path').forEach(p => {
                    p.setAttribute('stroke', '#4f46e5');
                });
            }

            showGridView(searchTerm);
        } else {
            // Handle folder view
            folderIcons.forEach(icon => {
                icon.style.fill = "#4f46e5";
                icon.style.stroke = "#4f46e5";
            });

            folderViewButton.classList.add("active");
            folderViewButton.classList.remove("in-active");
            
            recentsIconSvg.style.stroke = "#a1a1aa";
            recentsIconSvg.style.fill = "none";
            recentsViewButton.classList.remove("active");
            recentsViewButton.classList.add("in-active");

            if (settingsIcon) {
                settingsIcon.querySelectorAll('path').forEach(p => {
                    p.setAttribute('stroke', '#a1a1aa');
                });
            }

            filterBookmarks(bookmarks, searchTerm);
        }
    }

    // Grid view function
    function showGridView(searchTerm) {
        sortedBookmarks = allBookmarks.sort((a, b) => {
            const lastVisitedA = a.bookmark.dateLastUsed || a.bookmark.dateAdded;
            const lastVisitedB = b.bookmark.dateLastUsed || b.bookmark.dateAdded;
            return lastVisitedB - lastVisitedA;
        });
        
        // Filter bookmarks based on search term and folder filter
        let filteredBookmarks = sortedBookmarks.filter((bookmark) => {
            const matchesSearch = !searchTerm || 
                containsSearchTerm(bookmark.bookmark.title, searchTerm) || 
                containsSearchTerm(bookmark.bookmark.url, searchTerm);
            
            // If filter is applied, also check folder
            if (FILTER_ID && FILTER_ID !== 0 && FILTER_ID !== "all") {
                const matchesFolder = bookmark.bookmark.parentId == FILTER_ID;
                return matchesSearch && matchesFolder;
            }
            
            return matchesSearch;
        });
        
        // Clear existing items in the folderList
        folderList.innerHTML = "";
        
        // Cleanup previous scroll event listeners
        const existingGrids = document.querySelectorAll('[data-scroll-handler]');
        existingGrids.forEach(grid => {
            if (grid.scrollHandler) {
                window.removeEventListener('scroll', grid.scrollHandler);
            }
        });
        
        // Create dynamic title with H1 for consistency
        const mainTitle = document.createElement("h1");
        mainTitle.textContent = getDynamicTitle(searchTerm, FILTER_ID, filteredBookmarks.length);
        mainTitle.className = "flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50";
        
        const gridContainer = document.createElement("div");
        gridContainer.className = "w-fit";
        folderList.appendChild(gridContainer);
        const grid = document.createElement("div");
        grid.className = "container mx-auto grid my-6 grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8";
        gridContainer.appendChild(mainTitle);
        gridContainer.appendChild(grid);
        
        // Performance optimization: Infinite scrolling for large lists
        const BATCH_SIZE = 100; // Load 100 items at a time
        let currentBatch = 0;
        let isLoading = false;
        
        // Mark grid for cleanup tracking
        grid.setAttribute('data-scroll-handler', 'true');
        
        function loadBatch() {
            if (isLoading) return;
            isLoading = true;
            
            const start = currentBatch * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, filteredBookmarks.length);
            
            const fragment = document.createDocumentFragment();
            
            for (let i = start; i < end; i++) {
                const bookmark = filteredBookmarks[i];
                if (!bookmark.children) {
                    const bookmarkItem = createBookmarkCard(bookmark.bookmark, searchTerm, bookmark.folder);
                    fragment.appendChild(bookmarkItem);
                }
            }
            
            grid.appendChild(fragment);
            currentBatch++;
            isLoading = false;
            
            // Update bookmark cards for keyboard navigation
            if (window.updateBookmarkCards) {
                window.updateBookmarkCards();
            }
        }
        
        // Setup infinite scroll
        function setupInfiniteScroll() {
            const scrollHandler = () => {
                // Check if user has scrolled near the bottom (within 200px)
                if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200) {
                    const totalLoaded = currentBatch * BATCH_SIZE;
                    if (totalLoaded < filteredBookmarks.length && !isLoading) {
                        loadBatch();
                    }
                }
            };
            
            // Add scroll event listener
            window.addEventListener('scroll', scrollHandler);
            
            // Store reference to remove later if needed
            grid.scrollHandler = scrollHandler;
        }
        
        // Load initial batch
        if (filteredBookmarks.length > 0) {
            loadBatch();
            // Only setup infinite scroll if there are more items to load
            if (filteredBookmarks.length > BATCH_SIZE) {
                setupInfiniteScroll();
            }
        }
        
        // Show no results message if needed
        if (filteredBookmarks.length === 0) {
            const noResultsMessage = document.createElement("p");
            noResultsMessage.textContent = searchTerm ? 
                `No bookmarks found matching "${searchTerm}"` : 
                "No bookmarks found.";
            noResultsMessage.className = "text-zinc-500 dark:text-zinc-400 mt-4";
            gridContainer.appendChild(noResultsMessage);
        }
    }

    // Create bookmark card function
    function createBookmarkCard(bookmarkNode, searchTerm, folderName = null) {
        const card = document.createElement("div");
        card.className = "card";
        card.setAttribute('tabindex', '0');
        // Add parent ID and bookmark ID as data attributes for keyboard navigation
        card.setAttribute('data-parent-id', bookmarkNode.parentId || '1');
        card.setAttribute('data-bookmark-id', bookmarkNode.id);
        card.setAttribute('data-bookmark-url', bookmarkNode.url);

        // Keyboard navigation for card
        card.addEventListener('keydown', function(event) {
            // Only handle if card is focused
            if (document.activeElement !== card) return;
            if (event.key === 'Enter') {
                // Open bookmark URL in new tab
                event.preventDefault();
                if (bookmarkNode.url) {
                    window.open(bookmarkNode.url, '_blank');
                }
            } else if (event.key.toLowerCase() === 'm') {
                event.preventDefault();
                // Find the closeButton inside the card and trigger click to open/close menu
                const closeButton = card.querySelector('.close-button');
                if (closeButton) {
                    closeButton.click();
                    // After closing, return focus to card
                    setTimeout(() => {
                        card.focus();
                    }, 200);
                }
            } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                // Let arrow navigation be handled by keyboard-shortcuts.js
                // Do nothing here
            }
        });

        const closeButton = document.createElement("button");
        closeButton.className = "absolute top-0 right-0 m-1 p-1 bg-zinc-500 hover:bg-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-800 rounded-full border-none cursor-pointer close-button";
        closeButton.setAttribute('aria-label', 'More actions for ' + bookmarkNode.title);
        closeButton.addEventListener("click", function (event) {
            event.stopPropagation();
            showPopupMenu(event, bookmarkNode);
        });

        const closeIcon = document.createElement("img");
        closeIcon.src = "assets/icons/more.svg";
        closeIcon.alt = "Close";
        closeIcon.className = "h-4 w-4";

        closeButton.appendChild(closeIcon);
        card.appendChild(closeButton);

        const cardThumbnailSection = document.createElement("a");
        cardThumbnailSection.href = bookmarkNode.url;
        cardThumbnailSection.target = "_blank";
        cardThumbnailSection.className = "flex-center flex-col gap-3 card-thumbnail w-full h-40 border-b-[1.5px] bg-zinc-100 dark:bg-zinc-700 dark:border-zinc-600";

        // Get thumbnail
        getThumbnailUrl(bookmarkNode.url, function (thumbnailUrl) {
            const thumbnailImg = document.createElement("img");
            thumbnailImg.src = thumbnailUrl;
            thumbnailImg.alt = bookmarkNode.url || "Bookmark thumbnail";
            cardThumbnailSection.appendChild(thumbnailImg);

            updateThumbnail(bookmarkNode.title, thumbnailUrl);

            // If no thumbnail is available, add a "Capture" button
            if (thumbnailUrl.startsWith("https://www.google.com/s2/favicons?domain=")) {
                const captureButton = document.createElement("button");
                captureButton.textContent = "Capture Thumbnail";
                captureButton.className = "text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-900 font-semibold py-2 px-4 border shadow rounded-full";
                captureButton.id = "capture-" + bookmarkNode.url;
                captureButton.addEventListener("click", function (event) {
                    event.preventDefault();
                    window.handleScreenshotCapture(bookmarkNode.url, bookmarkNode.title, null, captureButton);
                });
                cardThumbnailSection.appendChild(captureButton);
            }
        });

        card.appendChild(cardThumbnailSection);

        cardThumbnailSection.addEventListener("click", function (event) {
            const clickedTime = new Date().getTime();
            for (const bookmark of allBookmarks) {
                if (bookmark.bookmark.id === bookmarkNode.id) {
                    bookmark.bookmark.dateLastUsed = clickedTime;
                    break;
                }
            }
        });

        const cardDetailsSection = document.createElement("div");
        cardDetailsSection.className = "flex-center h-24 flex-col bg-white dark:bg-zinc-800 px-2 py-4";

        const bookmarkLinkDiv = document.createElement("div");
        bookmarkLinkDiv.className = "flex-start w-full h-5";

        const bookmarkLink = document.createElement("a");
        bookmarkLink.className = "flex-start text-base font-medium text-zinc-800 dark:text-zinc-50 whitespace-nowrap overflow-hidden text-ellipsis";
        bookmarkLink.href = bookmarkNode.url;
        bookmarkLink.target = "_blank";
        bookmarkLink.innerHTML = highlightText(bookmarkNode.title || "Untitled", searchTerm);
        bookmarkLinkDiv.appendChild(bookmarkLink);

        bookmarkLink.addEventListener("click", function (event) {
            const clickedTime = new Date().getTime();
            for (const bookmark of allBookmarks) {
                if (bookmark.bookmark.id === bookmarkNode.id) {
                    bookmark.bookmark.dateLastUsed = clickedTime;
                    break;
                }
            }
        });

        cardDetailsSection.appendChild(bookmarkLinkDiv);

        // Add text scroll functionality
        setTimeout(() => {
            const bookmarkLinkWidth = bookmarkLink.offsetWidth;
            if (bookmarkLinkWidth > 216) {
                bookmarkLinkDiv.classList.add("text-scroll");
            }
        }, 0);

        const bookmarkURLDiv = document.createElement("div");
        bookmarkURLDiv.className = "flex-start w-full h-5 overflow-hidden";
        const bookmarkURL = document.createElement("p");
        bookmarkURL.className = "flex-start text-zinc-800 dark:text-zinc-300 whitespace-nowrap";
        bookmarkURL.title = bookmarkNode.url;

        const url = new URL(bookmarkNode.url);
        let trimmedURL = url.hostname.replace(/^www\./, "");
        const pathname = url.pathname;

        if (pathname && pathname !== "/") {
            trimmedURL = highlightText(trimmedURL, searchTerm) +
                `<span class="text-zinc-400 whitespace-nowrap">${highlightText(pathname, searchTerm)}</span>`;
        } else {
            trimmedURL = highlightText(trimmedURL, searchTerm);
        }

        bookmarkURL.innerHTML = trimmedURL;
        bookmarkURLDiv.appendChild(bookmarkURL);
        cardDetailsSection.appendChild(bookmarkURLDiv);

        // Add folder tag if in grid view and we have folder information
        if (gridViewEnabled) {
            // Find the folder name for this bookmark
            let folderName = "";
            
            // First try to find folder name from allBookmarks array
            const bookmarkData = allBookmarks.find(b => b.bookmark.id === bookmarkNode.id);
            if (bookmarkData && bookmarkData.folder) {
                folderName = bookmarkData.folder;
            } else {
                // Fallback: find folder name from filterOptions using parentId
                const folderOption = filterOptions.find(option => option.value === bookmarkNode.parentId);
                if (folderOption) {
                    folderName = folderOption.label.replace(/^[-\s]+/, "");
                }
            }
            
            if (folderName) {
                const tagContainer = document.createElement("div");
                tagContainer.className = "flex-start w-full mt-1";
                
                const tagText = document.createElement("span");
                tagText.textContent = folderName;
                tagText.className = "flex-center w-fit h-5 px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-600 text-xs font-medium";
                
                tagContainer.appendChild(tagText);
                cardDetailsSection.appendChild(tagContainer);
            }
        }

        card.appendChild(cardDetailsSection);

        // Add screen reader support for bookmark cards
        const bookmarkTitle = bookmarkNode.title || "Untitled";
        let ariaLabel = bookmarkTitle;
        
        // Check if there's a tag (folder name) and include it in the aria-label
        if (folderName && folderName.trim()) {
            ariaLabel = `${folderName} - ${bookmarkTitle}`;
        }
        
        // Set aria-label for screen readers
        card.setAttribute('aria-label', ariaLabel);
        card.setAttribute('role', 'link');
        card.setAttribute('aria-describedby', `bookmark-url-${bookmarkNode.id}`);
        
        // Add hidden description for screen readers with URL
        const urlDescription = document.createElement('span');
        urlDescription.id = `bookmark-url-${bookmarkNode.id}`;
        urlDescription.className = 'sr-only';
        urlDescription.textContent = `URL: ${bookmarkNode.url}`;
        card.appendChild(urlDescription);

        return card;
    }

    // Event listeners for view toggle
    recentsViewButton.addEventListener("click", toggleView);
    folderViewButton.addEventListener("click", toggleView);

    // Filter functionality
    filterDropdown.addEventListener("change", function (e) {
        FILTER_ID = e.target.value == "all" ? 0 : e.target.value;
        const searchTerm = searchInput.value.trim().toLowerCase();
        updateFilterIcon();
        
        if (gridViewEnabled) {
            showGridView(searchTerm);
        } else {
            filterBookmarks(bookmarks, searchTerm);
        }
    });

    // Helper functions from the original code
    function containsSearchTerm(text, searchTerm) {
        if (!text || !searchTerm) return false;
        const searchTerms = searchTerm.toLowerCase().split(" ");
        return searchTerms.every((term) => text.toLowerCase().includes(term));
    }

    function highlightText(text, searchTerm) {
        if (!searchTerm || !text) return text;
        const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
        let highlightedText = text;
        searchWords.forEach(word => {
            const regex = new RegExp(`(${word})`, 'gi');
            highlightedText = highlightedText.replace(regex, 
                '<mark class="bg-yellow-200 dark:bg-yellow-600 dark:text-zinc-100 px-0.5 rounded-sm">$1</mark>'
            );
        });
        return highlightedText;
    }

    function getDynamicTitle(searchTerm, filterId, currentCount) {
        const hasSearch = searchTerm && searchTerm.trim().length > 0;
        const hasFilter = filterId && filterId !== 0 && filterId !== "all";
        
        let folderName = "";
        let folderPath = "";
        
        if (hasFilter) {
            const filterOption = filterOptions.find(option => option.value == filterId);
            if (filterOption) {
                folderName = filterOption.label.replace(/^[\s\-]*/, '');
                folderPath = folderName.includes('- ') ? 
                    folderName.replace(/\s*-\s*/g, ' > ') : 
                    folderName;
            }
        }
        
        if (hasSearch && hasFilter) {
            if (currentCount === 0) {
                return `No results for "${searchTerm}" in ${folderPath}`;
            }
            return `Results for "${searchTerm}" in ${folderPath} (${currentCount})`;
        } else if (hasSearch) {
            if (currentCount === 0) {
                return `No results for "${searchTerm}"`;
            }
            return `Results for "${searchTerm}" (${currentCount})`;
        } else if (hasFilter) {
            return `Folder: ${folderPath} (${currentCount})`;
        } else {
            return gridViewEnabled ? `Recent Bookmarks (${currentCount})` : `Bookmarks (${currentCount})`;
        }
    }

    function updateThumbnail(title, thumbnailUrl) {
        // Update thumbnail functionality - implement if needed
    }

    // Popup menu variables
    let currentPopupMenu = null;
    let currentBookmarkNode = null;

    function showPopupMenu(event, bookmarkNode) {
        if (currentPopupMenu) {
            currentPopupMenu.remove();
        }
        currentBookmarkNode = bookmarkNode;
        
        // Find the filter dropdown select element
        const folderDropdown = document.getElementById("folder-dropdown");

        // Create filter options for edit modal
        if (folderDropdown && folderDropdown.children.length === 0) {
            filterOptions.slice(1).forEach(function (option) {
                const filterOption = document.createElement("option");
                filterOption.value = option.value;
                filterOption.textContent = option.label;
                filterOption.selected = option.value === currentBookmarkNode.parentId;
                folderDropdown.appendChild(filterOption);
            });
        }

        // Check if a popup menu is already open and if the same button is clicked again
        if (currentPopupMenu && currentPopupMenu.previousElementSibling === event.target) {
            currentPopupMenu.remove();
            currentPopupMenu = null;
            return;
        }

        if (currentPopupMenu) {
            closePopupMenu();
            return;
        }

        const popupMenu = document.createElement("div");
        popupMenu.className = "absolute z-10 flex flex-col bg-zinc-800 w-44 h-32 rounded shadow-md text-zinc-100 hover:text-zinc-50 text-sm font-light flex-center flex-col";

        function createIconButton(text, iconSrc, buttonClassName, onClick) {
            const buttonContainer = document.createElement("div");
            buttonContainer.className = "flex-start w-full h-9 px-3 py-1.5 hover:bg-zinc-700 active:bg-zinc-700";
            const icon = document.createElement("img");
            icon.src = iconSrc;
            icon.alt = text;
            icon.className = "w-4 h-4 mr-3";
            buttonContainer.appendChild(icon);

            const button = document.createElement("button");
            button.textContent = text;
            button.className = buttonClassName || "flex-start text-left";
            button.addEventListener("click", onClick);
            buttonContainer.appendChild(button);

            return buttonContainer;
        }

        getThumbnailUrl(bookmarkNode.url, function (thumbnailUrl) {
            const buttonText = thumbnailUrl.startsWith("https://www.google.com/s2/favicons?domain=") 
                ? "Capture Thumbnail" 
                : "Recapture";

            const captureButton = createIconButton(
                buttonText,
                "assets/icons/camera.svg",
                null,
                function (event) {
                    event.preventDefault();
                    window.handleScreenshotCapture(bookmarkNode.url, bookmarkNode.title);
                    closePopupMenu();
                }
            );
            popupMenu.appendChild(captureButton);

            const editButton = createIconButton(
                "Edit",
                "assets/icons/edit.svg",
                null,
                function (event) {
                    closePopupMenu();
                    event.preventDefault();
                    openEditModal(bookmarkNode);
                }
            );
            popupMenu.appendChild(editButton);

            const deleteButton = createIconButton(
                "Delete",
                "assets/icons/trash.svg",
                "flex-grow text-left",
                function (event) {
                    event.preventDefault();
                    if (confirm("Are you sure you want to delete this bookmark?")) {
                        deleteBookmark(bookmarkNode);
                    }
                    closePopupMenu();
                }
            );
            popupMenu.appendChild(deleteButton);
        });

        // Position the popup menu relative to the clicked button
        const rect = event.target.getBoundingClientRect();
        popupMenu.style.top = `${rect.bottom + window.scrollY + 4}px`;
        popupMenu.style.right = `${window.innerWidth - rect.right - 4}px`;

        document.body.appendChild(popupMenu);
        currentPopupMenu = popupMenu;

        // Close the popup menu when clicking anywhere else on the screen
        function closePopupMenu() {
            if (currentPopupMenu) {
                currentPopupMenu.remove();
                currentPopupMenu = null;
                document.removeEventListener("click", closePopupMenu);
            }
        }
        document.addEventListener("click", closePopupMenu);

        // Prevent closing the popup menu when clicking on the same button again
        event.stopPropagation();
    }

    // Make functions available globally for keyboard shortcuts
    window.showPopupMenu = showPopupMenu;
    window.openEditModal = openEditModal;
    window.closeEditModal = closeEditModal;
    window.deleteBookmark = deleteBookmark;
    window.captureScreenshot = captureScreenshot;
    window.handleScreenshotCapture = handleScreenshotCapture;
    
    // Function to get bookmark data from a card element
    window.getBookmarkFromCard = function(cardElement) {
        const link = cardElement.querySelector('a');
        if (!link || !link.href) return null;
        
        // Get title from the bookmark title link element (inside the details section)
        let title = '';
        
        // Look for the bookmark title link specifically in the card details section
        const cardDetailsSection = cardElement.querySelector('.flex-center.h-24.flex-col');
        if (cardDetailsSection) {
            const bookmarkLinkElement = cardDetailsSection.querySelector('a[target="_blank"]');
            if (bookmarkLinkElement) {
                // Get just the text content, stripping any HTML highlighting
                title = bookmarkLinkElement.textContent.trim();
            }
        }
        
        // If we still don't have a title, try the aria-label fallback
        if (!title) {
            const ariaLabel = cardElement.getAttribute('aria-label') || '';
            if (ariaLabel.includes(' - ')) {
                // If aria-label contains folder name, extract just the title part
                // Format: "FolderName - BookmarkTitle"
                title = ariaLabel.split(' - ').slice(1).join(' - ').trim();
            } else {
                // No folder name in aria-label, use it as is
                title = ariaLabel.trim();
            }
        }
        
        const parentId = cardElement.getAttribute('data-parent-id');
        const bookmarkId = cardElement.getAttribute('data-bookmark-id');
        const bookmarkUrl = cardElement.getAttribute('data-bookmark-url');
        
        console.log('🔍 Extracting bookmark data from card:');
        console.log('  ID:', bookmarkId);
        console.log('  Title:', title);
        console.log('  URL:', bookmarkUrl);
        console.log('  Parent ID:', parentId);
        
        return {
            id: bookmarkId,
            title: title,
            url: bookmarkUrl,
            parentId: parentId
        };
    };

    function openEditModal(bookmarkNode) {
        const editModal = document.getElementById("edit-modal");
        const editTitleInput = document.getElementById("edit-title");
        const editUrlInput = document.getElementById("edit-url");
        const folderDropdown = document.getElementById("folder-dropdown");

        editTitleInput.value = bookmarkNode.title || "";
        editUrlInput.value = bookmarkNode.url || "";
        
        // Populate folder dropdown if not already populated
        if (folderDropdown && folderDropdown.children.length === 0) {
            console.log('📁 Populating folder dropdown...');
            filterOptions.slice(1).forEach(function (option) {
                const filterOption = document.createElement("option");
                filterOption.value = option.value;
                filterOption.textContent = option.label;
                folderDropdown.appendChild(filterOption);
            });
        }
        
        // Set the current folder as selected
        if (folderDropdown && bookmarkNode.parentId) {
            console.log('📂 Setting selected folder to:', bookmarkNode.parentId);
            folderDropdown.value = bookmarkNode.parentId;
            
            // If the value didn't set (option doesn't exist), log it
            if (folderDropdown.value !== bookmarkNode.parentId) {
                console.log('⚠️ Warning: Parent folder not found in dropdown options');
            }
        }
        
        // Store the current bookmark node for saving later
        window.currentBookmarkNode = bookmarkNode;

        // Store the element that had focus before opening the modal
        if (!window.lastFocusedElement) {
            window.lastFocusedElement = document.activeElement;
        }

        editModal.classList.remove("hidden");
        
        // Focus the first input field in the modal after a brief delay
        setTimeout(() => {
            const editTitleInput = document.getElementById("edit-title");
            if (editTitleInput) {
                editTitleInput.focus();
                editTitleInput.select(); // Select all text for easy editing
                console.log('🎯 Focused title input in edit modal');
            }
        }, 100);
    }

    function closeEditModal() {
        const editModal = document.getElementById("edit-modal");
        editModal.classList.add("hidden");
        
        // Restore focus to the element that was focused before opening the modal
        if (window.lastFocusedElement && document.contains(window.lastFocusedElement)) {
            setTimeout(() => {
                window.lastFocusedElement.focus();
                console.log('🎯 Restored focus to previous element');
                window.lastFocusedElement = null; // Clear the reference
            }, 100);
        } else {
            // Fallback: focus the first bookmark card if available
            setTimeout(() => {
                const firstCard = document.querySelector('.card');
                if (firstCard) {
                    firstCard.focus();
                    console.log('🎯 Focused first bookmark card as fallback');
                }
                window.lastFocusedElement = null;
            }, 100);
        }
    }

    function deleteBookmark(bookmarkNode) {
        const key = bookmarkNode.url;
        chrome.bookmarks.remove(bookmarkNode.id, function() {
            console.log(`Deleted bookmark: ${bookmarkNode.title}`);

            // Remove the corresponding thumbnail from local storage
            chrome.storage.local.remove([key], function() {
                // Remove from allBookmarks array
                allBookmarks = allBookmarks.filter(b => 
                    b.bookmark.id !== bookmarkNode.id
                );
                
                // Update sortedBookmarks
                sortedBookmarks = allBookmarks.sort((a, b) => {
                    const lastVisitedA = a.bookmark.dateLastUsed || a.bookmark.dateAdded;
                    const lastVisitedB = b.bookmark.dateLastUsed || b.bookmark.dateAdded;
                    return lastVisitedB - lastVisitedA;
                });

                // Get current search term
                const searchTerm = searchInput.value.trim().toLowerCase();

                // Refresh the current view without reloading
                if (gridViewEnabled) {
                    showGridView(searchTerm);
                } else {
                    // For folder view, get fresh bookmark tree
                    getCachedBookmarks().then(function(newBookmarks) {
                        // Reset the folder list
                        folderList.innerHTML = '';
                        filterBookmarks(newBookmarks, searchTerm);
                    });
                }
            });
        });
    }

    // Populate filter options and initialize
    function populateFilterOptions(bookmarks, level = 0, id = "") {
        if (bookmarks && bookmarks.length > 0) {
            bookmarks.forEach(function (bookmark) {
                if (bookmark.children) {
                    if (bookmark.title) {
                        filterOptions.push({
                            label: `${level > 0 ? "-".repeat(level - 1) + " " : ""}` + bookmark.title,
                            value: bookmark.id,
                            level: level,
                            id: id + "-" + bookmark.id + "-",
                        });
                    }
                    populateFilterOptions(bookmark.children, level + 1, id + "-" + bookmark.id);
                } else {
                    // Also add leaf bookmark parent IDs to prevent missing options
                    if (bookmark.parentId && !filterOptions.find(opt => opt.value === bookmark.parentId)) {
                        filterOptions.push({
                            label: `Unknown Folder (${bookmark.parentId})`,
                            value: bookmark.parentId,
                            level: 0,
                            id: `unknown-${bookmark.parentId}`,
                        });
                    }
                }
            });
        }
    }

    populateFilterOptions(bookmarks);

    // Create filter options
    filterOptions.forEach(function (option) {
        const filterOption = document.createElement("option");
        filterOption.value = option.value;
        filterOption.textContent = option.label;
        filterOption.className = "flex-center flex-col bg-zinc-100 w-44 h-32 rounded shadow-md text-zinc-800 text-sm font-normal cursor-pointer py-5";
        filterDropdown.appendChild(filterOption);
    });

    // Filter icon functionality
    function updateFilterIcon() {
        const filterSelect = document.getElementById('filter');
        const chevron = document.getElementById('filter-dropdown-arrow');
        const clearIcon = document.getElementById('filter-clear');
        
        if (filterSelect && chevron && clearIcon) {
            if (filterSelect.value && filterSelect.value !== 'all') {
                chevron.classList.add('hidden');
                clearIcon.classList.remove('hidden');
            } else {
                chevron.classList.remove('hidden');
                clearIcon.classList.add('hidden');
            }
        }
    }

    // Clear filter functionality
    setTimeout(() => {
        const filterSelect = document.getElementById('filter');
        const clearIcon = document.getElementById('filter-clear');
        
        updateFilterIcon();
        
        if (clearIcon) {
            clearIcon.addEventListener('click', function () {
                if (filterSelect) {
                    filterSelect.value = 'all';
                    FILTER_ID = 0;
                    updateFilterIcon();
                    
                    const searchTerm = searchInput.value.trim().toLowerCase();
                    if (gridViewEnabled) {
                        showGridView(searchTerm);
                    } else {
                        filterBookmarks(bookmarks, searchTerm);
                    }
                }
            });
        }
    }, 100);

    // Initialize with grid view
    showGridView("");

    // Edit modal event listeners
    const cancelEditButton = document.getElementById("cancel-edit");
    const saveEditButton = document.getElementById("save-edit");
    const editModal = document.getElementById("edit-modal");

    if (cancelEditButton) {
        cancelEditButton.addEventListener("click", function() {
            closeEditModal();
        });
    }

    if (saveEditButton) {
        saveEditButton.addEventListener("click", function() {
            if (currentBookmarkNode) {
                const editTitleInput = document.getElementById("edit-title");
                const editUrlInput = document.getElementById("edit-url");
                const folderDropdown = document.getElementById("folder-dropdown");
                
                const newTitle = editTitleInput.value.trim();
                const newUrl = editUrlInput.value.trim();
                const newParentId = folderDropdown.value;

                if (newTitle && newUrl) {
                    // Update bookmark title and URL
                    chrome.bookmarks.update(currentBookmarkNode.id, {
                        title: newTitle,
                        url: newUrl
                    }, function() {
                        // Move bookmark to new folder if needed
                        if (newParentId !== currentBookmarkNode.parentId) {
                            chrome.bookmarks.move(currentBookmarkNode.id, {
                                parentId: newParentId
                            }, function() {
                                closeEditModal();
                                // Refresh the current view
                                refreshCurrentView();
                            });
                        } else {
                            closeEditModal();
                            // Refresh the current view
                            refreshCurrentView();
                        }
                    });
                }
            }
        });
    }

    // Close modal when clicking outside
    if (editModal) {
        editModal.addEventListener("click", function(event) {
            if (event.target === editModal) {
                closeEditModal();
            }
        });
    }

    function refreshCurrentView() {
        // Get current search term
        const searchTerm = searchInput.value.trim().toLowerCase();
        
        // Clear cache to ensure fresh data and refresh bookmarks from Chrome API
        bookmarkCache = { data: null, timestamp: 0 };
        getCachedBookmarks().then(function(newBookmarks) {
            // Clear and repopulate allBookmarks
            allBookmarks = [];
            for (const node of newBookmarks[0].children) {
                collectBookmarks(node);
            }
            
            // Sort bookmarks
            sortedBookmarks = allBookmarks.sort((a, b) => {
                const lastVisitedA = a.bookmark.dateLastUsed || a.bookmark.dateAdded;
                const lastVisitedB = b.bookmark.dateLastUsed || b.bookmark.dateAdded;
                return lastVisitedB - lastVisitedA;
            });

            // Refresh current view
            if (gridViewEnabled) {
                showGridView(searchTerm);
            } else {
                filterBookmarks(newBookmarks, searchTerm);
            }
        });
    }

    // Helper functions for folder view
    function computeId(id) {
        const option = filterOptions.find((option) => option.value === id);
        if (!option) {
            // Silently return fallback ID for missing options to prevent console spam
            return `fallback-${id}`;
        }
        return option.id;
    }

    function countBookmarksRecursive(node, searchTerm) {
        let count = 0;
        if (node.children) {
            for (const child of node.children) {
                count += countBookmarksRecursive(child, searchTerm);
            }
        } else if (node.url) {
            const matchesSearch = !searchTerm ||
                containsSearchTerm(node.title, searchTerm) ||
                containsSearchTerm(node.url, searchTerm);
            if (matchesSearch) count++;
        }
        return count;
    }

    function getDynamicSectionTitle(folderNode, searchTerm, filterId) {
        const folderName = folderNode.title;
        const count = countBookmarksRecursive(folderNode, searchTerm);
        const hasSearch = searchTerm && searchTerm.trim().length > 0;
        const isFiltered = filterId && filterId !== 0 && filterId !== "all";
        if (count === 0) {
            return null;
        }
        if (hasSearch && isFiltered) {
            return `${folderName} - Results for "${searchTerm}" (${count})`;
        } else if (hasSearch) {
            return `${folderName} - Results for "${searchTerm}" (${count})`;
        } else if (isFiltered) {
            return `${folderName} (${count})`;
        } else {
            return `${folderName} (${count})`;
        }
    }

    function createFolderList(bookmarkNode, searchTerm, sublistContainerClass, sublistGridClass, sublistTitleClass) {
        const listItem = document.createElement("div");
        
        try {
            listItem.id = computeId(bookmarkNode.id);
        } catch (error) {
            console.error("Error computing ID for bookmark:", bookmarkNode.title, error);
            listItem.id = `fallback-${bookmarkNode.id}`;
        }
        
        listItem.className = sublistContainerClass || "flex-center flex-col m-auto gap-4";

        if (bookmarkNode.children && bookmarkNode.children.length > 0) {
            const sectionTitle = getDynamicSectionTitle(bookmarkNode, searchTerm, FILTER_ID);
            if (sectionTitle === null) {
                return null;
            }

            const folderTitle = document.createElement("h2");
            try {
                folderTitle.id = computeId(bookmarkNode.id);
            } catch (error) {
                console.error("Error computing ID for folder title:", bookmarkNode.title, error);
                folderTitle.id = `fallback-title-${bookmarkNode.id}`;
            }
            folderTitle.textContent = sectionTitle || "Untitled";
            folderTitle.className = sublistTitleClass || "container flex-start w-full text-semibold text-zinc-600 text-lg py-2 dark:text-zinc-200";

            const subList = document.createElement("div");
            subList.className = sublistGridClass || "all-sublist-container";

            const noFolderList = document.createElement("div");
            try {
                noFolderList.id = computeId(bookmarkNode.id);
            } catch (error) {
                console.error("Error computing ID for noFolderList:", error);
                noFolderList.id = `fallback-nofolder-${bookmarkNode.id}`;
            }
            noFolderList.className = "no-folder-list container my-6 gap-x-8 gap-y-6 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 w-full";

            let folders = [];
            for (const child of bookmarkNode.children) {
                if (child.children) {
                    const subFolderList = createFolderList(
                        child,
                        searchTerm,
                        "sublist-container container w-full flex-center flex-col gap-3",
                        "",
                        "sublist-title container flex-start w-full text-semibold text-zinc-600 dark:text-zinc-300 text-lg py-2"
                    );
                    if (subFolderList) {
                        folders.push(subFolderList);
                    }
                } else if (child.url) {
                    const matchesSearch = !searchTerm ||
                        containsSearchTerm(child.title, searchTerm) ||
                        containsSearchTerm(child.url, searchTerm);
                    if (matchesSearch) {
                        const bookmarkListItem = createBookmarkCard(child, searchTerm, bookmarkNode.title);
                        noFolderList.appendChild(bookmarkListItem);
                    }
                }
            }
            subList.appendChild(folderTitle);
            subList.appendChild(noFolderList);
            folders.forEach((folder) => {
                subList.appendChild(folder);
            });

            listItem.appendChild(subList);
            return listItem;
        }
        return null;
    }

    // Folder view function
    function filterBookmarks(bookmarks, searchTerm) {
        folderList.innerHTML = "";
        let totalCount = 0;
        let folderItems = [];
        
        if (bookmarks && bookmarks.length > 0) {
            const rootBookmark = bookmarks[0];
            
            // If a filter is applied, show bookmarks directly under that folder and subfolders as sections
            if (FILTER_ID && FILTER_ID !== 0 && FILTER_ID !== "all") {
                function findFolderById(node, id) {
                    if (node.id === id) return node;
                    if (node.children) {
                        for (const child of node.children) {
                            const found = findFolderById(child, id);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                
                const filteredFolder = findFolderById(rootBookmark, FILTER_ID);
                if (filteredFolder) {
                    totalCount = countBookmarksRecursive(filteredFolder, searchTerm);
                    
                    const mainTitle = document.createElement("h1");
                    mainTitle.textContent = getDynamicTitle(searchTerm, FILTER_ID, totalCount);
                    mainTitle.className = "flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50";
                    folderList.appendChild(mainTitle);

                    const bookmarksGrid = document.createElement("div");
                    bookmarksGrid.className = "no-folder-list container my-6 gap-x-8 gap-y-6 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 w-full";
                    bookmarksGrid.id = `no-folder-list-${FILTER_ID}`;
                    let hasDirectBookmarks = false;
                    
                    if (filteredFolder.children) {
                        for (const child of filteredFolder.children) {
                            if (!child.children && child.url) {
                                const matchesSearch = !searchTerm ||
                                    containsSearchTerm(child.title, searchTerm) ||
                                    containsSearchTerm(child.url, searchTerm);
                                if (matchesSearch) {
                                    const bookmarkListItem = createBookmarkCard(child, searchTerm, bookmarkNode.title);
                                    bookmarksGrid.appendChild(bookmarkListItem);
                                    hasDirectBookmarks = true;
                                }
                            }
                        }
                    }
                    
                    folderList.appendChild(bookmarksGrid);

                    if (filteredFolder.children) {
                        for (const child of filteredFolder.children) {
                            if (child.children) {
                                const folderListItem = createFolderList(child, searchTerm);
                                if (folderListItem) {
                                    folderList.appendChild(folderListItem);
                                }
                            }
                        }
                    }
                    
                    if (totalCount === 0) {
                        const noResultsMessage = document.createElement("p");
                        noResultsMessage.textContent = searchTerm ?
                            `No bookmarks found matching "${searchTerm}"` :
                            "No bookmarks found.";
                        noResultsMessage.className = "text-zinc-500 dark:text-zinc-400 mt-4";
                        folderList.appendChild(noResultsMessage);
                    }
                    return;
                }
            }
            
            // Default: show all folders at root
            const rootChildren = rootBookmark.children || [];
            rootChildren.forEach(function (child) {
                if (child.children) {
                    const folderListItem = createFolderList(child, searchTerm);
                    if (folderListItem) {
                        folderItems.push(folderListItem);
                        const itemCount = countBookmarksRecursive(child, searchTerm);
                        totalCount += itemCount;
                    }
                }
            });
        }
        
        // Create dynamic title with actual count
        const mainTitle = document.createElement("h1");
        mainTitle.textContent = getDynamicTitle(searchTerm, FILTER_ID, totalCount);
        mainTitle.className = "flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50";
        folderList.appendChild(mainTitle);
        
        // Add folder items to DOM
        folderItems.forEach(item => {
            folderList.appendChild(item);
        });
        
        // Update bookmark cards for keyboard navigation
        if (window.updateBookmarkCards) {
            window.updateBookmarkCards();
        }
        
        if (totalCount === 0) {
            const noResultsMessage = document.createElement("p");
            noResultsMessage.textContent = searchTerm ?
                `No bookmarks found matching "${searchTerm}"` :
                "No bookmark folders found.";
            noResultsMessage.className = "text-zinc-500 dark:text-zinc-400 mt-4";
            folderList.appendChild(noResultsMessage);
        }
    }
});

// ============================
// KEYBOARD SHORTCUTS MODULE
// ============================

console.log('Keyboard shortcuts integrated into main.js');

// Function to trigger save changes directly
function triggerSaveChanges() {
    console.log('💾 Triggering save changes...');
    
    // Get the current bookmark node and form values
    const currentBookmarkNode = window.currentBookmarkNode;
    if (!currentBookmarkNode) {
        console.error('❌ No current bookmark node found');
        return;
    }
    
    const editTitleInput = document.getElementById("edit-title");
    const editUrlInput = document.getElementById("edit-url");
    const folderDropdown = document.getElementById("folder-dropdown");
    
    if (!editTitleInput || !editUrlInput || !folderDropdown) {
        console.error('❌ Edit modal inputs not found');
        return;
    }
    
    const newTitle = editTitleInput.value.trim();
    const newUrl = editUrlInput.value.trim();
    const newParentId = folderDropdown.value;
    
    if (!newTitle || !newUrl) {
        console.log('❌ Title or URL is empty');
        return;
    }
    
    console.log('📝 Saving bookmark:', { newTitle, newUrl, newParentId });
    
    // Update bookmark title and URL
    chrome.bookmarks.update(currentBookmarkNode.id, {
        title: newTitle,
        url: newUrl
    }, function() {
        console.log('✅ Updated bookmark title and URL');
        
        // Move bookmark to new folder if needed
        if (newParentId !== currentBookmarkNode.parentId) {
            chrome.bookmarks.move(currentBookmarkNode.id, {
                parentId: newParentId
            }, function() {
                console.log('✅ Moved bookmark to new folder');
                finalizeSave();
            });
        } else {
            finalizeSave();
        }
    });
    
    function finalizeSave() {
        console.log('✅ Save completed, closing modal');
        // Close the modal using the global function
        if (window.closeEditModal) {
            window.closeEditModal();
        } else {
            const editModal = document.getElementById("edit-modal");
            if (editModal) {
                editModal.classList.add("hidden");
            }
        }
        
        // Refresh the bookmark display
        if (window.updateBookmarkCards) {
            window.updateBookmarkCards();
        }
        
        // Reload bookmarks to reflect changes
        setTimeout(() => {
            location.reload();
        }, 500);
    }
}

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
        
        // Call openEditModal directly with the bookmark data
        window.openEditModal(bookmarkData);
        console.log('📝 Edit modal function called');
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
    if (bookmarkData && confirm(`Are you sure you want to delete the bookmark "${bookmarkData.title}"?`)) {
        console.log('✅ Confirmed deletion of bookmark:', bookmarkData.title);
        
        // Find next card to focus on BEFORE deletion
        const allCards = Array.from(document.querySelectorAll('.card'));
        const currentIndex = allCards.indexOf(cardElement);
        const nextCard = allCards[currentIndex + 1] || allCards[currentIndex - 1];
        
        console.log('📍 Current card index:', currentIndex, 'Next card found:', !!nextCard);
        
        // Remove focus styling from current card before deletion
        highlightFocusedCard(null);
        
        // Call deleteBookmark directly with the bookmark data
        window.deleteBookmark(bookmarkData);
        console.log('🗑️ Delete function called for bookmark');
        
        // Focus and highlight next card after deletion
        setTimeout(() => {
            // Refresh the bookmark cards array after deletion
            if (window.updateBookmarkCards) {
                window.updateBookmarkCards();
            }
            
            // Find the new card to focus (since DOM has changed)
            const updatedCards = Array.from(document.querySelectorAll('.card'));
            let cardToFocus = null;
            
            if (nextCard && document.contains(nextCard)) {
                // If the next card still exists, focus it
                cardToFocus = nextCard;
            } else if (updatedCards.length > 0) {
                // Otherwise, focus the card at the same index or the last one
                const targetIndex = Math.min(currentIndex, updatedCards.length - 1);
                cardToFocus = updatedCards[targetIndex];
            }
            
            if (cardToFocus) {
                cardToFocus.focus();
                highlightFocusedCard(cardToFocus);
                console.log('🎯 Focused and highlighted card after deletion:', cardToFocus.querySelector('h3')?.textContent || 'Unknown title');
            } else {
                console.log('❌ No card available to focus after deletion');
            }
        }, 300); // Increased delay to allow for DOM updates after deletion
    } else if (bookmarkData) {
        console.log('❌ User cancelled deletion');
    } else {
        console.error('❌ Could not extract bookmark data from card');
    }
}

function triggerCaptureAction(cardElement) {
    console.log('📸 Triggering capture action for card:', cardElement);
    
    if (!window.getBookmarkFromCard || !window.handleScreenshotCapture) {
        console.error('Required functions not available');
        return;
    }
    
    const bookmarkData = window.getBookmarkFromCard(cardElement);
    if (bookmarkData) {
        console.log('✅ Using centralized capture for:', bookmarkData.title, 'URL:', bookmarkData.url);
        window.handleScreenshotCapture(bookmarkData.url, bookmarkData.title, cardElement);
    } else {
        console.error('❌ Could not extract bookmark data from card');
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
    
    // Highlight the focused card (if provided)
    if (cardElement) {
        cardElement.style.outline = '3px solid #3b82f6';
        cardElement.style.boxShadow = '0 0 0 1px #3b82f6';
        console.log('🎯 Highlighted focused card:', cardElement.querySelector('h3')?.textContent || 'Unknown title');
    } else {
        console.log('🔄 Cleared all card highlights');
    }
}

// Tab navigation order and arrow key navigation for bookmark cards
let currentBookmarkIndex = -1;
let bookmarkCards = [];
let currentMenuIndex = -1;
let menuItems = [];

// Update bookmark cards array when DOM changes (enhanced version)
function updateBookmarkCardsEnhanced() {
    bookmarkCards = Array.from(document.querySelectorAll('.card'));
    console.log('🔄 Updated bookmark cards array:', bookmarkCards.length, 'cards found');
    // Add tabindex to bookmark cards for keyboard navigation
    bookmarkCards.forEach((card, index) => {
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-bookmark-index', index);
    });
}

// Override the existing updateBookmarkCards with the enhanced version
window.updateBookmarkCards = updateBookmarkCardsEnhanced;

// Navigation and menu functions
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

// Function to handle arrow key navigation within bookmark cards
function handleBookmarkNavigation(event) {
    console.log('🧭 handleBookmarkNavigation called with key:', event.key);
    
    if (bookmarkCards.length === 0) {
        console.log('❌ No bookmark cards found');
        return false;
    }
    
    const focusedElement = document.activeElement;
    console.log('🎯 Currently focused element:', focusedElement.tagName, 'Classes:', focusedElement.className);
    
    const isBookmarkFocused = focusedElement.classList.contains('card');
    console.log('📋 Is bookmark card focused?', isBookmarkFocused);
    
    if (!isBookmarkFocused) {
        console.log('❌ Not focused on a bookmark card, skipping navigation');
        return false;
    }
    
    // Find the immediate parent container that holds this card
    // Look for grid containers or section containers
    let parentContainer = null;
    
    // First try to find the grid container (for grid view)
    parentContainer = focusedElement.closest('[class*="grid-cols"]'); // This will match grid-cols-2, grid-cols-3, etc.
    
    if (!parentContainer) {
        // Try other grid patterns
        parentContainer = focusedElement.closest('[class*="grid"]');
    }
    
    if (!parentContainer) {
        // Fallback for folder view: find the section container
        parentContainer = focusedElement.closest('#folder-list > *');
    }
    
    if (!parentContainer) {
        // Last resort: use the folder-list itself
        parentContainer = document.getElementById('folder-list');
    }

    if (!parentContainer) {
        console.log('❌ Could not find parent container for navigation');
        return false;
    }
    
    console.log('🎯 Found parent container:', parentContainer.className);

    // Get cards only from current container (section or subfolder)
    const containerCards = Array.from(parentContainer.querySelectorAll('.card'));
    const currentContainerIndex = containerCards.indexOf(focusedElement);

    if (currentContainerIndex === -1) {
        console.log('❌ Current card not found in container');
        return false;
    }
    
    console.log('📍 Current card index:', currentContainerIndex, 'of', containerCards.length, 'cards');

    let newContainerIndex = currentContainerIndex;
    
    // Calculate grid dimensions for current container
    const containerWidth = parentContainer.offsetWidth;
    const cardWidth = 240; // min-w-60 = 240px
    let cardsPerRow = Math.max(1, Math.floor(containerWidth / cardWidth));
    
    // For CSS grid containers, try to get the actual column count from computed styles
    if (parentContainer.classList.contains('grid') || parentContainer.className.includes('grid-cols')) {
        const computedStyle = window.getComputedStyle(parentContainer);
        const gridTemplateColumns = computedStyle.gridTemplateColumns;
        if (gridTemplateColumns && gridTemplateColumns !== 'none') {
            // Count the number of columns in the grid
            const columnCount = gridTemplateColumns.split(' ').length;
            if (columnCount > 0) {
                cardsPerRow = columnCount;
                console.log('📊 Detected CSS grid with', cardsPerRow, 'columns');
            }
        }
    }
    
    console.log('📏 Container width:', containerWidth, 'Card width:', cardWidth, 'Cards per row:', cardsPerRow);
    
    switch(event.key) {
        case 'ArrowRight':
            newContainerIndex = (currentContainerIndex + 1) % containerCards.length;
            console.log('➡️ Moving right from', currentContainerIndex, 'to', newContainerIndex);
            break;
        case 'ArrowLeft':
            newContainerIndex = currentContainerIndex === 0 ? containerCards.length - 1 : currentContainerIndex - 1;
            console.log('⬅️ Moving left from', currentContainerIndex, 'to', newContainerIndex);
            break;
        case 'ArrowDown':
            newContainerIndex = Math.min(currentContainerIndex + cardsPerRow, containerCards.length - 1);
            console.log('⬇️ Moving down from', currentContainerIndex, 'to', newContainerIndex, '(+' + cardsPerRow + ')');
            break;
        case 'ArrowUp':
            newContainerIndex = Math.max(currentContainerIndex - cardsPerRow, 0);
            console.log('⬆️ Moving up from', currentContainerIndex, 'to', newContainerIndex, '(-' + cardsPerRow + ')');
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
    
    // Check if settings modal is open
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal && !settingsModal.classList.contains('hidden')) {
        return handleSettingsModalTabNavigation(event);
    }
    
    // Check if edit modal is open
    const editModal = document.getElementById('edit-modal');
    if (editModal && !editModal.classList.contains('hidden')) {
        return handleEditModalTabNavigation(event);
    }
    
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
        highlightFocusedCard(nextElement);
    } else {
        // If focusing a non-card element, clear any manual highlights from cards
        highlightFocusedCard(null);
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

// Function to handle tab navigation within edit modal
function handleEditModalTabNavigation(event) {
    console.log('🔄 Edit modal tab navigation');
    
    // Define the tab order for edit modal elements
    const modalElements = [
        document.getElementById('edit-title'),
        document.getElementById('edit-url'),
        document.getElementById('folder-dropdown'),
        document.getElementById('cancel-edit'),
        document.getElementById('save-edit')
    ].filter(el => el && !el.disabled && !el.hidden);
    
    console.log('📋 Modal elements found:', modalElements.length);
    
    if (modalElements.length === 0) {
        console.log('❌ No focusable elements found in modal');
        return false;
    }
    
    const currentElement = document.activeElement;
    let currentIndex = modalElements.indexOf(currentElement);
    
    console.log('🎯 Current element index:', currentIndex, 'Element:', currentElement.id || currentElement.tagName);
    
    let nextIndex;
    if (event.shiftKey) {
        // Shift+Tab - go backwards
        nextIndex = currentIndex <= 0 ? modalElements.length - 1 : currentIndex - 1;
        console.log('⬅️ Shift+Tab: moving to index', nextIndex);
    } else {
        // Tab - go forwards
        nextIndex = (currentIndex + 1) % modalElements.length;
        console.log('➡️ Tab: moving to index', nextIndex);
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    const nextElement = modalElements[nextIndex];
    if (nextElement) {
        nextElement.focus();
        console.log('✅ Focused element:', nextElement.id || nextElement.tagName);
    }
    
    return true;
}

// Function to handle tab navigation within settings modal
function handleSettingsModalTabNavigation(event) {
    console.log('🔄 Settings modal tab navigation');
    
    // Define the tab order for settings modal elements: Auto → Light → Dark → Feedback → Buy me coffee
    const modalElements = [
        document.querySelector('button[data-theme="auto"]'),
        document.querySelector('button[data-theme="light"]'),
        document.querySelector('button[data-theme="dark"]'),
        document.querySelector('a[href="https://tally.so/r/n0xjLP"]'), // Feedback link
        document.querySelector('a[href="https://www.buymeacoffee.com/snmbala"]') // Buy coffee link
    ].filter(el => el && !el.disabled && !el.hidden);
    
    console.log('⚙️ Settings modal elements found:', modalElements.length);
    
    if (modalElements.length === 0) {
        console.log('❌ No focusable elements found in settings modal');
        return false;
    }
    
    const currentElement = document.activeElement;
    let currentIndex = modalElements.indexOf(currentElement);
    
    console.log('🎯 Current settings element index:', currentIndex, 'Element:', currentElement.textContent || currentElement.tagName);
    
    let nextIndex;
    if (event.shiftKey) {
        // Shift+Tab - go backwards
        nextIndex = currentIndex <= 0 ? modalElements.length - 1 : currentIndex - 1;
        console.log('⬅️ Shift+Tab: moving to index', nextIndex);
    } else {
        // Tab - go forwards
        nextIndex = (currentIndex + 1) % modalElements.length;
        console.log('➡️ Tab: moving to index', nextIndex);
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    const nextElement = modalElements[nextIndex];
    if (nextElement) {
        nextElement.focus();
        console.log('✅ Focused settings element:', nextElement.textContent || nextElement.tagName);
    }
    
    return true;
}

// Setup keyboard event listeners
function setupKeyboardListeners() {
    console.log('Setting up integrated keyboard event listeners...');
    
    document.addEventListener("keydown", function (event) {
        console.log('Key pressed:', event.key, 'Target:', event.target.tagName, 'ID:', event.target.id, 'Classes:', event.target.className);
    
        // Handle Enter key in edit modal to save changes
        const editModal = document.getElementById('edit-modal');
        if (editModal && !editModal.classList.contains('hidden') && event.key === 'Enter') {
            // If Enter is pressed on input fields or save button in edit modal, save changes
            if (event.target.id === 'edit-title' || 
                event.target.id === 'edit-url' || 
                event.target.id === 'save-edit') {
                console.log('💾 Enter key pressed in edit modal - saving changes');
                event.preventDefault();
                event.stopPropagation();
                
                // Directly trigger the save functionality
                triggerSaveChanges();
                return;
            }
        }
    
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
    } else {
        console.log('🔍 Active element is not a card. Element:', focusedElement.tagName, 'Classes:', focusedElement.className);
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
        
        // Close edit modal if open (highest priority)
        const editModal = document.getElementById("edit-modal");
        if (editModal && !editModal.classList.contains("hidden")) {
            // Use the existing closeEditModal function which handles focus restoration
            if (window.closeEditModal) {
                window.closeEditModal();
            } else {
                editModal.classList.add("hidden");
                // Restore focus to previous element
                if (window.lastFocusedElement && document.contains(window.lastFocusedElement)) {
                    window.lastFocusedElement.focus();
                    window.lastFocusedElement = null;
                }
            }
            console.log('Closed edit modal');
            return;
        }
        
        // Close settings modal if open (second priority)
        const settingsModal = document.getElementById("settings-modal");
        if (settingsModal && !settingsModal.classList.contains("hidden")) {
            settingsModal.classList.add("hidden");
            // Restore focus to settings button
            const settingsButton = document.getElementById("settings-btn");
            if (settingsButton) {
                settingsButton.focus();
                console.log('🎯 Restored focus to settings button');
            }
            console.log('Closed settings modal');
            return;
        }
        
        // Close menu if open
        if (menuItems.length > 0) {
            closeMenu();
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

// Initialize keyboard shortcuts when DOM is ready
function initializeKeyboardShortcuts() {
    console.log('Initializing integrated keyboard shortcuts...');
    
    // Set up keyboard listeners
    setupKeyboardListeners();
    
    // Set up DOM observer for dynamic content
    const observer = new MutationObserver(() => {
        updateBookmarkCardsEnhanced();
    });
    
    const folderList = document.getElementById('folder-list');
    if (folderList) {
        observer.observe(folderList, { childList: true, subtree: true });
        console.log('DOM observer set up for folder-list');
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeKeyboardShortcuts);
} else {
    // DOM already loaded, initialize immediately
    setTimeout(initializeKeyboardShortcuts, 100);
}
