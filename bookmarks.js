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

	settingsButton.addEventListener("click", function () {
		//display settings modal
		const settingsModal = document.getElementById("settings-modal");
		settingsModal.classList.toggle("hidden");
	});

	function collectBookmarks(node, folderName = "") {
		if (node.children) {
			folderName = node.title; // Update folderName if current node is a folder
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

	// Add event listener for search input changes
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
		}
	});
	clearSearch.addEventListener("click", function () {
		searchInput.value = "";
		clearSearch.classList.add("hidden");
		searchIcon.src = "assets/icons/search.svg";
		filterBookmarks(bookmarks, "");
	});
	document.addEventListener("keydown", function (event) {
		if (event.key === "/" && document.activeElement !== searchInput) {
			event.preventDefault();
			searchInput.focus(); // Focus on the search input
		}
	});

	function toggleView() {
		gridViewEnabled = !gridViewEnabled;
		
		// Reset search input and clear search state
		searchInput.value = "";
		clearSearch.classList.add("hidden");
		searchIcon.src = "assets/icons/search.svg";
		
		// Reset filter dropdown to "All"
		filterDropdown.value = "all";
		FILTER_ID = 0;
		
		const searchTerm = ""; // Now always empty after clearing
		const folderIcons = document.querySelectorAll(".folder-icon"); // Select all folder-icon elements
	
		if (gridViewEnabled) {
			// Handle grid view
			folderIcons.forEach(icon => {
				icon.style.fill = "none";
				icon.style.stroke = "#a1a1aa"; // Apply stroke to the folder icon
			});
	
			folderViewButton.classList.remove("active");
			folderViewButton.classList.add("in-active");
	
			recentsIconSvg.style.fill = "#4f46e5";
			recentsIconSvg.style.stroke = "#4f46e5"; // Apply stroke to the recents icon
			recentsViewButton.classList.add("active");
			recentsViewButton.classList.remove("in-active");
	
			showGridView(searchTerm);
		} else {
			// Handle default view
			folderIcons.forEach(icon => {
				icon.style.fill = "#4f46e5";
				icon.style.stroke = "#4f46e5"; // Apply stroke to the folder icon
			});
	
			folderViewButton.classList.add("active");
			folderViewButton.classList.remove("in-active");
			
			recentsIconSvg.style.stroke = "#a1a1aa";
			recentsIconSvg.style.fill = "none";
			recentsViewButton.classList.remove("active");
			recentsViewButton.classList.add("in-active");
			
			filterBookmarks(bookmarks, searchTerm);
		}
	}
	
	// Function to generate markup for grid view
	function showGridView(searchTerm) {
		sortedBookmarks = allBookmarks.sort((a, b) => {
			const lastVisitedA =
				a.bookmark.dateLastUsed || a.bookmark.dateAdded;
			const lastVisitedB =
				b.bookmark.dateLastUsed || b.bookmark.dateAdded;
			return lastVisitedB - lastVisitedA;
		});
		// Clear existing items in the folderList
		folderList.innerHTML = "";
		const mainTitle = document.createElement("h2");
		mainTitle.textContent = `Bookmarks (${sortedBookmarks.length})`;
		mainTitle.className = "container flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50  ";
		const gridContainer = document.createElement("div");
		gridContainer.className = "w-fit";
		folderList.appendChild(gridContainer);
		const grid = document.createElement("div");
		grid.className = "container mx-auto grid my-6 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 gap-8";
		gridContainer.appendChild(mainTitle);
		gridContainer.appendChild(grid);
		
		// Display bookmarks in a single 4-column grid
		console.log("sortedBookmarks", sortedBookmarks);
		sortedBookmarks.forEach((bookmark) => {
			if (!bookmark.children) {
				if (
					containsSearchTerm(bookmark.bookmark.title, searchTerm) ||
					containsSearchTerm(bookmark.bookmark.url, searchTerm)
				) {
					if (FILTER_ID && bookmark.bookmark.parentId === FILTER_ID) {
						const bookmarkItem = createBookmarkCard(
							bookmark.bookmark
						);
						grid.appendChild(bookmarkItem);
					} else if (!FILTER_ID) {
						const bookmarkItem = createBookmarkCard(
							bookmark.bookmark
						);
						grid.appendChild(bookmarkItem);
					}
				}
			}
		});
	}

	// Event listener for toggle view button
	recentsViewButton.addEventListener("click", toggleView);
	folderViewButton.addEventListener("click", toggleView);
	filterDropdown.addEventListener("change", function (e) {
		FILTER_ID = e.target.value == "all" ? 0 : e.target.value;
		const searchTerm = searchInput.value.trim().toLowerCase();
		if (gridViewEnabled) {
			showGridView(searchTerm);
		} else {
			hideBookmarks(FILTER_ID);
		}
	});

	function hideBookmarks(id) {
		// Toggle visibility of all bookmarks
		const selectedFolderIdValue = id;
		const allFolders = document.querySelectorAll(".sublist-container");
		const noFolders = document.querySelectorAll(".no-folder-list");
		const allTitles = document.querySelectorAll("h2");

		// If FILTER_ID is 0 or "all", show everything
		if (id === 0 || id === "all") {
			allFolders.forEach(function (folder) {
				folder.style.display = "grid";
			});
			noFolders.forEach(function (folder) {
				folder.style.display = "grid";
			});
			allTitles.forEach(function (title) {
				title.style.display = "flex";
			});
			return; // Exit early when showing all
		}

		const selectedId = selectedFolderIdValue && computeId(selectedFolderIdValue);

		allFolders.forEach(function (folder) {
			if (
				!folder.id.includes(`-${selectedFolderIdValue}-`) &&
				!selectedId.includes(folder.id)
			) {
				folder.style.display = "none"; // Hide the selected folder
			} else {
				folder.style.display = "grid"; // Show other folders
			}
		});

		noFolders.forEach(function (folder) {
			if (!folder.id.includes(`-${selectedFolderIdValue}-`)) {
				folder.style.display = "none"; // Hide the selected folder
			} else {
				folder.style.display = "grid"; // Show other folders
			}
		});

		allTitles.forEach(function (title) {
			if (!title.id.includes(`-${selectedFolderIdValue}-`)) {
				title.style.display = "none"; // Hide the selected folder
			} else {
				title.style.display = "flex"; // Show other folders
			}
		});
	}

	// Array to store filter options
	let filterOptions = [{ label: "All", value: "all", level: 0, id: 0 }];

	// Populate array with folder names
	function populateFilterOptions(bookmarks, level = 0, id = "") {
		if (bookmarks && bookmarks.length > 0) {
			bookmarks.forEach(function (bookmark) {
				if (bookmark.children) {
					if (bookmark.title)
						filterOptions.push({
							label:
								`${level > 0 ? "-".repeat(level - 1) + " " : ""
								}` + bookmark.title,
							value: bookmark.id,
							level: level,
							id: id + "-" + bookmark.id + "-",
						});
					// Recursively populate filter options for child folders
					populateFilterOptions(
						bookmark.children,
						level + 1,
						id + "-" + bookmark.id
					);
				}
			});
		}
	}

	populateFilterOptions(bookmarks);
	console.log("filterOptions", filterOptions);

	// Create filter options
	filterOptions.forEach(function (option) {
		const filterOption = document.createElement("option");
		filterOption.value = option.value;
		filterOption.textContent = option.label;
		filterOption.className = "flex-center flex-col bg-zinc-100 w-44 h-32 rounded shadow-md text-zinc-800 text-sm font-normal cursor-pointer py-5";
		filterDropdown.appendChild(filterOption);
	});

	if (!folderList) {
		console.error("Unable to find 'folder-list' element");
		return;
	}

	if (!searchInput) {
		console.error("Unable to find 'search-input' element");
		return;
	}

	function filterBookmarks(bookmarks, searchTerm) {
		// Clear existing items in the folderList
		folderList.innerHTML = "";
		const mainTitle = document.createElement("h1");
		mainTitle.textContent = `Bookmarks (${sortedBookmarks.length})`;
		mainTitle.className = "flex-start w-full font-semibold text-lg py-2 text-zinc-800 dark:text-zinc-50";
		folderList.appendChild(mainTitle);
		if (bookmarks && bookmarks.length > 0) {
			const rootBookmark = bookmarks[0];
			rootBookmark.children.forEach(function (child) {
				if (child.children) {
					const folderListItem = createFolderList(child, searchTerm);
					if (folderListItem) {
						folderList.appendChild(folderListItem);
					}
				}
			});
			hideBookmarks(FILTER_ID);
		} else {
			console.warn("No bookmarks found");
			const noBookmarksMessage = document.createElement("p");
			noBookmarksMessage.textContent = "No bookmark folders found.";
			folderList.appendChild(noBookmarksMessage);
		}
		// hideBookmarks(FILTER_ID);
		// console.log("FILTER_ID", FILTER_ID);
	}

	function computeId(id) {
		const option = filterOptions.find((option) => option.value === id);
		if (!option) {
			console.warn(`No filter option found for bookmark ID: ${id}`);
			return `fallback-${id}`; // Return a fallback ID instead of throwing error
		}
		return option.id;
	}
	function createFolderList(
		bookmarkNode,
		searchTerm,
		sublistContainerClass,
		sublistGridClass,
		sublistTitleClass
	) {
		const listItem = document.createElement("div");
		
		// Safe ID computation with error handling
		try {
			listItem.id = computeId(bookmarkNode.id);
		} catch (error) {
			console.error("Error computing ID for bookmark:", bookmarkNode.title, error);
			listItem.id = `fallback-${bookmarkNode.id}`;
		}
		
		listItem.className =
			sublistContainerClass ||
			"flex-center flex-col m-auto gap-4";

		if (bookmarkNode.children && bookmarkNode.children.length > 0) {
			const matchingChildren = bookmarkNode.children.filter((child) => {
				if (child.children) {
					// Recursively check for matching children
					const subFolderList = createFolderList(
						child,
						searchTerm,
						"container w-full flex-center flex-col gap-3", // sublistContainerClass
						"container grid lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 w-full gap-8", // sublistGridClass
						"flex-start container w-full text-semibold text-zinc-600 text-lg py-2" // sublistTitleClass
					);
					return subFolderList !== null;
				} else {
					// Check if the child matches the search term
					return (
						(child.url &&
							containsSearchTerm(child.url, searchTerm)) ||
						containsSearchTerm(child.title, searchTerm)
					);
				}
			});

			// If there are matching children, create the folder list item
			if (matchingChildren.length > 0) {
				const folderTitle = document.createElement("h2");
				
				// Safe ID computation for folder title
				try {
					folderTitle.id = computeId(bookmarkNode.id);
				} catch (error) {
					console.error("Error computing ID for folder title:", bookmarkNode.title, error);
					folderTitle.id = `fallback-title-${bookmarkNode.id}`;
				}
				
				folderTitle.textContent =
					`${bookmarkNode.title} (${matchingChildren.length})` ||
					"Untitled";
				folderTitle.className =
					sublistTitleClass || "container flex-start w-full text-semibold text-zinc-600 text-lg py-2 dark:text-zinc-200";

				const subList = document.createElement("div");
				subList.className = sublistGridClass || "all-sublist-container";
				// if sublist className="all-sublist-container" add main title to beginning

				const noFolderList = document.createElement("div");
				
				// Safe ID computation for noFolderList
				try {
					const parentId = matchingChildren[0]?.parentId || bookmarkNode.id;
					noFolderList.id = computeId(parentId);
				} catch (error) {
					console.error("Error computing ID for noFolderList:", error);
					noFolderList.id = `fallback-nofolder-${bookmarkNode.id}`;
				}
				
				noFolderList.className =
					"no-folder-list container my-6 gap-x-8 gap-y-6 grid lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2 w-full ";

				let folders = [];

				matchingChildren.forEach((child) => {
					if (child.children) {
						const subFolderList = createFolderList(
							child,
							searchTerm,
							"sublist-container container w-full flex-center flex-col gap-3", // sublistContainerClass
							"", // sublistGridClass
							"sublist-title container flex-start w-full text-semibold text-zinc-600 dark:text-zinc-300 text-lg py-2" // sublistTitleClass
						);
						if (subFolderList) {
							folders.push(subFolderList);
						}
					} else {
						const bookmarkListItem = createBookmarkCard(
							child,
							searchTerm
						);
						noFolderList.appendChild(bookmarkListItem);
					}
				});
				subList.appendChild(folderTitle);
				subList.appendChild(noFolderList);
				folders.forEach((folder) => {
					subList.appendChild(folder);
				});

				listItem.appendChild(subList);

				return listItem;
			}
		}

		return null; // Return null if no matching items
	}

	function createBookmarkCard(bookmarkNode, searchTerm) {
		const card = document.createElement("div");
		card.className =
			"relative card min-w-60 flex flex-col border-[1.5px] bg-white border-zinc-200; dark:border-zinc-700 hover:border-indigo-500 hover:shadow-md hover:shadow-indigo-100 dark:hover:shadow-indigo-700 rounded-md overflow-hidden";

		const closeButton = document.createElement("button");
		closeButton.className =
			"absolute top-0 right-0 m-1 p-1 bg-zinc-500 hover:bg-zinc-600 dark:bg-zinc-700 dark:hover:bg-zinc-800 rounded-full border-none cursor-pointer close-button";
		closeButton.addEventListener("click", function (event) {
			event.stopPropagation(); // Prevent event from bubbling up to the parent
			showPopupMenu(event, bookmarkNode);
		});

		const closeIcon = document.createElement("img");
		closeIcon.src = "assets/icons/more.svg";
		closeIcon.alt = "Close";
		closeIcon.className = "h-4 w-4";

		// // Add event listeners for mouseenter and mouseleave to change the image src
		// closeIcon.addEventListener("mouseenter", function () {
		// 	closeIcon.src = "assets/icons/more-hover.svg"; // Change to hover image source
		// });

		// closeIcon.addEventListener("mouseleave", function () {
		// 	closeIcon.src = "assets/icons/more.svg"; // Change back to original image source
		// });

		closeButton.appendChild(closeIcon);
		card.appendChild(closeButton);

		const cardThumbnailSection = document.createElement("a");
		cardThumbnailSection.href = bookmarkNode.url;
		cardThumbnailSection.target = "_blank";
		cardThumbnailSection.className = "flex-center flex-col gap-3 card-thumbnail w-full h-40 border-b-[1.5px] bg-zinc-100 dark:bg-zinc-700 dark:border-zinc-600";

		// Retrieve the thumbnail image URL from local storage

		getThumbnailUrl(bookmarkNode.url, function (thumbnailUrl) {
			const thumbnailImg = document.createElement("img");
			thumbnailImg.src = thumbnailUrl;
			thumbnailImg.alt = bookmarkNode.url || "Bookmark thumbnail";
			// thumbnailImg.className = "rounded-t-md";
			cardThumbnailSection.appendChild(thumbnailImg);

			// Update the thumbnail in the DOM
			updateThumbnail(bookmarkNode.title, thumbnailUrl); // Move the updateThumbnail call here

			// If no thumbnail is available, add a "Capture" button
			if (
				thumbnailUrl.startsWith(
					"https://www.google.com/s2/favicons?domain="
				)
			) {
				const captureButton = document.createElement("button");
				captureButton.textContent = "Capture Thumbnail";
				captureButton.className = "text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-900 font-semibold py-2 px-4 border shadow rounded-full";
				captureButton.id = "capture-" + bookmarkNode.url;
				captureButton.addEventListener("click", function (event) {
					event.preventDefault();
					captureScreenshot(bookmarkNode.url, bookmarkNode.title);
					// Remove the capture button after capturing the screenshot
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
					console.log(
						"Date last used updated for bookmark:",
						bookmark
					);
					break;
				}
			}
			// window.location.reload();
		});

		const cardDetailsSection = document.createElement("div");
		cardDetailsSection.className =
			"flex-center h-24 flex-col bg-white dark:bg-zinc-800 px-2 py-4";

		const bookmarkLinkDiv = document.createElement("div");
		bookmarkLinkDiv.className = "flex-start w-full h-5";

		const bookmarkLink = document.createElement("a");
		bookmarkLink.className =
			"flex-start text-base font-medium text-zinc-800 dark:text-zinc-50";
		bookmarkLink.href = bookmarkNode.url;
		bookmarkLink.target = "_blank";
		bookmarkLink.innerHTML = highlightText(
			bookmarkNode.title || "Untitled",
			(searchTerm = "")
			//!temporary fix
		);
		bookmarkLinkDiv.appendChild(bookmarkLink);

		bookmarkLink.addEventListener("click", function (event) {
			console.log("clicked");
			const clickedTime = new Date().getTime();
			for (const bookmark of allBookmarks) {
				if (bookmark.bookmark.id === bookmarkNode.id) {
					bookmark.bookmark.dateLastUsed = clickedTime;
					console.log(
						"Date last used updated for bookmark:",
						bookmark
					);
					break;
				}
			}
			// window.location.reload();
		});

		cardDetailsSection.appendChild(bookmarkLinkDiv);

		// Wait for the element to be rendered
		setTimeout(() => {
			// Get the width of the bookmark link
			const bookmarkLinkWidth = bookmarkLink.offsetWidth;

			// Apply text-scroll class if width is above 216px
			if (bookmarkLinkWidth > 216) {
				bookmarkLinkDiv.classList.add("text-scroll");
			}
		}, 0); // Using setTimeout with 0ms delay to ensure the element is rendered before calculating its width
		const bookmarkURLDiv = document.createElement("div");
		bookmarkURLDiv.className = "flex-start w-full h-5 overflow-hidden"; // Set overflow to hidden
		const bookmarkURL = document.createElement("p");
		bookmarkURL.className = "flex-start text-zinc-800 dark:text-zinc-300 whitespace-nowrap";
		bookmarkURL.title = bookmarkNode.url; // Set title attribute to display complete URL on hover

		const url = new URL(bookmarkNode.url);
		let trimmedURL = url.hostname.replace(/^www\./, ""); // Remove 'www.' from the beginning of the hostname
		const pathname = url.pathname; // Get the pathname part of the URL

		// If the pathname is not empty, append it to the trimmed URL
		if (pathname && pathname !== "/") {
			// Add the text-slate-400 class to the additional routes
			trimmedURL += `<span class="text-zinc-400 whitespace-nowrap">${pathname}</span>`;
		}

		bookmarkURL.innerHTML = `${highlightText(trimmedURL, searchTerm)}`;
		bookmarkURLDiv.appendChild(bookmarkURL);

		cardDetailsSection.appendChild(bookmarkURLDiv);

		// If gridViewEnabled add tag to bottom of cardDetailsSection
		if (gridViewEnabled) {
			const folderName =
				filterOptions
					.find((option) => option.value === bookmarkNode.parentId)
					?.label.replace(/^[-\s]+/, "") || "";
			const tagContainer = document.createElement("div");
			tagContainer.className = "flex-start w-full mt-1";
			cardDetailsSection.appendChild(tagContainer);
			const tagText = document.createElement("span");
			tagText.textContent = folderName;
			tagText.className = "flex-center w-fit h-5 px-1 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-50 border border-zinc-300 dark:border-zinc-600";
			tagContainer.appendChild(tagText);
		}

		card.appendChild(cardThumbnailSection);
		card.appendChild(cardDetailsSection);

		return card;
	}

	function captureScreenshot(url, title) {
		if (!url) {
			console.error("URL is empty");
			return;
		}

		// Open a new window with the specified dimensions
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

				// Wait for the window to finish loading before capturing the screenshot
				chrome.tabs.onUpdated.addListener(function listener(
					tabId,
					changeInfo
				) {
					if (tabId === tabId && changeInfo.status === "complete") {
						// Remove the listener
						chrome.tabs.onUpdated.removeListener(listener);

						// Set a timeout before capturing the screenshot
						setTimeout(function () {
							// Capture screenshot of the tab
							chrome.tabs.captureVisibleTab(
								window.id,
								{ format: "png" },
								function (dataUrl) {
									if (dataUrl) {
										// Compress the image
										compressImage(
											dataUrl,
											100, // Target size in KB
											function (compressedDataUrl) {
												// Save the compressed screenshot in local storage
												saveScreenshotToLocalStorage(
													url,
													compressedDataUrl
												);
												// Update the thumbnail in the DOM
												updateThumbnail(
													url,
													compressedDataUrl
												);
											}
										);
									} else {
										console.error(
											"Failed to capture screenshot for URL:",
											url
										);
									}
									// Close the window after capturing screenshot
									chrome.windows.remove(window.id);
								}
							);
						}, 1000); // Set timeout to 1000 milliseconds (adjust as needed)
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

			// Set canvas dimensions to the desired size
			canvas.width = 1024;
			canvas.height = 683;

			// Draw image onto canvas
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

			// Initialize compression quality
			let compressionQuality = 1.0; // Start with maximum quality

			// Compress the image until it meets the target size
			while (true) {
				// Convert canvas to data URL with current compression quality
				const dataUrl = canvas.toDataURL(
					"image/jpeg",
					compressionQuality
				);

				// Calculate the size of the compressed image
				const compressedSizeKB = dataUrl.length / 1024;

				// Check if the compressed size meets the target size
				if (
					compressedSizeKB <= targetSizeKB ||
					compressionQuality <= 0.1
				) {
					// If the compressed size is within the target or compression quality is low enough, stop compression
					callback(dataUrl);
					break;
				} else {
					// Decrease the compression quality for further compression
					compressionQuality -= 0.1; // Decrease by 0.1 (adjust as needed)
				}
			}
		};
	}

	function saveScreenshotToLocalStorage(url, dataUrl) {
		const key = url;
		const value = dataUrl;
		// Save the screenshot in local storage
		chrome.storage.local.set({ [key]: value }, function () {
			if (chrome.runtime.lastError) {
				console.error(chrome.runtime.lastError.message);
			}
		});
	}

	function getThumbnailUrl(url, callback) {
		// Retrieve the thumbnail URL from local storage
		const key = url;
		chrome.storage.local.get([key], function (result) {
			if (chrome.runtime.lastError) {
				// Suppress storage errors - just use favicon fallback
				callback(`https://www.google.com/s2/favicons?domain=${url}`);
			} else {
				const dataUrl = result[key];
				if (dataUrl) {
					callback(dataUrl);
				} else {
					// Suppress "not found" logs - just use favicon fallback
					callback(
						`https://www.google.com/s2/favicons?domain=${url}`
					);
				}
			}
		});
	}

	function updateThumbnail(url, dataUrl) {
		// Find the thumbnail element by comparing the bookmarkNode title with the alt attribute of the img tag
		const thumbnailImg = document.querySelector(`img[alt='${url}']`);
		if (thumbnailImg) {
			// Update the src attribute with the new screenshot data URL
			thumbnailImg.src = dataUrl;
		} else {
			console.error("Thumbnail image element not found for title:", url);
		}
	}

	function containsSearchTerm(text, searchTerm) {
		// Split the search term into individual words
		const searchTerms = searchTerm.split(" ");

		// Check if all individual words are present in the text
		return searchTerms.every((term) => text.toLowerCase().includes(term));
	}

	function highlightText(text, searchTerm) {
		if (!searchTerm) {
			return text; // Return plain text if no search term
		}

		const regex = new RegExp(`(${searchTerm})`, "gi");
		return text.replace(
			regex,
			(match, p1) =>
				`<span style="background-color: yellow; padding: 0; margin: 0;">${p1}</span>`
		);
	}

	function deleteBookmark(bookmarkNode) {
		const key = bookmarkNode.url;
		chrome.bookmarks.remove(bookmarkNode.id, function () {
			console.log(`Deleted bookmark: ${bookmarkNode.title}`);

			// Remove the corresponding thumbnail from local storage
			chrome.storage.local.remove([key], function () {
				console.log(
					`Deleted screenshot for bookmark: ${bookmarkNode.title}`
				);

				// After deletion, re-fetch bookmarks and update the DOM
				chrome.bookmarks.getTree(function (newBookmarks) {
					filterBookmarks(
						newBookmarks,
						searchInput.value.trim().toLowerCase()
					);
				});
			});
		});
	}

	document.getElementById("save-edit").addEventListener("click", function () {
		const editTitleInput = document.getElementById("edit-title");
		const editUrlInput = document.getElementById("edit-url");
		const newTitle = editTitleInput.value.trim();
		const newUrl = editUrlInput.value.trim();
		const folderDropdown = document.getElementById("folder-dropdown");
		const selectedFolderId = folderDropdown.value; // Get the selected folder id

		if (newTitle || newUrl || selectedFolderId) {
			chrome.bookmarks.move(
				currentBookmarkNode.id,
				{ parentId: selectedFolderId },
				function (result) {
					if (chrome.runtime.lastError) {
						console.error(
							"Failed to move bookmark:",
							chrome.runtime.lastError.message
						);
					} else if (!result) {
						console.error(
							"Failed to move bookmark: Unknown error."
						);
					} else {
						chrome.bookmarks.update(
							currentBookmarkNode.id,
							{ title: newTitle, url: newUrl },
							function () {
								window.location.reload();
							}
						);
					}
				}
			);
		} else {
			console.error("Invalid input or selected folder.");
		}
	});

	// Event listener for cancelling edit in the edit modal
	document
		.getElementById("cancel-edit")
		.addEventListener("click", function () {
			closeEditModal();
		});

	let currentBookmarkNode = null;
	function openEditModal(bookmarkNode) {
		const editModal = document.getElementById("edit-modal");
		const editTitleInput = document.getElementById("edit-title");
		const editUrlInput = document.getElementById("edit-url");

		editTitleInput.value = bookmarkNode.title || "";
		editUrlInput.value = bookmarkNode.url || "";

		editModal.classList.remove("hidden");
	}

	// Function to close the edit modal
	function closeEditModal() {
		const editModal = document.getElementById("edit-modal");
		editModal.classList.add("hidden");
	}

	let currentPopupMenu = null;

	function showPopupMenu(event, bookmarkNode) {
		if (currentPopupMenu) {
			currentPopupMenu.remove();
		}
		currentBookmarkNode = bookmarkNode;
		// Find the filter dropdown select element
		const folderDropdown = document.getElementById("folder-dropdown");

		// Create filter options
		// append children only if folderDropdown has no children
		folderDropdown.children.length ||
			filterOptions.slice(1).forEach(function (option) {
				const filterOption = document.createElement("option");
				filterOption.value = option.value;
				filterOption.textContent = option.label;
				filterOption.selected =
					option.value === currentBookmarkNode.parentId;
				folderDropdown.appendChild(filterOption);
			});
		// Check if a popup menu is already open and if the same button is clicked again
		if (
			currentPopupMenu &&
			currentPopupMenu.previousElementSibling === event.target
		) {
			currentPopupMenu.remove();
			currentPopupMenu = null;
			return;
		}

		if (currentPopupMenu) {
			closePopupMenu(); // Call closePopupMenu to remove the event listener
			return;
		}

		const popupMenu = document.createElement("div");
		popupMenu.className = "absolute z-10 flex flex-col bg-zinc-800 w-44 h-32 rounded shadow-md text-zinc-100 hover:text-zinc-50 text-sm font-light flex-center flex-col";

		function createIconButton(text, iconSrc, buttonClassName, onClick) {
			const buttonContainer = document.createElement("div");
			buttonContainer.className = "flex-start w-full h-9 px-3 py-1.5 hover:bg-zinc-700 active:bg-zinc-700";
			const icon = document.createElement("img");
			icon.src = iconSrc;
			icon.alt = text;
			icon.className = "w-4 h-4 mr-3"; // Adjust size and margin as needed
			buttonContainer.appendChild(icon);

			const button = document.createElement("button");
			button.textContent = text;
			button.className = buttonClassName || "flex-start text-left";
			button.addEventListener("click", onClick);
			buttonContainer.appendChild(button);

			return buttonContainer;
		}
		getThumbnailUrl(bookmarkNode.url, function (thumbnailUrl) {
			const buttonText = thumbnailUrl.startsWith(
				"https://www.google.com/s2/favicons?domain="
			)
				? "Capture Thumbnail"
				: "Refresh Thumbnail";

			const captureButton = createIconButton(
				buttonText,
				"assets/icons/camera.svg",
				null,
				function (event) {
					event.preventDefault();
					captureScreenshot(bookmarkNode.url, bookmarkNode.title);
					document
						.getElementById(`capture-${bookmarkNode.url}`)
						.remove();
					closePopupMenu();
				}
			);
			popupMenu.appendChild(captureButton);

			const editButton = createIconButton(
				"Edit",
				"assets/icons/edit.svg",
				null,
				function (event) {
					closePopupMenu();
					event.preventDefault();
					openEditModal(bookmarkNode);
				}
			);
			popupMenu.appendChild(editButton);

			const deleteButton = createIconButton(
				"Delete",
				"assets/icons/trash.svg",
				"flex-grow text-left",
				function (event) {
					event.preventDefault();
					if (
						confirm(
							"Are you sure you want to delete this bookmark?"
						)
					) {
						deleteBookmark(bookmarkNode);
					}
					closePopupMenu();
				}
			);
			popupMenu.appendChild(deleteButton);
		});

		// Position the popup menu relative to the clicked button
		const rect = event.target.getBoundingClientRect();
		popupMenu.style.top = `${rect.bottom + window.scrollY + 4}px`;
		popupMenu.style.right = `${window.innerWidth - rect.right - 4}px`;

		document.body.appendChild(popupMenu);
		currentPopupMenu = popupMenu;

		// Close the popup menu when clicking anywhere else on the screen
		function closePopupMenu() {
			if (currentPopupMenu) {
				currentPopupMenu.remove();
				currentPopupMenu = null;
				document.removeEventListener("click", closePopupMenu);
			}
		}
		document.addEventListener("click", closePopupMenu);

		// Prevent closing the popup menu when clicking on the same button again
		event.stopPropagation();
	}

	showGridView("");
});