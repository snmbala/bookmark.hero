// function compressImage(dataUrl, targetSizeKB, callback) {
// 	const img = new Image();
// 	img.onload = function () {
// 		const canvas = document.createElement("canvas");
// 		const ctx = canvas.getContext("2d");

// 		// Set canvas dimensions to match the desired dimensions
// 		canvas.width = 1024;
// 		canvas.height = 683;

// 		// Draw the image onto the canvas
// 		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

// 		// Initialize compression quality
// 		let compressionQuality = 1.0; // Start with maximum quality

// 		// Compress the image until it meets the target size
// 		while (true) {
// 			// Convert canvas to data URL with current compression quality
// 			const compressedDataUrl = canvas.toDataURL(
// 				"image/jpeg",
// 				compressionQuality
// 			);

// 			// Calculate the size of the compressed image
// 			const compressedSizeKB = compressedDataUrl.length / 1024;

// 			// Check if the compressed size meets the target size or compression quality is very low
// 			if (compressedSizeKB <= targetSizeKB || compressionQuality <= 0.1) {
// 				// If the compressed size is within the target or compression quality is low enough, stop compression
// 				callback(compressedDataUrl);
// 				break;
// 			} else {
// 				// Decrease the compression quality for further compression
// 				compressionQuality -= 0.1; // Decrease by 0.1 (adjust as needed)
// 			}
// 		}
// 	};
// 	img.src = dataUrl;
// }

// Function to compress an image to meet a target size
function compressImage(dataUrl, targetSizeKB, callback) {
	const maxQuality = 1;
	const minQuality = 0.1; // Minimum allowed quality
	const step = 0.05; // Step for adjusting quality

	fetch(dataUrl)
		.then((res) => res.blob())
		.then((blob) => createImageBitmap(blob))
		.then((imageBitmap) => {
			const canvas = new OffscreenCanvas(1024, 683);
			const ctx = canvas.getContext("2d");
			ctx.drawImage(imageBitmap, 0, 0, 1024, 683);

			let currentQuality = maxQuality;
			let lastBlobSize = Infinity;

			const compress = () => {
				canvas
					.convertToBlob({
						type: "image/jpeg",
						quality: currentQuality,
					})
					.then((compressedBlob) => {
						const blobSizeKB = compressedBlob.size / 1024;
						if (
							Math.abs(blobSizeKB - targetSizeKB) < 1 ||
							currentQuality <= minQuality ||
							blobSizeKB >= lastBlobSize
						) {
							// If the difference is within 1KB of the target size, or quality is already at minQuality, or blob size starts increasing, stop
							const reader = new FileReader();
							reader.onloadend = function () {
								callback(reader.result);
							};
							reader.readAsDataURL(compressedBlob);
						} else {
							// Adjust quality and try again
							currentQuality -= step;
							lastBlobSize = blobSizeKB;
							compress();
						}
					});
			};

			compress();
		})
		.catch((err) => console.error(err));
}

chrome.action.onClicked.addListener(function (tab) {
	// Create a new tab with the bookmarks page
	chrome.tabs.create({ url: chrome.runtime.getURL("src/bookmarks.html") });
});

chrome.bookmarks.onCreated.addListener(function (bookmark, bookmarkInfo) {
	// Capture the visible tab as a screenshot
	chrome.tabs.captureVisibleTab(null, { format: "png" }, function (dataUrl) {
		if (dataUrl) {
			// Compress the captured screenshot to meet a target size of 100 KB
			compressImage(dataUrl, 100, function (compressedDataUrl) {
				key = bookmarkInfo.url;
				value = compressedDataUrl;
				console.log(bookmark);
				// Store the compressed screenshot in local storage
				chrome.storage.local.set({ [key]: value }, function () {
					if (chrome.runtime.lastError) {
						console.error(chrome.runtime.lastError.message);
					} else {
						console.log(
							"Compressed screenshot captured and stored for bookmark with ID:",
							id
						);
					}
				});
			});
		} else {
			console.error(
				"Failed to capture screenshot for bookmark with ID:",
				id
			);
		}
	});
});