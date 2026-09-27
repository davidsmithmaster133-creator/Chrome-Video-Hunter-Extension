(function(root) {
  const groups = Object.freeze({
    video: Object.freeze(['mp4', 'webm', 'ogv', 'mov', 'qt', 'avi', 'mkv', 'mk3d', 'm4v', 'flv', 'f4v', '3gp', '3g2', 'mpeg', 'mpg', 'mpe', 'm1v', 'm2v', 'wmv', 'asf', 'm2ts', 'mts', 'ts', 'vob', 'mxf', 'm3u8', 'm4s', 'mpd']),
    audio: Object.freeze(['mp3', 'm4a', 'm4b', 'm4p', 'aac', 'ac3', 'amr', 'ape', 'flac', 'mka', 'mid', 'midi', 'mp2', 'oga', 'ogg', 'opus', 'ra', 'tta', 'wav', 'weba', 'wma', 'aif', 'aiff', 'caf']),
    image: Object.freeze(['jpg', 'jpeg', 'jfif', 'png', 'apng', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'jxl'])
  });
  const mimeExtensions = Object.freeze({
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov',
    'video/x-msvideo': 'avi', 'video/x-matroska': 'mkv', 'video/x-flv': 'flv', 'video/mp2t': 'ts',
    'video/x-ms-wmv': 'wmv', 'video/x-ms-asf': 'asf', 'video/mpeg': 'mpeg',
    'application/vnd.apple.mpegurl': 'm3u8', 'application/x-mpegurl': 'm3u8', 'application/dash+xml': 'mpd',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/flac': 'flac', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/opus': 'opus',
    'audio/amr': 'amr', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff', 'audio/x-ms-wma': 'wma',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/avif': 'avif', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/heic': 'heic', 'image/heif': 'heif'
  });

  function categoryForExtension(extension) {
    for (const [category, extensions] of Object.entries(groups)) {
      if (extensions.includes(extension)) return category;
    }
    return null;
  }

  function extensionFor(value, mime = '') {
    if (typeof value === 'string') {
      const dataMime = value.match(/^data:([^;,]+)/i)?.[1];
      if (dataMime) mime = dataMime;
      let pathname = value.split(/[?#]/, 1)[0];
      try { pathname = new URL(value, root.location?.href).pathname; } catch {}
      const match = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
      if (match && categoryForExtension(match[1])) return match[1];
      const queryMatch = value.toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#&])/);
      if (queryMatch && categoryForExtension(queryMatch[1])) return queryMatch[1];
    }
    const normalizedMime = String(mime).split(';', 1)[0].trim().toLowerCase();
    return mimeExtensions[normalizedMime] || '';
  }

  function isExtensionEnabled(extension, enabledFormats, categoryOverride) {
    const category = categoryOverride || categoryForExtension(extension);
    if (!category || !Array.isArray(enabledFormats?.[category])) return true;
    return enabledFormats[category].includes(extension);
  }

  function hasEnabledFormats(category, enabledFormats) {
    const enabled = enabledFormats?.[category];
    return !Array.isArray(enabled) || groups[category].some(extension => enabled.includes(extension));
  }

  root.VideoHunterMediaFormats = Object.freeze({
    groups,
    categoryForExtension,
    extensionFor,
    isExtensionEnabled,
    hasEnabledFormats
  });
})(globalThis);