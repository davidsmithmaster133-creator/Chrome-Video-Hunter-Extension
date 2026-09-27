(function() {
  'use strict';
  if (window.__videoHunterContentLoaded) return;
  window.__videoHunterContentLoaded = true;
  let enabledMediaTypes = { video: true, audio: true, image: true };
  let enabledMediaFormats = Object.fromEntries(Object.entries(VideoHunterMediaFormats.groups).map(([category, formats]) => [category, [...formats]]));
  function normalizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let normalized = url.trim();
    normalized = normalized.replace(/\?([^&]*&)*(utm_[^&]+|ref|source|fbclid|gclid|msclkid|dclid|reddit|[&?]t=[^&]+)(?:&|$)/gi, '');
    normalized = normalized.replace(/[&?]$/, '');
    normalized = normalized.split('#')[0];
    return normalized;
  }
  function isDuplicate(existingLinks, newUrl) {
    const normalized = normalizeUrl(newUrl);
    if (!normalized) return true;
    for (const existing of existingLinks) if (normalizeUrl(existing) === normalized) return true;
    return false;
  }
  function deduplicateLinks(links) {
    const seen = new Map();
    const result = [];
    for (const link of links) {
      if (!link || typeof link !== 'string') continue;
      const normalized = normalizeUrl(link);
      if (!normalized) continue;
      if (!seen.has(normalized)) { seen.set(normalized, true); result.push(link); }
    }
    return result;
  }
  function isVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    const skip = ['.js','.css','.json','.html','.php','.asp','.webmanifest','.manifest','video.min.js','.png','.jpg','.jpeg','.gif','.svg','.ico'];
    if (skip.some(s => trimmed.toLowerCase().includes(s))) return false;
    const lower = trimmed.toLowerCase();
    const extension = VideoHunterMediaFormats.extensionFor(trimmed);
    if (lower.startsWith('blob:')) return VideoHunterMediaFormats.hasEnabledFormats('video', enabledMediaFormats);
    if (lower.startsWith('data:video/')) return VideoHunterMediaFormats.isExtensionEnabled(extension, enabledMediaFormats, 'video');
    return VideoHunterMediaFormats.isExtensionEnabled(extension, enabledMediaFormats, 'video')
      && VideoHunterMediaFormats.groups.video.includes(extension);
  }
  function isAudioUrl(url) {
    if (typeof url !== 'string') return false;
    const extension = VideoHunterMediaFormats.extensionFor(url);
    return VideoHunterMediaFormats.isExtensionEnabled(extension, enabledMediaFormats, 'audio')
      && VideoHunterMediaFormats.groups.audio.includes(extension);
  }
  function isImageUrl(url) {
    if (typeof url !== 'string') return false;
    const extension = VideoHunterMediaFormats.extensionFor(url);
    return VideoHunterMediaFormats.isExtensionEnabled(extension, enabledMediaFormats, 'image')
      && VideoHunterMediaFormats.groups.image.includes(extension);
  }
  function isMediaUrl(url) {
    return (enabledMediaTypes.video && isVideoUrl(url))
      || (enabledMediaTypes.video && VideoHunterMediaFormats.hasEnabledFormats('video', enabledMediaFormats)
        && typeof VideoHunterSites !== 'undefined' && VideoHunterSites.isStreamingPageUrl(url))
      || (enabledMediaTypes.audio && isAudioUrl(url))
      || (enabledMediaTypes.image && isImageUrl(url));
  }

  function interceptVideoRequests() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0];
      if (url && isMediaUrl(url.toString())) sendLink(url.toString());
      return originalFetch.apply(this, args);
    };
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      if (url && isMediaUrl(url.toString())) sendLink(url.toString());
      return originalXHROpen.call(this, method, url, ...rest);
    };
  }

  function detectMediaSourceVideos() {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(obj) {
      const url = originalCreateObjectURL.call(this, obj);
      if (obj && obj.type && /^(video|audio|image)\//.test(obj.type)) {
        sendLink(url);
        setTimeout(() => scanAndSend(), 100);
      }
      return url;
    };
    const originalMediaSource = window.MediaSource;
    if (originalMediaSource) {
      window.MediaSource = function() {
        const ms = new originalMediaSource();
        const originalAddSourceBuffer = ms.addSourceBuffer;
        ms.addSourceBuffer = function(type) {
          setTimeout(() => scanAndSend(), 200);
          return originalAddSourceBuffer.call(this, type);
        };
        return ms;
      };
      window.MediaSource.prototype = originalMediaSource.prototype;
    }
  }

  function scanScriptsEnhanced() {
    const set = new Set();
    const mediaExtensions = Object.values(VideoHunterMediaFormats.groups).flat().join('|');
    const mediaPattern = new RegExp(String.raw`(?:https?:\/\/[^\s<>"']+\.(?:${mediaExtensions})(?:[?#][^\s<>"']*)?|blob:[^\s<>"']+)`, 'gi');
    for (const script of document.querySelectorAll('script')) {
      const content = script.textContent || script.innerText;
      if (!content) continue;
      const videoUrls = content.match(mediaPattern);
      if (videoUrls) for (const url of videoUrls) if (isMediaUrl(url)) set.add(url.trim());
      try {
        const jsonMatches = content.match(/\{[^{}]*?"(?:src|video|url|file|source|sources|videoUrl|poster|data|link|href|path|location|srcset|data-src|data-video|data-url|data-file|data-href|data-poster)"\s*:\s*"[^"]*"/gi);
        if (jsonMatches) {
          for (const jsonStr of jsonMatches) {
            try {
              const fixedJson = jsonStr.match(/\{.*\}/);
              if (fixedJson) {
                const obj = JSON.parse(fixedJson[0]);
                for (const val of Object.values(obj)) {
                  if (typeof val === 'string' && isMediaUrl(val)) set.add(val.trim());
                  if (Array.isArray(val)) for (const item of val) {
                    if (typeof item === 'string' && isMediaUrl(item)) set.add(item.trim());
                    if (item && typeof item === 'object') for (const nested of Object.values(item)) if (typeof nested === 'string' && isMediaUrl(nested)) set.add(nested.trim());
                  }
                }
              }
            } catch (e) {}
          }
        }
        const objectMatches = content.match(/(?:src|video|url|file|source|sources|videoUrl)\s*:\s*['"]([^'"]+)['"]/gi);
        if (objectMatches) for (const match of objectMatches) {
          const urlMatch = match.match(/['"]([^'"]+)['"]/);
          if (urlMatch && isMediaUrl(urlMatch[1])) set.add(urlMatch[1].trim());
        }
      } catch (e) {}
    }
    return Array.from(set);
  }

  function scanDOM() {
    const set = new Set();
    const urlAttrs = ['src','href','poster','data-src','data-video','data-video-url','data-file','data-url','data-href','data-poster','data-srcset','data-background','data-cover','data-player-url','data-video-src','data-video-id','data-video-file','data-source','data-video-link'];
    for (const el of document.querySelectorAll('*')) {
      for (const attr of urlAttrs) {
        const val = el.getAttribute(attr);
        if (val && isMediaUrl(val)) {
          const clean = val.trim();
          if (!window.location.href.includes(clean)) set.add(clean);
        }
      }
      if (el.style && el.style.backgroundImage) {
        const match = el.style.backgroundImage.match(/url\(['"]?([^'"()]+)['"]?\)/);
        if (match && match[1] && isImageUrl(match[1])) set.add(match[1].trim());
      }
      if (el.tagName === 'VIDEO') {
        if (el.src && isVideoUrl(el.src)) set.add(el.src.trim());
        if (el.currentSrc && el.currentSrc !== el.src && isVideoUrl(el.currentSrc)) set.add(el.currentSrc.trim());
        if (el.src && el.src.startsWith('blob:')) set.add(el.src);
        if (el.currentSrc && el.currentSrc.startsWith('blob:')) set.add(el.currentSrc);
      }
    }
    document.querySelectorAll('video source[src], audio source[src]').forEach(s => {
      const src = s.getAttribute('src');
      if (src && isMediaUrl(src)) set.add(src.trim());
    });
    document.querySelectorAll('img').forEach(img => {
      const src = img.currentSrc || img.src;
      if (src && img.naturalWidth >= 200 && img.naturalHeight >= 200 && isImageUrl(src)) set.add(src.trim());
    });
    document.querySelectorAll('meta[property], meta[name]').forEach(meta => {
      if (meta.content && isMediaUrl(meta.content)) set.add(meta.content.trim());
    });
    return Array.from(set);
  }

  let lastLinks = [];
  let isScanning = false;
  let pendingLinks = [];

  function sendLink(url) {
    if (url && isMediaUrl(url)) {
      const cleanUrl = url.trim();
      const isPending = pendingLinks.some(l => normalizeUrl(l) === normalizeUrl(cleanUrl));
      const isRecent = lastLinks.some(l => normalizeUrl(l) === normalizeUrl(cleanUrl));
      if (!isPending && !isRecent) {
        pendingLinks.push(cleanUrl);
        chrome.runtime.sendMessage({ action: 'autoDetectedLinks', links: [cleanUrl], immediate: true });
      }
    }
  }

  function scanAndSend() {
    if (isScanning) return;
    isScanning = true;
    try {
      const domLinks = scanDOM();
      const scriptLinks = scanScriptsEnhanced();
      const combined = new Set([...domLinks, ...scriptLinks]);
      if (typeof VideoHunterSites !== 'undefined' && VideoHunterSites.isStreamingPageUrl(window.location.href)) combined.add(window.location.href);
      try {
        performance.getEntriesByType('resource').forEach(entry => {
          if (entry.name && isMediaUrl(entry.name)) combined.add(entry.name);
        });
      } catch (e) {}
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && isVideoUrl(href)) {
          const clean = href.trim();
          if (!window.location.href.includes(clean)) combined.add(clean);
        }
      });
      let links = deduplicateLinks(Array.from(combined).filter(isMediaUrl));
      const sorted = [...links].sort();
      const sortedLast = [...lastLinks].sort();
      if (JSON.stringify(sorted) !== JSON.stringify(sortedLast)) {
        lastLinks = links;
        pendingLinks = [];
        chrome.runtime.sendMessage({ action: 'autoDetectedLinks', links: links, deduplicated: true });
        chrome.runtime.sendMessage({ action: 'updateBadge', count: links.length });
      }
    } catch(e) { console.warn('[VideoHunter] scan error:', e); }
    isScanning = false;
  }

  function observeDynamicVideos() {
    new MutationObserver((mutations) => {
      let hasNewVideo = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (['VIDEO', 'SOURCE', 'AUDIO', 'IMG'].includes(node.tagName)) {
            hasNewVideo = true;
            if (node.src && isMediaUrl(node.src)) sendLink(node.src);
            break;
          }
          if (node.querySelectorAll) {
            const videos = node.querySelectorAll('video, source, audio, img');
            if (videos.length > 0) {
              hasNewVideo = true;
              videos.forEach(v => { if (v.src && isMediaUrl(v.src)) sendLink(v.src); });
            }
          }
        }
        if (mutation.target && ['VIDEO', 'AUDIO', 'IMG'].includes(mutation.target.tagName)) {
          if (mutation.attributeName === 'src' && mutation.target.src && isMediaUrl(mutation.target.src)) {
            sendLink(mutation.target.src);
            hasNewVideo = true;
          }
        }
      }
      if (hasNewVideo) setTimeout(scanAndSend, 300);
    }).observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['src', 'data-src', 'data-video', 'data-video-url', 'data-file', 'data-url', 'data-href', 'data-poster', 'data-video-id', 'data-video-file', 'data-source', 'data-video-link', 'style']
    });
  }

  function watchVideoEvents() {
    document.addEventListener('play', (e) => {
      if (['VIDEO', 'AUDIO'].includes(e.target?.tagName)) {
        const v = e.target;
        if (v.src && isMediaUrl(v.src)) sendLink(v.src);
        if (v.currentSrc && isMediaUrl(v.currentSrc)) sendLink(v.currentSrc);
        setTimeout(scanAndSend, 300);
      }
    }, true);
    document.addEventListener('loadedmetadata', (e) => {
      if (['VIDEO', 'AUDIO'].includes(e.target?.tagName)) {
        if (e.target.src && isMediaUrl(e.target.src)) sendLink(e.target.src);
        if (e.target.currentSrc && isMediaUrl(e.target.currentSrc)) sendLink(e.target.currentSrc);
        setTimeout(scanAndSend, 200);
      }
    }, true);
    document.addEventListener('canplay', (e) => {
      if (['VIDEO', 'AUDIO'].includes(e.target?.tagName)) {
        if (e.target.src && isMediaUrl(e.target.src)) sendLink(e.target.src);
        if (e.target.currentSrc && isMediaUrl(e.target.currentSrc)) sendLink(e.target.currentSrc);
      }
    }, true);
  }

  function init() {
    try { performance.setResourceTimingBufferSize(10000); } catch (e) {}
    interceptVideoRequests();
    detectMediaSourceVideos();
    observeDynamicVideos();
    watchVideoEvents();
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(scanAndSend, 300);
    } else {
      document.addEventListener('DOMContentLoaded', () => setTimeout(scanAndSend, 500));
    }
    window.addEventListener('load', () => setTimeout(scanAndSend, 500));
    setInterval(scanAndSend, 2000);
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'forceScan') { scanAndSend(); sendResponse({ status: 'ok' }); return true; }
    });
  }

  function loadSettingsAndInit() {
    chrome.storage.local.get('userSettings', result => {
      enabledMediaTypes = { video: true, audio: true, image: true, ...(result.userSettings?.mediaTypes || {}) };
      enabledMediaFormats = Object.fromEntries(Object.entries(VideoHunterMediaFormats.groups).map(([category, defaults]) => [
        category,
        Array.isArray(result.userSettings?.mediaFormats?.[category]) ? result.userSettings.mediaFormats[category] : [...defaults]
      ]));
      init();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.userSettings) return;
    enabledMediaTypes = { video: true, audio: true, image: true, ...(changes.userSettings.newValue?.mediaTypes || {}) };
    enabledMediaFormats = Object.fromEntries(Object.entries(VideoHunterMediaFormats.groups).map(([category, defaults]) => [
      category,
      Array.isArray(changes.userSettings.newValue?.mediaFormats?.[category]) ? changes.userSettings.newValue.mediaFormats[category] : [...defaults]
    ]));
    scanAndSend();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadSettingsAndInit);
  else loadSettingsAndInit();
})();
