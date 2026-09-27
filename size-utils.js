(function(root) {
  const powers = { B: 0, BYTE: 0, BYTES: 0, K: 1, KB: 1, KIB: 1, M: 2, MB: 2, MIB: 2, G: 3, GB: 3, GIB: 3, T: 4, TB: 4, TIB: 4 };

  function parseSize(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    const text = String(value ?? '').trim();
    if (!text) return 0;
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(B|BYTES?|K|KB|KIB|M|MB|MIB|G|GB|GIB|T|TB|TIB)?$/i);
    if (!match) return null;
    const unit = (match[2] || 'B').toUpperCase();
    const bytes = Number(match[1]) * (1024 ** powers[unit]);
    return Number.isFinite(bytes) ? bytes : null;
  }

  function formatSizeInput(value) {
    const bytes = parseSize(value);
    if (bytes === null || bytes === 0) return '';
    for (const [unit, factor] of [['TB', 1024 ** 4], ['GB', 1024 ** 3], ['MB', 1024 ** 2], ['KB', 1024]]) {
      if (bytes >= factor) {
        const amount = bytes / factor;
        return `${Number(amount.toPrecision(6))} ${unit}`;
      }
    }
    return `${bytes} B`;
  }

  root.VideoHunterSize = Object.freeze({ parseSize, formatSizeInput });
})(globalThis);