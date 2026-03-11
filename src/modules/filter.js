// Filter functionality — custom checkbox dropdown

// Builds the folder options list and populates the checkbox panel.
// onToggle(id, checked) — called whenever a checkbox is toggled
// getActiveIds() — returns the current Set of active folder id strings
export function populateFilterDropdown(bookmarkTreeNodes, onToggle, getActiveIds) {
    const panel = document.getElementById('filter-panel');
    const filterOptions = [{ value: 'all', label: 'All Bookmarks', id: 'all-bookmarks', depth: 0 }];

    const SYSTEM_ROOTS_LC = new Set(['bookmarks bar', 'other bookmarks', 'mobile bookmarks']);
    const isSystemRoot = title => SYSTEM_ROOTS_LC.has((title || '').toLowerCase());

    function countBookmarks(node) {
        if (node.url) return 1;
        return (node.children || []).reduce((sum, child) => sum + countBookmarks(child), 0);
    }

    function traverseBookmarks(nodes, depth = 0) {
        nodes.forEach(node => {
            if (node.children) {
                if (node.title && !isSystemRoot(node.title)) {
                    const count = (node.children || []).reduce((sum, child) => sum + countBookmarks(child), 0);
                    filterOptions.push({ value: node.id, label: node.title, depth, count, id: `folder-${node.id}` });
                    traverseBookmarks(node.children, depth + 1);
                } else {
                    // System root — enter but don't add
                    traverseBookmarks(node.children, depth);
                }
            }
        });
    }

    traverseBookmarks(bookmarkTreeNodes);

    if (!panel) return filterOptions;

    panel.innerHTML = '';

    const TICK_SVG = `<svg width="9" height="7" viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 3L3.5 5.5L8 1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    filterOptions.slice(1).forEach(option => {
        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 pr-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer select-none';
        // Indent based on depth: 12px base + 14px per level
        item.style.paddingLeft = `${12 + option.depth * 14}px`;

        // Hidden native checkbox — keeps value/query-selector compatibility with main.js
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = String(option.value);
        checkbox.className = 'sr-only';
        checkbox.checked = getActiveIds().has(String(option.value));

        // Custom visual checkmark box
        const checkmark = document.createElement('div');
        checkmark.className = 'w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center transition-colors';

        function updateCheckmark(checked) {
            if (checked) {
                checkmark.className = 'w-3.5 h-3.5 flex-shrink-0 rounded border border-indigo-500 bg-indigo-500 flex items-center justify-center transition-colors';
                checkmark.innerHTML = TICK_SVG;
            } else {
                checkmark.className = 'w-3.5 h-3.5 flex-shrink-0 rounded border border-zinc-300 dark:border-zinc-600 bg-transparent flex items-center justify-center transition-colors';
                checkmark.innerHTML = '';
            }
        }

        updateCheckmark(checkbox.checked);

        // Allow main.js resets (cb.checked = false + dispatchEvent) to update the visual
        checkbox.addEventListener('change', () => updateCheckmark(checkbox.checked));

        const label = document.createElement('label');
        label.textContent = option.label;
        label.className = 'text-sm text-zinc-700 dark:text-zinc-200 truncate flex-1 pointer-events-none';

        const badge = document.createElement('span');
        badge.textContent = option.count;
        badge.className = 'text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0';

        item.appendChild(checkbox);
        item.appendChild(checkmark);
        item.appendChild(label);
        item.appendChild(badge);

        item.addEventListener('click', function () {
            checkbox.checked = !checkbox.checked;
            updateCheckmark(checkbox.checked);
            onToggle(String(option.value), checkbox.checked);
        });

        panel.appendChild(item);
    });

    return filterOptions;
}

export function updateClearFilterButton() {}
