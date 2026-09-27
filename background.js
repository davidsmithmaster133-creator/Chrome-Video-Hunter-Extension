// background.js - network monitor + 9xBuddy integration
importScripts('media-formats.js');
const videoExtensions = VideoHunterMediaFormats.groups.video.map(extension => `.${extension}`);
const audioExtensions = VideoHunterMediaFormats.groups.audio.map(extension => `.${extension}`);
const imageExtensions = VideoHunterMediaFormats.groups.image.map(extension => `.${extension}`);
const junkResourcePattern = /\.(webmanifest|manifest|json|js|css|html|xml|txt|map|svg|ico|woff2?|ttf|wasm)(\?|#|$)/i;
let userSettings = {
  badgeMode: 'count',
  mediaTypes: { video: true, audio: true, image: true },
  mediaFormats: Object.fromEntries(Object.entries(VideoHunterMediaFormats.groups).map(([category, formats]) => [category, [...formats]]))
};

function updateUserSettings(settings) {
  userSettings = {
    ...userSettings,
    ...(settings || {}),
    mediaTypes: { video: true, audio: true, image: true, ...(settings?.mediaTypes || {}) },
    mediaFormats: Object.fromEntries(Object.entries(VideoHunterMediaFormats.groups).map(([category, defaults]) => [
      category,
      Array.isArray(settings?.mediaFormats?.[category]) ? settings.mediaFormats[category] : [...defaults]
    ]))
  };
}

chrome.storage.local.get('userSettings', result => updateUserSettings(result.userSettings));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.userSettings) return;
  updateUserSettings(changes.userSettings.newValue);
  chrome.tabs.query({}, tabs => tabs.forEach(tab => {
    if (typeof tab.id !== 'number') return;
    chrome.storage.local.get([`tab_${tab.id}_links`], result => updateBadgeForTab(tab.id, (result[`tab_${tab.id}_links`] || []).length));
  }));
});

function downloadWithSettings(url, filename, callback) {
  chrome.storage.local.get('userSettings', result => {
    const settings = result.userSettings || userSettings;
    const folder = String(settings.downloadFolder || '').trim().replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..').join('/');
    let name = filename;
    if (!name) {
      try { name = decodeURIComponent(new URL(url).pathname.split('/').pop()) || 'video'; }
      catch { name = 'video'; }
    }
    name = name.split(/[\\/]/).pop().replace(/[<>:"|?*]/g, '_') || 'video';
    chrome.downloads.download({ url, saveAs: true, filename: folder ? `${folder}/${name}` : name }, callback);
  });
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let normalized = url.trim();
  normalized = normalized.replace(/\?([^&]*&)*(utm_[^&]+|ref|source|fbclid|gclid|msclkid|dclid|reddit|[&?]t=[^&]+)(?:&|$)/gi, '');
  normalized = normalized.replace(/[&?]$/, '');
  normalized = normalized.split('#')[0];
  normalized = normalized.replace(/\/$/, '');
  return normalized;
}

function deduplicateLinks(links) {
  if (!Array.isArray(links)) return [];
  const seen = new Map();
  const result = [];
  for (const link of links) {
    if (!link || typeof link !== 'string') continue;
    const normalized = normalizeUrl(link);
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.set(normalized, true);
      result.push(link);
    }
  }
  return result;
}

function updateBadgeForTab(tabId, count) {
  if (tabId) {
    const text = count > 0 && userSettings.badgeMode !== 'hidden'
      ? userSettings.badgeMode === 'dot' ? '•' : String(count)
      : '';
    chrome.action.setBadgeText({ text, tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#1976d2', tabId: tabId });
  }
}

function storeLinksForTab(tabId, links) {
  if (!tabId || tabId < 0) return;
  if (!Array.isArray(links)) links = [links];
  links = deduplicateLinks(links);
  chrome.storage.local.get([`tab_${tabId}_links`], (result) => {
    let existing = result[`tab_${tabId}_links`] || [];
    const allLinks = [...existing, ...links];
    const uniqueLinks = deduplicateLinks(allLinks);
    chrome.storage.local.set({ [`tab_${tabId}_links`]: uniqueLinks }, () => {
      updateBadgeForTab(tabId, uniqueLinks.length);
      chrome.runtime.sendMessage({
        action: 'linksUpdated',
        tabId: tabId,
        links: uniqueLinks,
        count: uniqueLinks.length
      });
    });
  });
}

function captureNetworkMedia(details) {
  const url = details.url;
  const tabId = details.tabId;
  if (tabId < 0 || !url || junkResourcePattern.test(url)) return;
  const lower = url.toLowerCase();
  const headers = (details.responseHeaders || []).map(header => `${header.name}:${header.value || ''}`).join('\n').toLowerCase();
  const mime = headers.match(/content-type:\s*([^;\s]+)/i)?.[1] || '';
  const extension = VideoHunterMediaFormats.extensionFor(url, mime);
  if (!extension) return;
  const extensionCategory = VideoHunterMediaFormats.categoryForExtension(extension);
  const mimeCategory = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio'
    : mime.startsWith('video/') || /application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml)/i.test(mime) ? 'video' : null;
  const category = details.type === 'image' ? 'image' : mimeCategory || extensionCategory
    || (details.type === 'media' ? 'video' : null);
  if (!category || userSettings.mediaTypes?.[category] === false
    || !VideoHunterMediaFormats.isExtensionEnabled(extension, userSettings.mediaFormats, category)) return;
  storeLinksForTab(tabId, [url]);
  chrome.runtime.sendMessage({ action: 'newVideoDetected', tabId, url });
}

chrome.webRequest.onHeadersReceived.addListener(
  captureNetworkMedia,
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);
chrome.webRequest.onCompleted.addListener(
  captureNetworkMedia,
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'vh-download-media', title: 'Download with VideoHunter', contexts: ['video', 'audio', 'image'] });
    chrome.contextMenus.create({ id: 'vh-download-link', title: 'Download this link', contexts: ['link'] });
  });
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'vh-download-media' && info.srcUrl) downloadWithSettings(info.srcUrl);
  if (info.menuItemId === 'vh-download-link' && info.linkUrl) downloadWithSettings(info.linkUrl);
});

async function fetch9xBuddyLinks(videoUrl) {
  const domains = [
    'https://9xbuddy.com/download?url=',
    'https://9xbuddy.site/download?url=',
    'https://9xbuddy.download/download?url=',
    'https://9xbuddy.org/download?url='
  ];
  let links = [];
  let lastError = null;
  let successDomain = null;
  for (const base of domains) {
    try {
      const apiUrl = base + encodeURIComponent(videoUrl);
      const response = await fetch(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }
      });
      const html = await response.text();
      const pageUrl = response.url || apiUrl;
      const addLink = (rawUrl, text = 'Download') => {
        if (!rawUrl) return;
        const decoded = rawUrl.trim().replace(/&amp;/gi, '&').replace(/&#x2f;|&#47;/gi, '/');
        try {
          const url = new URL(decoded, pageUrl).href;
          if (/^https?:/i.test(url) && videoExtensions.some(ext => url.toLowerCase().includes(ext))) {
            links.push({ url, text });
          }
        } catch (e) {}
      };
      const getAttribute = (attributes, name) => {
        const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
        return match && (match[1] || match[2] || match[3]);
      };
      for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
        const label = match[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        addLink(getAttribute(match[1], 'href'), label || 'Download');
        addLink(getAttribute(match[1], 'data-href'), label || 'Download');
      }
      for (const match of html.matchAll(/<[a-z][^>]*\bdata-href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)) {
        addLink(match[1] || match[2] || match[3]);
      }
      if (links.length === 0) {
        const supportedFormats = videoExtensions.map(extension => extension.slice(1)).join('|');
        const mediaPattern = new RegExp(`https?:\\/\\/[^\\s<>"']+\\.(?:${supportedFormats})(?:\\?[^\\s<>"']*)?`, 'gi');
        const matches = html.match(mediaPattern);
        if (matches) matches.forEach(url => addLink(url, 'Download (extracted)'));
      }
      links = deduplicateLinks(links.map(link => link.url)).map(url =>
        links.find(link => link.url === url)
      );
      if (links.length > 0) { successDomain = base; break; }
    } catch (error) { lastError = error; console.warn(`Failed on ${base}:`, error); }
  }
  if (links.length > 0) return { links, domain: successDomain, success: true };
  return {
    links: [],
    fallbackUrl: `https://9xbuddy.com/download?url=${encodeURIComponent(videoUrl)}`,
    success: false,
    error: lastError ? lastError.message : 'No links found'
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'autoDetectedLinks') {
    const tabId = sender.tab?.id;
    if (tabId) {
      let links = message.links || [];
      storeLinksForTab(tabId, links);
      if (message.deduplicated) {
        chrome.storage.local.get([`tab_${tabId}_links`], (result) => {
          const stored = result[`tab_${tabId}_links`] || [];
          updateBadgeForTab(tabId, stored.length);
        });
      }
    }
    sendResponse({ status: 'ok' });
    return true;
  }
  if (message.action === 'getLinksForTab') {
    const tabId = message.tabId;
    chrome.storage.local.get([`tab_${tabId}_links`], (result) => {
      const links = result[`tab_${tabId}_links`] || [];
      sendResponse({ links: deduplicateLinks(links) });
    });
    return true;
  }
  if (message.action === 'getLinks') {
    const tabId = message.tabId;
    if (tabId) {
      chrome.storage.local.get([`tab_${tabId}_links`], (result) => {
        const links = result[`tab_${tabId}_links`] || [];
        const uniqueLinks = deduplicateLinks(links);
        sendResponse({ links: uniqueLinks, count: uniqueLinks.length });
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const tabId = tabs[0].id;
          chrome.storage.local.get([`tab_${tabId}_links`], (result) => {
            const links = result[`tab_${tabId}_links`] || [];
            const uniqueLinks = deduplicateLinks(links);
            sendResponse({ links: uniqueLinks, count: uniqueLinks.length });
          });
        } else sendResponse({ links: [], count: 0 });
      });
      return true;
    }
    return true;
  }
  if (message.action === 'updateBadge') {
    updateBadgeForTab(message.tabId || sender.tab?.id, message.count || 0);
    sendResponse({ status: 'ok' });
    return true;
  }
  if (message.action === 'forceScan') {
    const tabId = message.tabId;
    if (tabId) requestTabScan(tabId);
    sendResponse({ status: 'ok' });
    return true;
  }
  if (message.action === 'clearLinks') {
    const tabId = message.tabId;
    if (tabId) {
      chrome.storage.local.remove([`tab_${tabId}_links`], () => {
        updateBadgeForTab(tabId, 0);
        chrome.runtime.sendMessage({ action: 'linksUpdated', tabId: tabId, links: [], count: 0 });
      });
    }
    sendResponse({ status: 'ok' });
    return true;
  }
  if (message.action === 'downloadVideo') {
    const url = message.url;
    if (url) {
      downloadWithSettings(url, null, (downloadId) => {
        if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
        else sendResponse({ success: true, downloadId });
      });
      return true;
    }
  }
  if (message.action === 'get9xBuddyLinks') {
    const videoUrl = message.url;
    fetch9xBuddyLinks(videoUrl).then(result => sendResponse(result)).catch(err => sendResponse({ links: [], success: false, error: err.message }));
    return true;
  }
});

function requestTabScan(tabId) {
  chrome.tabs.sendMessage(tabId, { action: 'forceScan' }, () => {
    if (!chrome.runtime.lastError) return;
    chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['media-formats.js', 'streaming-sites.js', 'content.js'] }, () => {
      if (chrome.runtime.lastError) return;
      chrome.tabs.sendMessage(tabId, { action: 'forceScan' }, () => chrome.runtime.lastError);
    });
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  chrome.storage.local.get([`tab_${tabId}_links`], (result) => {
    const cached = result[`tab_${tabId}_links`];
    updateBadgeForTab(tabId, cached?.length || 0);
    requestTabScan(tabId);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    chrome.storage.local.remove([`tab_${tabId}_links`]);
    setTimeout(() => requestTabScan(tabId), 300);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove([`tab_${tabId}_links`]);
});

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) setTimeout(() => requestTabScan(tabs[0].id), 500);
});

console.log('[Background] VideoHunter loaded');
