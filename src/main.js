// Import all modules
import { initializeThemeToggle, updateSettingsIconColor } from './modules/theme.js';
import { populateFilterDropdown, updateClearFilterButton } from './modules/filter.js';
import { captureScreenshot, getThumbnailUrl } from './modules/thumbnail.js';

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

    // Performance optimization: Debounce function
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
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
        card.className = "relative card min-w-60 flex flex-col border-[1.5px] bg-white border-zinc-200; dark:border-zinc-700 hover:border-indigo-500 hover:shadow-md hover:shadow-indigo-100 dark:hover:shadow-indigo-700 rounded-md overflow-hidden";
        card.setAttribute('tabindex', '0');
        // Add parent ID as data attribute for keyboard navigation
        card.setAttribute('data-parent-id', bookmarkNode.parentId || '1');

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
                    captureScreenshot(bookmarkNode.url, bookmarkNode.title, function(url, newThumbnailUrl) {
                        // Update the thumbnail image directly
                        thumbnailImg.src = newThumbnailUrl;
                        // Remove the capture button since we now have a thumbnail
                        if (captureButton.parentNode) {
                            captureButton.parentNode.removeChild(captureButton);
                        }
                    });
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
                    captureScreenshot(bookmarkNode.url, bookmarkNode.title, function(url, newThumbnailUrl) {
                        // Find and update the thumbnail image for this bookmark
                        const bookmarkCards = document.querySelectorAll('.card');
                        bookmarkCards.forEach(card => {
                            const cardLink = card.querySelector('a[href="' + bookmarkNode.url + '"]');
                            if (cardLink) {
                                const thumbnailImg = card.querySelector('img[alt="' + bookmarkNode.url + '"]');
                                if (thumbnailImg) {
                                    thumbnailImg.src = newThumbnailUrl;
                                }
                                // Remove capture button if it exists
                                const captureBtn = card.querySelector('#capture-' + bookmarkNode.url);
                                if (captureBtn && captureBtn.parentNode) {
                                    captureBtn.parentNode.removeChild(captureBtn);
                                }
                            }
                        });
                    });
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
    window.deleteBookmark = deleteBookmark;
    window.captureScreenshot = captureScreenshot;
    
    // Function to get bookmark data from a card element
    window.getBookmarkFromCard = function(cardElement) {
        const link = cardElement.querySelector('a');
        if (!link || !link.href) return null;
        
        // Get title from the h3 element or fallback to aria-label
        let title = '';
        const titleElement = cardElement.querySelector('h3');
        if (titleElement) {
            title = titleElement.textContent.trim();
        } else {
            // Fallback to aria-label which should contain the title
            title = cardElement.getAttribute('aria-label') || '';
        }
        
        const parentId = cardElement.getAttribute('data-parent-id');
        
        console.log('🔍 Extracting bookmark data from card:');
        console.log('  Title:', title);
        console.log('  URL:', link.href);
        console.log('  Parent ID:', parentId);
        
        return {
            id: link.href, // Using href as ID for now
            title: title,
            url: link.href,
            parentId: parentId || '1'
        };
    };

    function openEditModal(bookmarkNode) {
        const editModal = document.getElementById("edit-modal");
        const editTitleInput = document.getElementById("edit-title");
        const editUrlInput = document.getElementById("edit-url");

        editTitleInput.value = bookmarkNode.title || "";
        editUrlInput.value = bookmarkNode.url || "";

        editModal.classList.remove("hidden");
    }

    function closeEditModal() {
        const editModal = document.getElementById("edit-modal");
        editModal.classList.add("hidden");
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
