/**
 * Compress an image data URL to meet a target size
 * Uses OffscreenCanvas when available (service worker context)
 * Falls back to standard Canvas for main thread
 */
export function compressImage(dataUrl, targetSizeKB, callback) {
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
			// Cover-crop: scale to fill 480x320 without distortion, center and crop overflow
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
			// Cover-crop: scale to fill 480x320 without distortion, center and crop overflow
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
