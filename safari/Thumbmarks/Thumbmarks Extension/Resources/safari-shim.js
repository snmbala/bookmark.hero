// Safari Web Extension compatibility shim.
// Makes callback-style chrome.* calls work even when Safari exposes promise APIs.
(function () {
  var g = typeof globalThis !== 'undefined' ? globalThis : window;
  var b = typeof g.browser !== 'undefined' ? g.browser : null;
  if (!g.chrome) g.chrome = {};
  var c = g.chrome;

  function adaptMethodWithCallback(targetObj, methodName) {
    if (!targetObj || typeof targetObj[methodName] !== 'function') return;
    var original = targetObj[methodName].bind(targetObj);

    targetObj[methodName] = function () {
      var args = Array.prototype.slice.call(arguments);
      var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
      var result;

      // First try promise-style invocation (no callback arg).
      try {
        result = original.apply(null, args);
      } catch (err1) {
        // If that fails and we do have a callback, retry callback-style.
        if (callback) {
          try {
            return original.apply(null, args.concat(callback));
          } catch (err2) {
            console.error('Safari shim method error:', methodName, err2);
            callback(undefined);
            return undefined;
          }
        }
        throw err1;
      }

      if (!callback) return result;

      // Promise-returning API: bridge to callback.
      if (result && typeof result.then === 'function') {
        result.then(
          function (value) { callback(value); },
          function (err) {
            console.error('Safari shim promise error:', methodName, err);
            callback(undefined);
          }
        );
        return result;
      }

      // Callback-style API may have ignored our first call; retry with callback.
      try {
        return original.apply(null, args.concat(callback));
      } catch (err3) {
        console.error('Safari shim callback retry error:', methodName, err3);
        callback(undefined);
        return result;
      }
    };
  }

  function copyEvents(fromObj, toObj, names) {
    if (!fromObj || !toObj) return;
    names.forEach(function (name) {
      if (fromObj[name]) toObj[name] = fromObj[name];
    });
  }

  // Ensure bookmark APIs exist on chrome.* and callback paths work.
  if (!c.bookmarks) c.bookmarks = {};
  if (b && b.bookmarks) {
    ['getTree', 'get', 'create', 'update', 'move', 'remove', 'removeTree', 'search'].forEach(function (m) {
      if (typeof b.bookmarks[m] === 'function' && !c.bookmarks[m]) c.bookmarks[m] = b.bookmarks[m].bind(b.bookmarks);
    });
    copyEvents(b.bookmarks, c.bookmarks, ['onCreated', 'onRemoved', 'onMoved', 'onChanged']);
  }
  ['getTree', 'get', 'create', 'update', 'move', 'remove', 'removeTree', 'search'].forEach(function (m) {
    adaptMethodWithCallback(c.bookmarks, m);
  });

  // Safari may not expose bookmarks API at all.
  // In that case, back chrome.bookmarks with a native Swift store.
  function createEvent() {
    var listeners = [];
    return {
      addListener: function (fn) {
        if (typeof fn !== 'function' || listeners.indexOf(fn) !== -1) return;
        listeners.push(fn);
      },
      removeListener: function (fn) {
        listeners = listeners.filter(function (l) { return l !== fn; });
      },
      hasListener: function (fn) {
        return listeners.indexOf(fn) !== -1;
      },
      _emit: function () {
        var args = arguments;
        listeners.slice().forEach(function (fn) {
          try { fn.apply(null, args); } catch (err) { console.error('Event listener error:', err); }
        });
      }
    };
  }

  if (typeof c.bookmarks.getTree !== 'function') {
    c.bookmarks.onCreated = c.bookmarks.onCreated || createEvent();
    c.bookmarks.onRemoved = c.bookmarks.onRemoved || createEvent();
    c.bookmarks.onMoved = c.bookmarks.onMoved || createEvent();
    c.bookmarks.onChanged = c.bookmarks.onChanged || createEvent();

    function withCallback(promise, cb) {
      if (typeof cb === 'function') {
        promise.then(function (value) { cb(value); }, function (err) {
          console.error('Native bookmarks error:', err);
          cb(undefined);
        });
      }
      return promise;
    }

    function sendNativeMessage(message) {
      var rt = (c.runtime && c.runtime.sendNativeMessage && c.runtime)
        || (b && b.runtime && b.runtime.sendNativeMessage && b.runtime)
        || null;

      if (!rt || typeof rt.sendNativeMessage !== 'function') {
        return Promise.reject(new Error('sendNativeMessage is unavailable'));
      }

      // Safari may support one-arg or two-arg variants; try both.
      function tryOneArg() {
        try {
          var p = rt.sendNativeMessage(message);
          return Promise.resolve(p);
        } catch (e) {
          return Promise.reject(e);
        }
      }

      function tryTwoArg(appId) {
        try {
          var p = rt.sendNativeMessage(appId, message);
          return Promise.resolve(p);
        } catch (e) {
          return Promise.reject(e);
        }
      }

      return tryOneArg().catch(function () {
        return tryTwoArg('com.thumbmarks.Thumbmarks').catch(function () {
          return tryTwoArg('com.thumbmarks.Thumbmarks.Extension');
        });
      });
    }

    function callNative(action, payload) {
      return sendNativeMessage({ action: action, payload: payload || {} }).then(function (resp) {
        if (!resp || resp.ok !== true) {
          throw new Error(resp && resp.error ? resp.error : 'Native bookmark bridge failed');
        }
        return resp.result;
      });
    }

    c.bookmarks.getTree = function (cb) {
      return withCallback(callNative('bookmarks.getTree'), cb);
    };

    c.bookmarks.get = function (id, cb) {
      return withCallback(callNative('bookmarks.get', { id: String(id) }), cb);
    };

    c.bookmarks.search = function (query, cb) {
      return withCallback(callNative('bookmarks.search', { query: String(query || '') }), cb);
    };

    c.bookmarks.create = function (bookmark, cb) {
      var body = bookmark || {};
      var p = callNative('bookmarks.create', {
        parentId: body.parentId,
        title: body.title,
        url: body.url,
        index: body.index
      }).then(function (created) {
        if (c.bookmarks.onCreated && c.bookmarks.onCreated._emit) {
          c.bookmarks.onCreated._emit(created.id, created);
        }
        return created;
      });
      return withCallback(p, cb);
    };

    c.bookmarks.update = function (id, changes, cb) {
      var p = callNative('bookmarks.update', {
        id: String(id),
        title: changes && changes.title,
        url: changes && changes.url
      }).then(function (updated) {
        if (c.bookmarks.onChanged && c.bookmarks.onChanged._emit) {
          c.bookmarks.onChanged._emit(updated.id, { title: updated.title, url: updated.url });
        }
        return updated;
      });
      return withCallback(p, cb);
    };

    c.bookmarks.move = function (id, destination, cb) {
      var p = callNative('bookmarks.move', {
        id: String(id),
        parentId: destination && destination.parentId,
        index: destination && destination.index
      }).then(function (moved) {
        if (c.bookmarks.onMoved && c.bookmarks.onMoved._emit) {
          c.bookmarks.onMoved._emit(moved.id, { parentId: moved.parentId, index: moved.index || 0 });
        }
        return moved;
      });
      return withCallback(p, cb);
    };

    c.bookmarks.remove = function (id, cb) {
      var nodeId = String(id);
      var p = callNative('bookmarks.remove', { id: nodeId }).then(function () {
        if (c.bookmarks.onRemoved && c.bookmarks.onRemoved._emit) {
          c.bookmarks.onRemoved._emit(nodeId, { parentId: null, index: 0, node: { id: nodeId } });
        }
        return undefined;
      });
      return withCallback(p, cb);
    };

    c.bookmarks.removeTree = function (id, cb) {
      var nodeId = String(id);
      var p = callNative('bookmarks.removeTree', { id: nodeId }).then(function () {
        if (c.bookmarks.onRemoved && c.bookmarks.onRemoved._emit) {
          c.bookmarks.onRemoved._emit(nodeId, { parentId: null, index: 0, node: { id: nodeId } });
        }
        return undefined;
      });
      return withCallback(p, cb);
    };
  }

  // Storage APIs.
  if (!c.storage) c.storage = {};
  ['sync', 'local'].forEach(function (area) {
    if (!c.storage[area]) c.storage[area] = {};
    if (b && b.storage && b.storage[area]) {
      ['get', 'set', 'remove', 'clear', 'getBytesInUse'].forEach(function (m) {
        if (typeof b.storage[area][m] === 'function' && !c.storage[area][m]) {
          c.storage[area][m] = b.storage[area][m].bind(b.storage[area]);
        }
      });
    }
    ['get', 'set', 'remove', 'clear', 'getBytesInUse'].forEach(function (m) {
      adaptMethodWithCallback(c.storage[area], m);
    });

    if (typeof c.storage[area].getBytesInUse !== 'function') {
      c.storage[area].getBytesInUse = function (keys, cb) {
        if (typeof cb === 'function') cb(0);
      };
    }
  });
  if (!c.storage.onChanged && b && b.storage && b.storage.onChanged) {
    c.storage.onChanged = b.storage.onChanged;
  }

  // Tabs APIs used by the extension.
  if (!c.tabs) c.tabs = {};
  if (b && b.tabs) {
    ['update', 'sendMessage'].forEach(function (m) {
      if (typeof b.tabs[m] === 'function' && !c.tabs[m]) c.tabs[m] = b.tabs[m].bind(b.tabs);
    });
    if (!c.tabs.onUpdated && b.tabs.onUpdated) c.tabs.onUpdated = b.tabs.onUpdated;
  }
  ['update', 'sendMessage'].forEach(function (m) {
    adaptMethodWithCallback(c.tabs, m);
  });

  // Action/runtime fallbacks.
  if (!c.action) c.action = {};
  if (b && b.action && typeof b.action.setPopup === 'function' && !c.action.setPopup) {
    c.action.setPopup = b.action.setPopup.bind(b.action);
  }
  adaptMethodWithCallback(c.action, 'setPopup');

  if (!c.runtime) c.runtime = {};
  if (b && b.runtime) {
    if (!c.runtime.getURL && typeof b.runtime.getURL === 'function') c.runtime.getURL = b.runtime.getURL.bind(b.runtime);
    if (!c.runtime.getManifest && typeof b.runtime.getManifest === 'function') c.runtime.getManifest = b.runtime.getManifest.bind(b.runtime);
    if (!c.runtime.id && b.runtime.id) c.runtime.id = b.runtime.id;
    copyEvents(b.runtime, c.runtime, ['onMessage', 'onStartup', 'onInstalled']);
  }
})();
