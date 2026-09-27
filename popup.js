let videoLinks = [];
let selectedIndices = new Set();
let currentTabId = null;
const sizeCache = {};
const mediaTypeCache = {};
let userSettings = { mediaTypes: { video: true, audio: true, image: true } };
let showOnlyDirect = true;

const container = document.getElementById('linkContainer');
const badge = document.getElementById('countBadge');
const copySelectedBtn = document.getElementById('copySelectedBtn');
const openSelectedBtn = document.getElementById('openSelectedBtn');
const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
const selectAllBtn = document.getElementById('selectAllBtn');
const clearBtn = document.getElementById('clearBtn');
const searchBox = document.getElementById('searchBox');
const timestampEl = document.getElementById('timestamp');
const linkCountEl = document.getElementById('linkCount');
const selectedCountEl = document.getElementById('selectedCount');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const toastEl = document.getElementById('toast');
const filterDirectCheck = document.getElementById('filterDirectCheck');
const btn9xCurrentPage = document.getElementById('btn9xCurrentPage');
const directOnlyRadio = document.getElementById('directOnlyRadio');
const themeButton = document.getElementById('themeBtn');
const settingsButton = document.getElementById('settingsBtn');

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
}

chrome.storage.local.get('userSettings', ({ userSettings: settings }) => {
  let theme = settings?.theme;
  if (!theme) {
    try { theme = localStorage.getItem('udl-theme') || 'light'; }
    catch { theme = 'light'; }
  }
  applyTheme(theme);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.userSettings) applyTheme(changes.userSettings.newValue?.theme || 'system');
});

themeButton.addEventListener('click', async () => {
  const { userSettings: settings = {} } = await chrome.storage.local.get('userSettings');
  settings.theme = document.body.classList.contains('dark') ? 'light' : 'dark';
  await chrome.storage.local.set({ userSettings: settings });
  applyTheme(settings.theme);
});

settingsButton.addEventListener('click', async () => {
  try {
    if (chrome.runtime.openOptionsPage) {
      await chrome.runtime.openOptionsPage();
      return;
    }
  } catch (error) {}
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') }, () => {
    if (chrome.runtime.lastError) showToast('Could not open settings');
  });
});

function showToast(msg, duration = 2000) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}
function formatTime() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function getFileName(url) {
  try { const parts = url.split('/'); return parts[parts.length - 1].split('?')[0] || 'video'; } catch { return 'video'; }
}
async function downloadMedia(url) {
  const { userSettings = {} } = await chrome.storage.local.get('userSettings');
  const folder = String(userSettings.downloadFolder || '').trim().replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..').join('/');
  const name = getFileName(url).replace(/[<>:"|?*]/g, '_');
  return chrome.downloads.download({ url, filename: folder ? `${folder}/${name}` : name, saveAs: true });
}
function getFileExtension(url) {
  try { const parts = url.split('/'); const last = parts[parts.length - 1].split('?')[0]; return last.split('.').pop() || 'unknown'; } catch { return 'unknown'; }
}
function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return 'unknown'; }
}
function formatSize(bytes) {
  if (!bytes || bytes === 0) return 'unknown';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}
function isDirectVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const extension = VideoHunterMediaFormats.extensionFor(url);
  return Boolean(extension && VideoHunterMediaFormats.isExtensionEnabled(
    extension,
    userSettings.mediaFormats,
    VideoHunterMediaFormats.categoryForExtension(extension)
  ));
}
function isVideoPreviewUrl(url) {
  return /\.(mp4|webm|ogg|mov|m4v|mkv|m3u8)(\?|#|&|\/|$)/i.test(url);
}
function isStreamUrl(url) {
  const extension = VideoHunterMediaFormats.extensionFor(url);
  return (typeof VideoHunterSites !== 'undefined' && VideoHunterSites.isStreamingPageUrl(url))
    || (extension && ['m3u8', 'mpd', 'm4s'].includes(extension) && VideoHunterMediaFormats.isExtensionEnabled(extension, userSettings.mediaFormats))
    || /\.(m3u8|mpd|m4s)(\?|#|&|\/|$)/i.test(url)
    || /(?:^|[\/_-])(hls|dash)(?:[\/_-]).*\.(ts|m4s)(?:\?|#|&|\/|$)/i.test(url);
}
function isThumbnailUrl(url) {
  try {
    const parsed = new URL(url);
    const value = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    return /(^|[._-])(thumb|thumbnail|poster|preview|sprite|avatar|cover)([._/-]|$)/i.test(value);
  } catch {
    return /(^|[._-])(thumb|thumbnail|poster|preview|sprite|avatar|cover)([._/-]|$)/i.test(url.toLowerCase());
  }
}
function getTypeFromUrl(url) {
  if (isThumbnailUrl(url)) return 'thumbnail';
  if (mediaTypeCache[url]) return mediaTypeCache[url];
  if (isStreamUrl(url)) return 'stream';
  const extension = VideoHunterMediaFormats.extensionFor(url);
  const category = VideoHunterMediaFormats.categoryForExtension(extension);
  if (category === 'audio') return 'audio';
  if (category === 'image') return 'thumbnail';
  if (/\.(jpg|jpeg|png|gif|webp|avif|bmp)/i.test(url)) return 'thumbnail';
  return 'video';
}
function getTypeFromMime(mime, url) {
  if (isThumbnailUrl(url)) return 'thumbnail';
  if (isStreamUrl(url)) return 'stream';
  const lowerMime = (mime || '').toLowerCase();
  if (lowerMime.includes('mpegurl') || lowerMime.includes('dash')) return 'stream';
  if (lowerMime.startsWith('audio/')) return 'audio';
  if (lowerMime.startsWith('image/')) return 'thumbnail';
  if (lowerMime.startsWith('video/')) return 'video';
  return null;
}
async function updateMediaTypes(links) {
  let changed = false;
  await Promise.all(links.map(async url => {
    if (mediaTypeCache[url]) return;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const type = getTypeFromMime(response.headers.get('content-type'), url);
      mediaTypeCache[url] = type || getTypeFromUrl(url);
      if (type) changed = true;
    } catch (e) {
      mediaTypeCache[url] = getTypeFromUrl(url);
    }
  }));
  if (changed) render(videoLinks, searchBox.value);
}
async function fetchVideoSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const size = response.headers.get('content-length');
    if (size) return parseInt(size, 10);
  } catch (e) {}
  return null;
}
async function updateSizesForVisibleLinks() {
  const sizeElements = container.querySelectorAll('.link-size[data-url]');
  let fetched = false;
  for (const el of sizeElements) {
    const url = el.dataset.url;
    if (!(url in sizeCache)) {
      sizeCache[url] = await fetchVideoSize(url);
      fetched = true;
    }
    const bytes = sizeCache[url];
    el.textContent = bytes ? formatSize(bytes) : 'size?';
    el.removeAttribute('data-url');
  }
  const sortBy = document.getElementById('sortBy')?.value || '';
  const minSize = VideoHunterSize.parseSize(document.getElementById('minSize')?.value) ?? 0;
  if (fetched && (minSize > 0 || sortBy.startsWith('size-'))) render(videoLinks, searchBox.value);
}
function openIn9xBuddy(videoUrl) {
  const url = `https://9xbuddy.com/download?url=${encodeURIComponent(videoUrl)}`;
  chrome.tabs.create({ url, active: true });
  showToast('Opening 9xBuddy...');
}

async function fetchWith9xBuddy(videoUrl, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Fetching...';
  try {
    const result = await chrome.runtime.sendMessage({ action: 'get9xBuddyLinks', url: videoUrl });
    const links = (result?.links || []).filter(link => link?.url && /^https?:/i.test(link.url));
    if (result?.success && links.length) {
      for (const link of links) {
        downloadMedia(link.url);
      }
      showToast(`Starting ${links.length} server-fetched download(s)`);
      return;
    }
    if (result?.fallbackUrl) {
      openIn9xBuddy(videoUrl);
      showToast('No direct links found; opened 9xBuddy');
      return;
    }
    showToast(result?.error || 'Server fetch failed');
  } catch (error) {
    showToast('Server fetch failed');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function render(links, filter = '') {
  const typeFilter = document.querySelector('input[name="typeFilter"]:checked')?.value || 'all';
  const sortBy = document.getElementById('sortBy')?.value || 'date-desc';
  const minSize = VideoHunterSize.parseSize(document.getElementById('minSize')?.value) ?? 0;
  let filtered = links.filter(u => {
    if (/\.(webmanifest|manifest|json|js|css|html|xml|txt|map|svg|ico|woff2?|ttf|wasm)(\?|#|$)/i.test(u)) return false;
    const type = getTypeFromUrl(u);
    const category = type === 'thumbnail' ? 'image' : type === 'audio' ? 'audio' : 'video';
    return userSettings.mediaTypes?.[category] !== false;
  });
  filtered = filtered.filter(u => u.toLowerCase().includes(filter.toLowerCase()));
  filtered = filtered.filter(url => {
    const extension = VideoHunterMediaFormats.extensionFor(url);
    const type = getTypeFromUrl(url);
    const category = type === 'thumbnail' ? 'image' : type === 'audio' ? 'audio' : 'video';
    return !extension || VideoHunterMediaFormats.isExtensionEnabled(extension, userSettings.mediaFormats, category);
  });
  if (typeFilter !== 'all') filtered = filtered.filter(u => getTypeFromUrl(u) === typeFilter);
  if (showOnlyDirect) filtered = filtered.filter(url => isDirectVideoUrl(url) || isStreamUrl(url));
  if (minSize > 0) filtered = filtered.filter(u => !(u in sizeCache) || sizeCache[u] >= minSize);
  const [sortField, sortDirection] = sortBy.split('-');
  filtered.sort((a, b) => {
    let first;
    let second;
    if (sortField === 'size') {
      first = sizeCache[a] || 0;
      second = sizeCache[b] || 0;
    } else if (sortField === 'name') {
      first = getFileName(a);
      second = getFileName(b);
    } else if (sortField === 'host') {
      first = getDomain(a);
      second = getDomain(b);
    } else {
      first = links.indexOf(a);
      second = links.indexOf(b);
    }
    const comparison = typeof first === 'number'
      ? first - second
      : String(first).localeCompare(String(second));
    return sortDirection === 'desc' ? -comparison : comparison;
  });
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">${links.length ? 'No matching links' : 'No video links found'}</div>`;
    badge.textContent = links.length;
    updateStats(links);
    return;
  }
  const html = filtered.map(url => {
    const realIdx = videoLinks.indexOf(url);
    const isSelected = selectedIndices.has(realIdx);
    const ext = getFileExtension(url);
    const domain = getDomain(url);
    const mediaType = getTypeFromUrl(url);
    const direct = mediaType !== 'thumbnail' && mediaType !== 'stream' && isDirectVideoUrl(url);
    const typeLabel = direct ? 'Direct' : mediaType === 'stream' ? 'Stream' : 'Page';
    const typeClass = direct ? 'direct' : mediaType === 'stream' ? 'stream' : 'page';
    const preview = mediaType === 'thumbnail' && !isVideoPreviewUrl(url)
      ? `<img class="media-preview" src="${url}" alt="Thumbnail preview" loading="lazy" onerror="this.style.display='none'">`
      : mediaType === 'video' || (mediaType === 'thumbnail' && isVideoPreviewUrl(url))
        ? `<video class="media-preview" src="${url}" muted autoplay loop playsinline preload="auto" title="Video preview" onerror="this.style.display='none'"></video>`
        : '';
    const buddyBtn = direct ? '' : `<button class="btn-9x-small buddy-btn" data-url="${url}" title="Fetch downloadable links from the server">Server Fetch</button>`;
    return `
      <div class="link-card ${isSelected ? 'selected' : ''}" data-index="${realIdx}">
        <div class="link-row">
          <input type="checkbox" class="link-checkbox" data-index="${realIdx}" ${isSelected ? 'checked' : ''} />
          ${preview}
          <span class="link-url" title="${url}">${url}</span>
          <div class="link-actions">
            <button class="copy-single" data-url="${url}" title="Copy URL">Copy</button>
            <button class="open-single" data-url="${url}" title="Open in new tab">&#8599;</button>
            <button class="download-single ${direct ? '' : 'disabled'}" data-url="${url}" title="${direct ? 'Download' : 'Not a direct video file'}" ${direct ? '' : 'disabled'}>&#8595;</button>
            ${buddyBtn}
          </div>
        </div>
        <div class="link-meta">
          <span class="media-type">${mediaType}</span>
          <span class="ext">${ext}</span>
          <span class="domain">${domain}</span>
          <span class="link-size" data-url="${url}">...</span>
          <span class="type-badge ${typeClass}">${typeLabel}</span>
        </div>
      </div>
    `;
  }).join('');
  container.innerHTML = html;
  badge.textContent = links.length;
  updateStats(links);

  container.querySelectorAll('.link-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.index);
      if (cb.checked) selectedIndices.add(idx);
      else selectedIndices.delete(idx);
      updateStats(videoLinks);
      cb.closest('.link-card').classList.toggle('selected', cb.checked);
    });
  });
  container.querySelectorAll('.copy-single').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.url).then(() => showToast('Copied')).catch(() => showToast('Copy failed'));
    });
  });
  container.querySelectorAll('.open-single').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: btn.dataset.url, active: false });
      showToast('Opened');
    });
  });
  container.querySelectorAll('.download-single:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      downloadMedia(url);
      showToast('Download started');
    });
  });
  container.querySelectorAll('.download-single.disabled').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showToast('This is a page link, not a direct video file.');
    });
  });
  container.querySelectorAll('.buddy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      fetchWith9xBuddy(btn.dataset.url, btn);
    });
  });
  setTimeout(updateSizesForVisibleLinks, 300);
  setTimeout(() => updateMediaTypes(links), 300);
}

function updateStats(links) {
  linkCountEl.textContent = `${links.length} links`;
  selectedCountEl.textContent = `${selectedIndices.size} selected`;
}
function getSelectedLinks() {
  return Array.from(selectedIndices).map(idx => videoLinks[idx]).filter(Boolean);
}
function downloadSelected() {
  const sel = getSelectedLinks();
  if (!sel.length) { showToast('No videos selected'); return; }
  const direct = sel.filter(url => {
    const type = getTypeFromUrl(url);
    return type !== 'thumbnail' && type !== 'stream' && isDirectVideoUrl(url);
  });
  if (direct.length === 0) { showToast('None of the selected links are direct video files.'); return; }
  direct.forEach((url, i) => {
    setTimeout(() => { downloadMedia(url); }, i * 100);
  });
  showToast(`Downloading ${direct.length} direct video(s)`);
}
function copySelected() {
  const sel = getSelectedLinks();
  if (!sel.length) { showToast('No videos selected'); return; }
  navigator.clipboard.writeText(sel.join('\n')).then(() => showToast(`Copied ${sel.length} links`)).catch(() => showToast('Copy failed'));
}
function openSelected() {
  const sel = getSelectedLinks();
  if (!sel.length) { showToast('No videos selected'); return; }
  sel.slice(0, 10).forEach(url => chrome.tabs.create({ url, active: false }));
  showToast(`Opened ${Math.min(sel.length, 10)} tabs`);
}
function toggleSelectAll() {
  const visibleLinks = videoLinks.filter(u => {
    if (showOnlyDirect && !isDirectVideoUrl(u)) return false;
    if (searchBox.value && !u.toLowerCase().includes(searchBox.value.toLowerCase())) return false;
    return true;
  });
  const visibleIndices = visibleLinks.map(u => videoLinks.indexOf(u)).filter(i => i !== -1);
  const allSelected = visibleIndices.every(i => selectedIndices.has(i));
  if (allSelected && visibleIndices.length > 0) visibleIndices.forEach(i => selectedIndices.delete(i));
  else visibleIndices.forEach(i => selectedIndices.add(i));
  render(videoLinks, searchBox.value);
}
function exportLinks() {
  if (!videoLinks.length) { showToast('No links'); return; }
  const data = { exported: new Date().toISOString(), links: videoLinks, selected: Array.from(selectedIndices) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: `video-links-${Date.now()}.json`, saveAs: true });
  showToast('Export complete');
}
function importLinks() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.links && Array.isArray(data.links)) {
          videoLinks = data.links;
          selectedIndices.clear();
          if (data.selected) data.selected.forEach(i => { if (i < videoLinks.length) selectedIndices.add(i); });
          render(videoLinks, searchBox.value);
          chrome.runtime.sendMessage({ action: 'updateBadge', count: videoLinks.length });
          showToast(`Imported ${videoLinks.length} links`);
        }
      } catch { showToast('Invalid file'); }
    };
    reader.readAsText(file);
  };
  input.click();
}
async function loadLinksForTab(tabId) {
  const result = await chrome.storage.local.get([`tab_${tabId}_links`]);
  const links = result[`tab_${tabId}_links`] || [];
  if (links.length) {
    videoLinks = links;
    selectedIndices.clear();
    render(videoLinks, searchBox.value);
    timestampEl.textContent = `${formatTime()} - ${links.length} cached`;
    return true;
  }
  return false;
}
async function requestCurrentTabScan() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;
  await loadLinksForTab(tab.id);
  chrome.runtime.sendMessage({ action: 'forceScan', tabId: tab.id });
}

document.addEventListener('DOMContentLoaded', async () => {
  const storedSettings = await chrome.storage.local.get('userSettings');
  userSettings = { ...userSettings, ...(storedSettings.userSettings || {}), mediaTypes: { ...userSettings.mediaTypes, ...(storedSettings.userSettings?.mediaTypes || {}) } };
  showOnlyDirect = userSettings.directOnly !== false;
  filterDirectCheck.checked = showOnlyDirect;
  directOnlyRadio.checked = showOnlyDirect;
  const defaultType = document.querySelector(`input[name="typeFilter"][value="${userSettings.defaultType || 'video'}"]`);
  (defaultType || document.querySelector('input[name="typeFilter"][value="video"]')).checked = true;
  const minimumSize = document.getElementById('minSize');
  minimumSize.value = VideoHunterSize.formatSizeInput(userSettings.minimumSize);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    requestCurrentTabScan();
  }
  copySelectedBtn.addEventListener('click', copySelected);
  openSelectedBtn.addEventListener('click', openSelected);
  downloadSelectedBtn.addEventListener('click', downloadSelected);
  selectAllBtn.addEventListener('click', toggleSelectAll);
  clearBtn.addEventListener('click', () => {
    videoLinks = [];
    selectedIndices.clear();
    render([]);
    if (currentTabId) {
      chrome.storage.local.remove([`tab_${currentTabId}_links`]);
      chrome.runtime.sendMessage({ action: 'updateBadge', count: 0, tabId: currentTabId });
    }
    showToast('Cleared');
  });
  searchBox.addEventListener('input', (e) => render(videoLinks, e.target.value));
  document.querySelectorAll('input[name="typeFilter"]').forEach(radio => {
    radio.addEventListener('change', () => render(videoLinks, searchBox.value));
  });
  document.getElementById('sortBy').addEventListener('change', () => render(videoLinks, searchBox.value));
  document.getElementById('minSize').addEventListener('input', event => {
    event.currentTarget.classList.toggle('invalid', VideoHunterSize.parseSize(event.currentTarget.value) === null);
    render(videoLinks, searchBox.value);
  });
  filterDirectCheck.addEventListener('change', (e) => {
    showOnlyDirect = e.target.checked;
    directOnlyRadio.checked = showOnlyDirect;
    render(videoLinks, searchBox.value);
  });
  directOnlyRadio.addEventListener('change', () => {
    filterDirectCheck.checked = directOnlyRadio.checked;
    filterDirectCheck.dispatchEvent(new Event('change'));
  });
  exportBtn.addEventListener('click', exportLinks);
  importBtn.addEventListener('click', importLinks);
  btn9xCurrentPage.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) openIn9xBuddy(tab.url);
    else showToast('No active tab found');
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'linksUpdated' && msg.tabId === currentTabId) {
      videoLinks = msg.links || [];
      selectedIndices.clear();
      render(videoLinks, searchBox.value);
      timestampEl.textContent = `${formatTime()} - updated`;
    }
    if (msg.action === 'autoScanResult' && msg.tabId === currentTabId) {
      videoLinks = msg.links || [];
      selectedIndices.clear();
      render(videoLinks, searchBox.value);
      badge.textContent = videoLinks.length;
      timestampEl.textContent = `${formatTime()} - auto-updated`;
    }
    if (msg.action === 'newVideoDetected' && msg.tabId === currentTabId) {
      loadLinksForTab(currentTabId).then(() => {
        render(videoLinks, searchBox.value);
        showToast('New video detected via network!');
      });
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'a') { e.preventDefault(); toggleSelectAll(); }
  if (e.ctrlKey && e.key === 'd') { e.preventDefault(); downloadSelected(); }
});
