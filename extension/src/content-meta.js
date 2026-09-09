(function() {
  function extractMetaDescription() {
    try {
      const og = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
      const twitter = document.querySelector('meta[name="twitter:description"]')?.getAttribute('content');
      const meta = document.querySelector('meta[name="description"]')?.getAttribute('content');
      const text = (og || twitter || meta || '').trim();
      return text.slice(0, 500);
    } catch {
      return '';
    }
  }

  function reportMeta() {
    const description = extractMetaDescription();
    const url = window.location.href;
    if (!description || !url || !/^https?:\/\//i.test(url)) return;

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'page-meta',
          url,
          title: (document.title || '').trim().slice(0, 300),
          description,
        }).catch(() => {});
      }
    } catch {
      // Extension context might be unloaded or invalidated
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    reportMeta();
  } else {
    window.addEventListener('DOMContentLoaded', reportMeta, { once: true });
  }
})();
