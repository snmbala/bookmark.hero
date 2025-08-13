// Thumbnail and screenshot functionality
export function captureScreenshot(url, title, updateCallback) {
    if (!url) {
        console.error("URL is empty");
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
        function (window) {
            const tabId = window.tabs[0].id;

            chrome.tabs.onUpdated.addListener(function listener(
                tabId,
                changeInfo
            ) {
                if (tabId === tabId && changeInfo.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);

                    setTimeout(function () {
                        chrome.tabs.captureVisibleTab(
                            window.id,
                            { format: "png" },
                            function (dataUrl) {
                                if (dataUrl) {
                                    compressImage(
                                        dataUrl,
                                        100,
                                        function (compressedDataUrl) {
                                            saveScreenshotToLocalStorage(
                                                url,
                                                compressedDataUrl
                                            );
                                            // Call the update callback if provided
                                            if (updateCallback && typeof updateCallback === 'function') {
                                                updateCallback(url, compressedDataUrl);
                                            }
                                        }
                                    );
                                } else {
                                    console.error("Failed to capture screenshot for URL:", url);
                                }
                                chrome.windows.remove(window.id);
                            }
                        );
                    }, 1000);
                }
            });
        }
    );
}

function compressImage(dataUrl, targetSizeKB, callback) {
    const img = new Image();
    img.src = dataUrl;
    img.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = 1024;
        canvas.height = 683;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let compressionQuality = 1.0;

        while (true) {
            const dataUrl = canvas.toDataURL("image/jpeg", compressionQuality);
            const compressedSizeKB = dataUrl.length / 1024;

            if (compressedSizeKB <= targetSizeKB || compressionQuality <= 0.1) {
                callback(dataUrl);
                break;
            } else {
                compressionQuality -= 0.1;
            }
        }
    };
}

function saveScreenshotToLocalStorage(url, dataUrl) {
    const key = url;
    const value = dataUrl;
    chrome.storage.local.set({ [key]: value }, function () {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
        }
    });
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
    // Find thumbnail images by URL in alt attribute
    const thumbnailImgs = document.querySelectorAll(`img[alt='${url}']`);
    if (thumbnailImgs.length > 0) {
        thumbnailImgs.forEach(img => {
            img.src = dataUrl;
        });
        console.log(`Updated ${thumbnailImgs.length} thumbnail(s) for URL:`, url);
    } else {
        // Also try to find by bookmark URL in the card
        const bookmarkCards = document.querySelectorAll('.card');
        bookmarkCards.forEach(card => {
            const cardLink = card.querySelector(`a[href="${url}"]`);
            if (cardLink) {
                const thumbnailImg = card.querySelector('img');
                if (thumbnailImg) {
                    thumbnailImg.src = dataUrl;
                    console.log("Updated thumbnail via card link for URL:", url);
                }
            }
        });
    }
}
