// Runs synchronously in <head> before body is parsed.
// Sets data-mode="popover" on <html> so the CSS rule hides the normal layout
// instantly — no flash of the header/main/footer in popover mode.
(function () {
  if (new URLSearchParams(location.search).get('mode') === 'popover') {
    document.documentElement.dataset.mode = 'popover';
  }
}());
