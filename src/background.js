/**
 * Compress an image data URL to meet a target size
 * Uses OffscreenCanvas when available (service worker context)
 * Falls back to standard Canvas for main thread
 */
function compressImage(dataUrl, targetSizeKB, callback) {
	if (!dataUrl || !callback) {
		console.error('compressImage: dataUrl and callback are required');
		return;
	}

	// Try OffscreenCanvas first (service worker context)
	if (typeof OffscreenCanvas !== 'undefined') {
		compressWithOffscreenCanvas(dataUrl, targetSizeKB, callback);
	} else {
		// Fall back to standard Canvas (main thread)
		compressWithCanvas(dataUrl, targetSizeKB, callback);
	}
}

function compressWithOffscreenCanvas(dataUrl, targetSizeKB, callback) {
	const maxQuality = 1;
	const minQuality = 0.1;
	const step = 0.05;

	// Convert data URL to blob without using fetch (service workers can't fetch data URLs)
	const parts = dataUrl.split(',');
	const mimeMatch = parts[0].match(/:(.*?);/);
	const mime = mimeMatch ? mimeMatch[1] : 'image/png';
	const binaryString = atob(parts[1]);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	const blob = new Blob([bytes], { type: mime });

	createImageBitmap(blob)
		.then((imageBitmap) => {
			const canvas = new OffscreenCanvas(480, 320);
			const ctx = canvas.getContext('2d');
			const scale = Math.max(480 / imageBitmap.width, 320 / imageBitmap.height);
			const sw = 480 / scale;
			const sh = 320 / scale;
			const sx = (imageBitmap.width - sw) / 2;
			const sy = (imageBitmap.height - sh) / 2;
			ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, 480, 320);

			let currentQuality = maxQuality;
			let lastBlobSize = Infinity;

			const compress = () => {
				canvas
					.convertToBlob({
						type: 'image/jpeg',
						quality: currentQuality,
					})
					.then((compressedBlob) => {
						const blobSizeKB = compressedBlob.size / 1024;
						if (
							Math.abs(blobSizeKB - targetSizeKB) < 1 ||
							currentQuality <= minQuality ||
							blobSizeKB >= lastBlobSize
						) {
							const reader = new FileReader();
							reader.onloadend = function () {
								callback(reader.result);
							};
							reader.readAsDataURL(compressedBlob);
						} else {
							currentQuality -= step;
							lastBlobSize = blobSizeKB;
							compress();
						}
					})
					.catch((err) => {
						console.error('Compression error:', err);
						callback(null);
					});
			};

			compress();
		})
		.catch((err) => {
			console.error('Image compression failed:', err);
			callback(null);
		});
}

function compressWithCanvas(dataUrl, targetSizeKB, callback) {
	const img = new Image();
	img.onload = function () {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		canvas.width = 480;
		canvas.height = 320;

		try {
			const scale = Math.max(480 / img.width, 320 / img.height);
			const sw = 480 / scale;
			const sh = 320 / scale;
			const sx = (img.width - sw) / 2;
			const sy = (img.height - sh) / 2;
			ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
		} catch (err) {
			console.error('Failed to draw image on canvas:', err);
			callback(null);
			return;
		}

		let compressionQuality = 1.0;
		const minQuality = 0.1;
		const step = 0.05;
		let lastBlobSize = Infinity;

		// Use async iteration to avoid blocking the main thread
		const compress = () => {
			try {
				const compressed = canvas.toDataURL('image/jpeg', compressionQuality);
				const compressedSizeKB = compressed.length / 1024;

				if (compressedSizeKB <= targetSizeKB || compressionQuality <= minQuality || compressedSizeKB >= lastBlobSize) {
					callback(compressed);
				} else {
					compressionQuality -= step;
					lastBlobSize = compressedSizeKB;
					// Schedule next iteration asynchronously to avoid blocking
					setTimeout(compress, 0);
				}
			} catch (err) {
				console.error('Canvas compression error:', err);
				callback(null);
			}
		};

		compress();
	};
	img.onerror = function () {
		console.error('Failed to load image for compression');
		callback(null);
	};
	img.src = dataUrl;
}

// Extension icon always opens the popover
chrome.action.setPopup({ popup: 'main.html?mode=popover' });

// Intercept the new tab page. fires when a tab navigates to chrome://newtab/,
// which only happens for user-opened new tabs (Ctrl+T, + button), not for
// links or bookmarks opening in a new tab (those navigate directly to their URL).
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
	if (changeInfo.url !== 'chrome://newtab/') return;
	chrome.storage.sync.get(['showOnNewTab'], function (result) {
		const showOnNewTab = result.showOnNewTab !== false; // Default to true
		if (showOnNewTab) {
			chrome.tabs.update(tabId, { url: chrome.runtime.getURL('main.html') });
		}
	});
});

// Apply the correct mode on service worker start
function initializeExtension() {
	// Always set popover mode for the action
	chrome.action.setPopup({ popup: 'main.html?mode=popover' });
}

// Run immediately (when service worker wakes up) and on lifecycle events
initializeExtension();
chrome.runtime.onStartup.addListener(initializeExtension);
chrome.runtime.onInstalled.addListener(initializeExtension);

// ─── Thumbnail storage management ─────────────────────────────────────────────
//
// On uninstall: Chrome automatically deletes all chrome.storage.local data
// when the extension is removed, so all captured thumbnails are cleared
// without any extra cleanup code needed.
//

/**
 * Removes all chrome.storage.local entries whose key is not a URL of an
 * existing bookmark. Includes timeout protection to prevent service worker hang.
 */
function pruneOrphanedThumbnails() {
	const timeoutId = setTimeout(function () {
		console.warn('pruneOrphanedThumbnails timed out after 5 seconds');
	}, 5000);

	chrome.bookmarks.getTree(function (tree) {
		if (chrome.runtime.lastError) {
			clearTimeout(timeoutId);
			console.error('Failed to get bookmarks tree:', chrome.runtime.lastError.message);
			return;
		}

		const urls = new Set();
		function walk(nodes) {
			for (const node of nodes) {
				if (node.url) urls.add(node.url);
				if (node.children) walk(node.children);
			}
		}

		try {
			walk(tree);
		} catch (err) {
			clearTimeout(timeoutId);
			console.error('Error walking bookmark tree:', err);
			return;
		}

		chrome.storage.local.get(null, function (items) {
			if (chrome.runtime.lastError) {
				clearTimeout(timeoutId);
				console.error('Failed to get storage:', chrome.runtime.lastError.message);
				return;
			}

			const orphaned = Object.keys(items).filter(k => !urls.has(k));
			if (orphaned.length > 0) {
				chrome.storage.local.remove(orphaned, function () {
					clearTimeout(timeoutId);
					if (chrome.runtime.lastError) {
						console.error('Failed to remove orphaned thumbnails:', chrome.runtime.lastError.message);
					}
				});
			} else {
				clearTimeout(timeoutId);
			}
		});
	});
}

// Remove thumbnail immediately when a bookmark is deleted
chrome.bookmarks.onRemoved.addListener(function (id, removeInfo) {
	if (removeInfo.node && removeInfo.node.url) {
		chrome.storage.local.remove(removeInfo.node.url);
	}
});

// Prune orphans on browser start and after extension install/update
chrome.runtime.onStartup.addListener(pruneOrphanedThumbnails);
chrome.runtime.onInstalled.addListener(pruneOrphanedThumbnails);

chrome.bookmarks.onCreated.addListener(function (id, bookmarkInfo) {
	if (!bookmarkInfo.url) return; // folders have no URL

	// Check storage quota before attempting to store
	const QUOTA_LIMIT = 9 * 1024 * 1024; // 9 MB (leave 1 MB buffer for other data)

	chrome.storage.local.getBytesInUse(null, function (bytesUsed) {
		if (bytesUsed > QUOTA_LIMIT) {
			console.warn('Storage quota exceeded, skipping thumbnail capture');
			return;
		}

		// Open a consistent-size popup to capture, matching the manual "Capture" path
		const windowWidth = 1024;
		const windowHeight = 683;
		chrome.windows.create(
			{
				url: bookmarkInfo.url,
				type: 'popup',
				width: windowWidth,
				height: windowHeight,
				focused: false,
			},
			function (createdWindow) {
				if (!createdWindow || chrome.runtime.lastError) {
					console.warn('Failed to open capture window:', chrome.runtime.lastError?.message);
					return;
				}
				const tabId = createdWindow.tabs[0].id;

				// Timeout: close popup if page takes too long
				const abortTimer = setTimeout(function () {
					chrome.tabs.onUpdated.removeListener(listener);
					chrome.windows.remove(createdWindow.id, function () {});
				}, 15000);

				function listener(updatedTabId, changeInfo) {
					if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
					chrome.tabs.onUpdated.removeListener(listener);
					clearTimeout(abortTimer);

					setTimeout(function () {
						chrome.tabs.captureVisibleTab(createdWindow.id, { format: 'png' }, function (dataUrl) {
							if (dataUrl) {
								compressImage(dataUrl, 40, function (compressedDataUrl) {
									if (!compressedDataUrl) {
										console.error('Failed to compress image');
										chrome.windows.remove(createdWindow.id, function () {});
										return;
									}

									const key = bookmarkInfo.url;
									const value = compressedDataUrl;

									chrome.storage.local.getBytesInUse(null, function (finalBytesUsed) {
										if (finalBytesUsed + value.length / 1024 > QUOTA_LIMIT) {
											console.warn('Storage quota would be exceeded, not storing thumbnail');
										} else {
											chrome.storage.local.set({ [key]: value }, function () {
												if (chrome.runtime.lastError) {
													console.error('Failed to store thumbnail:', chrome.runtime.lastError.message);
												}
											});
										}
										chrome.windows.remove(createdWindow.id, function () {});
									});
								});
							} else {
								console.warn('Failed to capture visible tab for bookmark:', bookmarkInfo.url);
								chrome.windows.remove(createdWindow.id, function () {});
							}
						});
					}, 1000);
				}

				chrome.tabs.onUpdated.addListener(listener);
			}
		);
	});
});