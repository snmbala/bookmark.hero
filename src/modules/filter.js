// Filter functionality
export function populateFilterOptions(bookmarks, level = 0, id = "") {
    const filterOptions = [];
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
                filterOptions.push(...populateFilterOptions(bookmark.children, level + 1, id + "-" + bookmark.id));
            }
        });
    }
    return filterOptions;
}

export function initializeFilterDropdown(filterDropdown, filterOptions, onFilterChange) {
    filterOptions.forEach(function (option) {
        const filterOption = document.createElement("option");
        filterOption.value = option.value;
        filterOption.textContent = option.label;
        filterOption.className = "flex-center flex-col bg-zinc-100 w-44 h-32 rounded shadow-md text-zinc-800 text-sm font-normal cursor-pointer py-5";
        filterDropdown.appendChild(filterOption);
    });

    filterDropdown.addEventListener("change", onFilterChange);
}

export function updateFilterIcon() {
    const filterSelect = document.getElementById('filter');
    const chevron = document.getElementById('filter-dropdown-arrow');
    const clearIcon = document.getElementById('filter-clear');
    
    console.log("updateFilterIcon called - filter value:", filterSelect?.value);
    console.log("Elements found:", { filterSelect: !!filterSelect, chevron: !!chevron, clearIcon: !!clearIcon });
    
    if (filterSelect && chevron && clearIcon) {
        if (filterSelect.value && filterSelect.value !== 'all') {
            chevron.classList.add('hidden');
            clearIcon.classList.remove('hidden');
            console.log("Clear icon shown, chevron hidden");
        } else {
            chevron.classList.remove('hidden');
            clearIcon.classList.add('hidden');
            console.log("Chevron shown, clear icon hidden");
        }
    } else {
        console.warn("Missing elements for updateFilterIcon:", {
            filterSelect: !!filterSelect,
            chevron: !!chevron,
            clearIcon: !!clearIcon
        });
    }
}

export function initializeFilterClear(onClearFilter) {
    setTimeout(() => {
        const filterSelect = document.getElementById('filter');
        const clearIcon = document.getElementById('filter-clear');
        
        updateFilterIcon();
        console.log("Initial filter icon state set");
        
        if (clearIcon) {
            clearIcon.addEventListener('click', function () {
                console.log("Clear icon clicked");
                if (filterSelect) {
                    filterSelect.value = 'all';
                    onClearFilter();
                    updateFilterIcon();
                }
            });
        }
    }, 100);
}

export function populateFilterDropdown(bookmarkTreeNodes) {
    const filterSelect = document.getElementById('filter');
    if (!filterSelect) return [];
    
    const filterOptions = [{ value: 0, label: 'All Bookmarks', id: 'all-bookmarks' }];
    
    function traverseBookmarks(nodes, prefix = '') {
        nodes.forEach(node => {
            if (node.children) {
                // Skip root folders that are usually empty or system folders
                if (node.title && node.title !== 'Bookmarks Bar' && node.title !== 'Other Bookmarks' && node.title !== 'Mobile Bookmarks') {
                    const displayName = prefix ? `${prefix} - ${node.title}` : node.title;
                    const id = `folder-${node.id}`;
                    filterOptions.push({ value: node.id, label: displayName, id: id });
                    
                    // Recursively add child folders
                    traverseBookmarks(node.children, displayName);
                } else {
                    // For root folders, process children without adding the folder itself
                    traverseBookmarks(node.children, prefix);
                }
            }
        });
    }
    
    traverseBookmarks(bookmarkTreeNodes);
    
    // Clear existing options
    filterSelect.innerHTML = '';
    
    // Add options to select
    filterOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        filterSelect.appendChild(optionElement);
    });
    
    return filterOptions;
}

export function updateClearFilterButton(filterId) {
    const clearFilterBtn = document.getElementById('filter-clear');
    if (clearFilterBtn) {
        if (filterId && filterId !== 0 && filterId !== "all") {
            clearFilterBtn.style.display = 'inline-flex';
        } else {
            clearFilterBtn.style.display = 'none';
        }
    }
}
