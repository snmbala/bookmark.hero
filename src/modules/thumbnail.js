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

function compressImage(dataUrl, targetSizeKB, callback) {
    const img = new Image();
    img.src = dataUrl;
    img.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = 480;
        canvas.height = 320;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let compressionQuality = 1.0;

        while (true) {
            const compressed = canvas.toDataURL("image/jpeg", compressionQuality);
            const compressedSizeKB = compressed.length / 1024;

            if (compressedSizeKB <= targetSizeKB || compressionQuality <= 0.1) {
                callback(compressed);
                break;
            } else {
                compressionQuality -= 0.1;
            }
        }
    };
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
