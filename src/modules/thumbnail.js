import { compressImage } from './image-utils.js';

// Thumbnail and screenshot functionality
export function captureScreenshot(url, title, updateCallback) {
    if (!url) {
        console.error("URL is empty");
        return;
    }

    // Safari does not support chrome.windows — screenshot capture is unavailable.
    // Auto-capture on bookmark creation (background.js) still works via captureVisibleTab.
    if (!chrome.windows || typeof chrome.windows.create !== 'function') {
        if (updateCallback) updateCallback(url, null);
        return;
    }

    const windowWidth = 1024;
    const windowHeight = 683;
    chrome.windows.create(
        {
            url: url,
            type: "popup",
            width: windowWidth,
            height: windowHeight,
            left: Math.round((screen.width - windowWidth) / 2),
            top: Math.round((screen.height - windowHeight) / 2),
        },
        function (createdWindow) {
            if (!createdWindow || chrome.runtime.lastError) {
                if (updateCallback) updateCallback(url, null);
                return;
            }
            const tabId = createdWindow.tabs[0].id;

            // Timeout: close popup and call callback so callers (e.g. bulk queue) never stall
            const abortTimer = setTimeout(function () {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.windows.remove(createdWindow.id, function () {});
                if (updateCallback && typeof updateCallback === 'function') {
                    updateCallback(url, null); // null = failed/timed out
                }
            }, 15000);

            function listener(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);
                    clearTimeout(abortTimer);

                    setTimeout(function () {
                        chrome.tabs.captureVisibleTab(
                            createdWindow.id,
                            { format: "png" },
                            function (dataUrl) {
                                if (dataUrl) {
                                    compressImage(
                                        dataUrl,
                                        40,
                                        function (compressedDataUrl) {
                                            chrome.storage.local.set({ [url]: compressedDataUrl }, function () {
                                                if (chrome.runtime.lastError) {
                                                    console.error(chrome.runtime.lastError.message);
                                                }
                                            });
                                            if (updateCallback && typeof updateCallback === 'function') {
                                                updateCallback(url, compressedDataUrl);
                                            }
                                        }
                                    );
                                } else {
                                    // Capture failed — still notify caller so queues don't stall
                                    if (updateCallback && typeof updateCallback === 'function') {
                                        updateCallback(url, null);
                                    }
                                }
                                chrome.windows.remove(createdWindow.id);
                            }
                        );
                    }, 1000);
                }
            }

            chrome.tabs.onUpdated.addListener(listener);
        }
    );
}


export function getThumbnailUrl(url, callback) {
    const key = url;
    chrome.storage.local.get([key], function (result) {
        if (chrome.runtime.lastError) {
            callback(`https://www.google.com/s2/favicons?domain=${url}`);
        } else {
            const dataUrl = result[key];
            if (dataUrl) {
                callback(dataUrl);
            } else {
                callback(`https://www.google.com/s2/favicons?domain=${url}`);
            }
        }
    });
}

export function updateThumbnail(url, dataUrl) {
    const thumbnailImgs = document.querySelectorAll(`img[alt='${url}']`);
    if (thumbnailImgs.length > 0) {
        thumbnailImgs.forEach(img => { img.src = dataUrl; });
    } else {
        document.querySelectorAll('.card').forEach(card => {
            const cardLink = card.querySelector(`a[href="${url}"]`);
            if (cardLink) {
                const thumbnailImg = card.querySelector('img');
                if (thumbnailImg) thumbnailImg.src = dataUrl;
            }
        });
    }
}

export function bulkCaptureInWindow(entries, onProgress, onDone) {
    if (!entries || entries.length === 0) { onDone(0, 0); return; }
    if (!chrome.windows || typeof chrome.windows.create !== 'function') {
        onDone(0, entries.length); return;
    }

    const total = entries.length;
    let index = 0, capturedCount = 0, failedCount = 0;
    let createdWindow = null, tabId = null;
    let currentListener = null, abortTimer = null, finished = false;

    function removeCurrentListener() {
        if (abortTimer)      { clearTimeout(abortTimer); abortTimer = null; }
        if (currentListener) { chrome.tabs.onUpdated.removeListener(currentListener); currentListener = null; }
    }

    function finish() {
        if (finished) return;
        finished = true;
        removeCurrentListener();
        chrome.windows.onRemoved.removeListener(onWindowRemovedListener);
        onDone(capturedCount, failedCount, false);
        if (createdWindow) chrome.windows.remove(createdWindow.id, function () {});
    }

    function onWindowRemovedListener(windowId) {
        if (!createdWindow || windowId !== createdWindow.id) return;
        removeCurrentListener();
        finished = true;
        chrome.windows.onRemoved.removeListener(onWindowRemovedListener);
        onDone(capturedCount, failedCount + (total - capturedCount - failedCount), true);
    }

    function listenAndCapture(url, oneBasedIndex) {
        onProgress('loading', url, oneBasedIndex, total, null);

        abortTimer = setTimeout(function () {
            removeCurrentListener();
            failedCount++;
            onProgress('failed', url, oneBasedIndex, total, null);
            processNext();
        }, 10000);

        currentListener = function (updatedTabId, changeInfo) {
            if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
            removeCurrentListener();
            setTimeout(function () {
                if (finished) return;
                chrome.tabs.captureVisibleTab(createdWindow.id, { format: 'png' }, function (dataUrl) {
                    if (chrome.runtime.lastError || !dataUrl) {
                        failedCount++;
                        onProgress('failed', url, oneBasedIndex, total, null);
                        processNext();
                        return;
                    }
                    compressImage(dataUrl, 40, function (compressed) {
                        chrome.storage.local.set({ [url]: compressed }, function () {
                            if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
                        });
                        capturedCount++;
                        onProgress('captured', url, oneBasedIndex, total, compressed);
                        processNext();
                    });
                });
            }, 1000);
        };
        chrome.tabs.onUpdated.addListener(currentListener);
    }

    function processNext() {
        if (finished) return;
        if (index >= total) { finish(); return; }
        const entry = entries[index];
        const url = entry.bookmark.url;
        const oneBasedIndex = index + 1;
        index++;
        chrome.tabs.update(tabId, { url }, function () {
            if (chrome.runtime.lastError) {
                failedCount++;
                onProgress('failed', url, oneBasedIndex, total, null);
                processNext();
                return;
            }
            listenAndCapture(url, oneBasedIndex);
        });
    }

    chrome.windows.create(
        {
            url: entries[0].bookmark.url,
            type: 'popup',
            width: 1024,
            height: 683,
            left: Math.round((screen.width - 1024) / 2),
            top: Math.round((screen.height - 683) / 2),
        },
        function (win) {
            if (!win || chrome.runtime.lastError) { onDone(0, total); return; }
            createdWindow = win;
            tabId = win.tabs[0].id;
            index = 1; // windows.create handled entries[0]; processNext starts at entries[1]
            chrome.windows.onRemoved.addListener(onWindowRemovedListener);
            listenAndCapture(entries[0].bookmark.url, 1);
        }
    );
}
