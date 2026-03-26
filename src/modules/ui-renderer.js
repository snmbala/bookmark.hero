import { getThumbnailUrl, updateThumbnail } from './thumbnail.js';
import { iconEl } from './icons.js';

export function highlightText(text, searchTerm) {
    if (!searchTerm || !text) return escapeHtml(text);

    // Escape HTML in the input text first
    let escapedText = escapeHtml(text);
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);

    searchWords.forEach(word => {
        // Escape special regex characters in the search word
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedWord})`, 'gi');
        escapedText = escapedText.replace(regex,
            '<mark class="bg-yellow-200 dark:bg-yellow-400 dark:text-zinc-900 px-0.5 rounded-sm">$1</mark>'
        );
    });
    return escapedText;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
}

export function getDynamicTitle(searchTerm, filterId, currentCount, filterOptions) {
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
        return `All Bookmarks (${currentCount})`;
    }
}

export function createBookmarkCard(bookmarkNode, searchTerm, folderName, allBookmarks, filterOptions) {
    const card = document.createElement("div");
    card.className = "card group";
    card.setAttribute('tabindex', '0');
    // Add parent ID and bookmark ID as data attributes for keyboard navigation
    card.setAttribute('data-parent-id', bookmarkNode.parentId || '1');
    card.setAttribute('data-bookmark-id', bookmarkNode.id);
    card.setAttribute('data-bookmark-url', bookmarkNode.url);

    // Keyboard navigation for card
    card.addEventListener('keydown', function (event) {
        // Only handle if card is focused
        if (document.activeElement !== card) return;
        if (event.key === 'Enter') {
            // Open bookmark URL in new tab
            event.preventDefault();
            if (bookmarkNode.url) {
                window.open(bookmarkNode.url, '_blank');
            }
        } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
            // Let arrow navigation be handled by keyboard-shortcuts.js
            // Do nothing here
        }
    });

    // Inline hover action buttons
    const actionRow = document.createElement("div");
    actionRow.className = "absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 z-10";

    const btnClass = "flex items-center justify-center w-7 h-7 rounded-md bg-white/90 dark:bg-zinc-800/90 text-zinc-500 dark:text-zinc-400 shadow-sm border border-zinc-200/80 dark:border-zinc-600/80 cursor-pointer";

    const recaptureBtn = document.createElement("button");
    recaptureBtn.setAttribute('aria-label', 'Recapture thumbnail for ' + bookmarkNode.title);
    recaptureBtn.className = btnClass + " hover:text-indigo-600 dark:hover:text-indigo-400";
    recaptureBtn.appendChild(iconEl('camera', 'w-3.5 h-3.5'));
    recaptureBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (window.handleScreenshotCapture) window.handleScreenshotCapture(bookmarkNode.url, bookmarkNode.title);
    });

    // Hidden file input for upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function() {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            const rawDataUrl = evt.target.result;
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                canvas.width = 480;
                canvas.height = 320;
                const ctx = canvas.getContext('2d');
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const x = (canvas.width - img.width * scale) / 2;
                const y = (canvas.height - img.height * scale) / 2;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
                let quality = 0.9;
                let compressed = canvas.toDataURL('image/jpeg', quality);
                while (compressed.length / 1024 > 40 && quality > 0.1) {
                    quality -= 0.1;
                    compressed = canvas.toDataURL('image/jpeg', quality);
                }
                chrome.storage.local.set({ [bookmarkNode.url]: compressed });
                updateThumbnail(bookmarkNode.url, compressed);
                cardThumbnailSection.querySelectorAll('button').forEach(btn => {
                    if (btn.textContent === 'Capture Thumbnail') btn.remove();
                });
            };
            img.src = rawDataUrl;
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });
    card.appendChild(fileInput);

    const uploadBtn = document.createElement("button");
    uploadBtn.setAttribute('aria-label', 'Upload image for ' + bookmarkNode.title);
    uploadBtn.className = btnClass + " hover:text-indigo-600 dark:hover:text-indigo-400";
    uploadBtn.appendChild(iconEl('upload', 'w-3.5 h-3.5'));
    uploadBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        fileInput.click();
    });

    const editBtn = document.createElement("button");
    editBtn.setAttribute('aria-label', 'Edit ' + bookmarkNode.title);
    editBtn.className = btnClass + " hover:text-indigo-600 dark:hover:text-indigo-400";
    editBtn.appendChild(iconEl('pencil', 'w-3.5 h-3.5'));
    editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        if (window.openEditModal) window.openEditModal(bookmarkNode);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.setAttribute('aria-label', 'Delete ' + bookmarkNode.title);
    deleteBtn.className = btnClass + " hover:text-rose-600 dark:hover:text-rose-400";
    deleteBtn.appendChild(iconEl('trash-2', 'w-3.5 h-3.5'));
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();

        // Hide the action row and show inline confirmation
        actionRow.classList.add('!hidden');

        const confirmBar = document.createElement('div');
        confirmBar.className = 'absolute top-1.5 right-1.5 flex items-center gap-1.5 z-10 bg-white/95 dark:bg-zinc-800/95 border border-rose-200 dark:border-rose-700 rounded-md shadow-md px-2 py-1';

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
            actionRow.classList.remove('!hidden');
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
        card.appendChild(confirmBar);
        noBtn.focus();

        // Auto-dismiss if user moves away without acting
        const autoCancel = setTimeout(dismiss, 5000);
    });

    function wrapWithTooltip(btn, label) {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative group/tip';
        wrapper.appendChild(btn);
        const tip = document.createElement('span');
        tip.textContent = label;
        tip.className = 'pointer-events-none absolute top-full right-0 mt-1 px-2 py-0.5 text-xs font-medium text-white bg-zinc-800 dark:bg-zinc-700 rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-20';
        wrapper.appendChild(tip);
        return wrapper;
    }

    const recaptureWrapper = wrapWithTooltip(recaptureBtn, 'Recapture');
    recaptureWrapper.classList.add('hidden'); // only reveal once a screenshot exists
    actionRow.appendChild(recaptureWrapper);
    actionRow.appendChild(wrapWithTooltip(uploadBtn, 'Upload image'));
    actionRow.appendChild(wrapWithTooltip(editBtn, 'Edit'));
    actionRow.appendChild(wrapWithTooltip(deleteBtn, 'Delete'));
    card.appendChild(actionRow);

    const cardThumbnailSection = document.createElement("a");
    cardThumbnailSection.href = bookmarkNode.url;
    cardThumbnailSection.target = "_blank";
    cardThumbnailSection.className = "card-thumbnail relative w-full aspect-[3/2] border-b-[1.5px] border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-700 overflow-hidden flex items-center justify-center flex-col gap-3";

    // Create thumbnail elements synchronously to prevent pop-in during scroll
    const thumbnailImg = document.createElement("img");
    thumbnailImg.alt = bookmarkNode.url || "Bookmark thumbnail";

    const captureButton = document.createElement("button");
    captureButton.textContent = "Capture Thumbnail";
    captureButton.className = "text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-900 font-semibold py-2 px-4 border shadow rounded-full hidden";
    captureButton.id = "capture-" + bookmarkNode.url.replace(/[^a-zA-Z0-9]/g, '');
    captureButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (captureButton.disabled) return;
        captureButton.disabled = true;
        captureButton.textContent = "Capturing...";
        captureButton.classList.add("opacity-60", "cursor-not-allowed");
        captureButton.classList.remove("hover:bg-zinc-50", "dark:hover:bg-zinc-900");
        if (window.handleScreenshotCapture) {
            window.handleScreenshotCapture(bookmarkNode.url, bookmarkNode.title, captureButton);
        }
    });

    cardThumbnailSection.appendChild(thumbnailImg);
    cardThumbnailSection.appendChild(captureButton);

    // Whenever a real screenshot (data: URL) loads — first capture or re-capture —
    // switch to full-size display, hide the "Capture" button, show recapture button.
    thumbnailImg.addEventListener('load', function () {
        if (thumbnailImg.src && thumbnailImg.src.startsWith('data:')) {
            thumbnailImg.className = "absolute inset-0 w-full h-full object-cover";
            captureButton.classList.add('hidden');
            recaptureWrapper.classList.remove('hidden');
        }
    });

    // Async: only update src and reveal button — no DOM structure changes
    getThumbnailUrl(bookmarkNode.url, function (thumbnailUrl) {
        thumbnailImg.src = thumbnailUrl;
        if (thumbnailUrl.startsWith("https://www.google.com/s2/favicons?domain=")) {
            captureButton.classList.remove("hidden");
            thumbnailImg.className = "w-8 h-8 object-contain flex-shrink-0";
        } else {
            // Screenshot already exists — the load event above will apply full-size classes,
            // but set them here too so there's no flash before load fires.
            thumbnailImg.className = "absolute inset-0 w-full h-full object-cover";
            recaptureWrapper.classList.remove('hidden');
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
    cardDetailsSection.className = "flex-1 flex flex-col bg-white dark:bg-zinc-800 px-2 pt-3 pb-3";

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

    let trimmedURL;
    try {
        const url = new URL(bookmarkNode.url);
        const hostname = url.hostname.replace(/^www\./, "");
        const pathname = url.pathname;
        if (pathname && pathname !== "/") {
            trimmedURL = highlightText(hostname, searchTerm) +
                `<span class="text-zinc-400 whitespace-nowrap">${highlightText(pathname, searchTerm)}</span>`;
        } else {
            trimmedURL = highlightText(hostname, searchTerm);
        }
    } catch {
        trimmedURL = highlightText(bookmarkNode.url || "", searchTerm);
    }

    bookmarkURL.innerHTML = trimmedURL;
    bookmarkURLDiv.appendChild(bookmarkURL);
    cardDetailsSection.appendChild(bookmarkURLDiv);

    // Show folder tag badge on every card
    {
        let folderNameText = "";
        const bookmarkData = allBookmarks.find(b => b.bookmark.id === bookmarkNode.id);
        if (bookmarkData && bookmarkData.folder) {
            folderNameText = bookmarkData.folder;
        } else {
            const folderOption = filterOptions.find(option => option.value === bookmarkNode.parentId);
            if (folderOption) folderNameText = folderOption.label.replace(/^[-\s]+/, "");
        }

        if (folderNameText) {
            const tagContainer = document.createElement("div");
            tagContainer.className = "flex-start w-full mt-1";
            const tagText = document.createElement("span");
            tagText.textContent = folderNameText;
            tagText.className = "flex-center w-fit h-5 px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-600 text-xs font-medium";
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
    card.setAttribute('role', 'article');
    card.setAttribute('aria-describedby', `bookmark-url-${bookmarkNode.id}`);

    // Add hidden description for screen readers with URL
    const urlDescription = document.createElement('span');
    urlDescription.id = `bookmark-url-${bookmarkNode.id}`;
    urlDescription.className = 'sr-only';
    urlDescription.textContent = `URL: ${bookmarkNode.url}`;
    card.appendChild(urlDescription);

    return card;
}
