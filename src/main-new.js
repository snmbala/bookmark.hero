// Import all modules
import { initializeTheme, updateSettingsIconColor } from './modules/theme.js';
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

    // Initialize theme handlers
    initializeTheme();
    
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
            if (gridViewEnabled) {
                showGridView(searchTerm);
            } else {
                filterBookmarks(bookmarks, searchTerm);
            }
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

    document.addEventListener("keydown", function (event) {
        if (event.key === "/" && document.activeElement !== searchInput) {
            event.preventDefault();
            searchInput.focus();
        }
        if (event.key === "Escape" && document.activeElement === searchInput) {
            searchInput.blur();
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
        
        // Create dynamic title with H1 for consistency
        const mainTitle = document.createElement("h1");
        mainTitle.textContent = getDynamicTitle(searchTerm, FILTER_ID, filteredBookmarks.length);
        mainTitle.className = "flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50";
        
        const gridContainer = document.createElement("div");
        gridContainer.className = "w-fit";
        folderList.appendChild(gridContainer);
        const grid = document.createElement("div");
        grid.className = "container mx-auto grid my-6 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 gap-8";
        gridContainer.appendChild(mainTitle);
        gridContainer.appendChild(grid);
        
        // Display bookmarks in a single 4-column grid
        filteredBookmarks.forEach((bookmark) => {
            if (!bookmark.children) {
                const bookmarkItem = createBookmarkCard(bookmark.bookmark, searchTerm);
                grid.appendChild(bookmarkItem);
            }
        });
        
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
    function createBookmarkCard(bookmarkNode, searchTerm) {
        const card = document.createElement("div");
        card.className = "relative card min-w-60 flex flex-col border-[1.5px] bg-white border-zinc-200; dark:border-zinc-700 hover:border-indigo-500 hover:shadow-md hover:shadow-indigo-100 dark:hover:shadow-indigo-700 rounded-md overflow-hidden";

        const closeButton = document.createElement("button");
        closeButton.className = "absolute top-0 right-0 m-1 p-1 bg-zinc-500 hover:bg-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-800 rounded-full border-none cursor-pointer close-button";
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
                    captureScreenshot(bookmarkNode.url, bookmarkNode.title);
                    cardThumbnailSection.removeChild(captureButton);
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
        card.appendChild(cardDetailsSection);

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

    function showPopupMenu(event, bookmarkNode) {
        // Create and show popup menu - implement if needed  
        console.log("Show popup menu for:", bookmarkNode.title);
    }

    // Populate filter options and initialize
    function populateFilterOptions(bookmarks, level = 0, id = "") {
        if (bookmarks && bookmarks.length > 0) {
            bookmarks.forEach(function (bookmark) {
                if (bookmark.children) {
                    if (bookmark.title)
                        filterOptions.push({
                            label: `${level > 0 ? "-".repeat(level - 1) + " " : ""}` + bookmark.title,
                            value: bookmark.id,
                            level: level,
                            id: id + "-" + bookmark.id + "-",
                        });
                    populateFilterOptions(bookmark.children, level + 1, id + "-" + bookmark.id);
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

    // Placeholder for filterBookmarks function (folder view)
    function filterBookmarks(bookmarks, searchTerm) {
        // This would contain the folder view logic from the original
        // For now, just show a placeholder
        folderList.innerHTML = "<h1 class='flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50'>Folder view - Coming soon</h1>";
    }
});
