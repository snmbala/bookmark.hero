// Safari-compatible background.js — no chrome.windows or captureVisibleTab

function T(){
  if(typeof browser!=="undefined"&&browser.action){
    browser.action.setPopup({popup:"main.html?mode=popover"});
  } else if(typeof chrome!=="undefined"&&chrome.action){
    chrome.action.setPopup({popup:"main.html?mode=popover"});
  }
}
T();
if(typeof chrome!=="undefined"&&chrome.runtime){
  chrome.runtime.onStartup.addListener(T);
  chrome.runtime.onInstalled.addListener(T);
}

// Prune orphaned thumbnails from storage
function I(){
  var api=typeof browser!=="undefined"&&browser.bookmarks?browser:chrome;
  if(!api||!api.bookmarks||!api.bookmarks.getTree)return;
  var n=setTimeout(function(){console.warn("pruneOrphanedThumbnails timed out after 5 seconds")},5e3);
  api.bookmarks.getTree(function(t){
    if((chrome.runtime&&chrome.runtime.lastError)||(typeof browser!=="undefined"&&browser.runtime&&browser.runtime.lastError)){
      clearTimeout(n);return;
    }
    if(!t){clearTimeout(n);return;}
    var o=new Set();
    function s(i){for(var a=0;a<i.length;a++){if(i[a].url)o.add(i[a].url);if(i[a].children)s(i[a].children);}}
    try{s(t)}catch(e){clearTimeout(n);return;}
    chrome.storage.local.get(null,function(i){
      if(chrome.runtime.lastError){clearTimeout(n);return;}
      var a=Object.keys(i).filter(function(r){return!o.has(r)});
      if(a.length>0){chrome.storage.local.remove(a,function(){clearTimeout(n)})}
      else{clearTimeout(n)}
    });
  });
}

// Listen for bookmark removal to clean up thumbnails
if(typeof chrome!=="undefined"&&chrome.bookmarks&&chrome.bookmarks.onRemoved){
  chrome.bookmarks.onRemoved.addListener(function(n,t){
    if(t.node&&t.node.url){chrome.storage.local.remove(t.node.url)}
  });
}

if(typeof chrome!=="undefined"&&chrome.runtime){
  chrome.runtime.onStartup.addListener(I);
  chrome.runtime.onInstalled.addListener(I);
}

// Note: Auto-capture on bookmark creation is disabled in Safari
// (chrome.windows.create and chrome.tabs.captureVisibleTab are not available)
