(function applyHelpLocale() {
  var copy = window.HELP_COPY;
  if (!copy || typeof copy !== 'object') {
    return;
  }

  var params = new URLSearchParams(window.location.search);
  var lang = params.get('lang') === 'en' ? 'en' : 'bg';
  var strings = copy[lang] || copy.bg;
  if (!strings) {
    return;
  }

  document.documentElement.lang = lang;

  if (strings.documentTitle) {
    document.title = strings.documentTitle;
  }

  document.querySelectorAll('[data-i18n]').forEach(function (node) {
    var key = node.getAttribute('data-i18n');
    if (!key || strings[key] == null) {
      return;
    }
    node.textContent = strings[key];
  });
})();
