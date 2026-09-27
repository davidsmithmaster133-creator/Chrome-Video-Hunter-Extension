(function(root) {
  const hosts = [
    'lulustream.com', 'lulustream.net', 'lulustreams.com', 'luluvdo.com', 'luluvdo.net', 'luluvid.com',
    'mixdrop.co', 'mixdrop.to', 'mixdrop.sx', 'mixdrop.bz', 'mixdrop.ch', 'mixdrop.ag',
    'voe.sx', 'voe-unblock.com', 'voeunblock.com', 'voe-network.net',
    'doodstream.com', 'dood.to', 'dood.re', 'dood.li', 'dood.wf', 'dood.pm',
    'streamtape.com', 'streamtape.to', 'streamtape.net', 'streamtape.cc', 'streamtape.site',
    'streamwish.to', 'streamwish.com', 'streamwish.site', 'streamwish.net',
    'filemoon.sx', 'filemoon.to', 'vidmoly.to', 'vidmoly.me', 'vidhide.com', 'vidhidepro.com',
    'upstream.to', 'streamsb.net', 'sbembed.com', 'vidcloud.co', 'vidcloud9.com',
    'filelions.to', 'earnvids.com', 'streamlare.com', 'streamruby.com', 'vidguard.to',
    'mp4upload.com', 'vidbam.org', 'streamhide.to', 'vidsrc.to', 'vidsrc.me', 'vidsrc.xyz'
  ];
  const hostSet = new Set(hosts);
  const mediaFilePattern = /\.(mp4|webm|ogg|mov|avi|mkv|m4v|flv|3gp|mpeg|mpg|wmv|m2ts|ts|m3u8|m4s|mpd|mp3|m4a|wav|flac|aac|opus|jpg|jpeg|png|gif|webp|avif|bmp)(?:$|[?#])/i;
  const staticAssetPattern = /\.(js|mjs|css|json|xml|txt|map|svg|ico|woff2?|ttf|eot|wasm)(?:$|[?#])/i;
  const playerRoutePattern = /(?:^|\/)(?:e|f|v|d|embed|player|play|watch|video|stream)(?:\/|$)/i;
  const commonEmbedRoutePattern = /(?:^|\/)(?:e|f|v|d|embed|player)(?:\/|$)/i;

  function isStreamingPageUrl(value) {
    if (typeof value !== 'string' || !value) return false;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      const hostname = url.hostname.toLowerCase();
      const knownHost = [...hostSet].some(host => hostname === host || hostname.endsWith(`.${host}`));
      if (knownHost) return !mediaFilePattern.test(url.pathname + url.search) && !staticAssetPattern.test(url.pathname);
      const playerHost = /(?:stream|video|embed|player)/i.test(hostname);
      return commonEmbedRoutePattern.test(url.pathname) || (playerHost && playerRoutePattern.test(url.pathname));
    } catch {
      return false;
    }
  }

  root.VideoHunterSites = Object.freeze({ isStreamingPageUrl });
})(globalThis);