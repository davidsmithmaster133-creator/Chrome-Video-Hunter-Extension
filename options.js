const DEFAULT_SETTINGS = {
  theme: 'system',
  badgeMode: 'count',
  mediaTypes: { video: true, audio: true, image: true },
  mediaFormats: Object.fromEntries(Object.entries(VideoHunterMediaFormats.groups).map(([category, formats]) => [category, [...formats]])),
  defaultType: 'video',
  minimumSize: '',
  directOnly: true,
  downloadFolder: 'VideoHunter'
};

const form = document.getElementById('settingsForm');
const status = document.getElementById('status');
const fields = {
  theme: document.getElementById('theme'),
  badgeMode: document.getElementById('badgeMode'),
  mediaVideo: document.getElementById('mediaVideo'),
  mediaAudio: document.getElementById('mediaAudio'),
  mediaImage: document.getElementById('mediaImage'),
  formatGroups: document.getElementById('formatGroups'),
  defaultType: document.getElementById('defaultType'),
  minimumSize: document.getElementById('minimumSize'),
  directOnly: document.getElementById('directOnly'),
  downloadFolder: document.getElementById('downloadFolder')
};

function buildFormatControls() {
  const labels = { video: 'Video and streaming formats', audio: 'Audio formats', image: 'Image formats' };
  for (const [category, formats] of Object.entries(VideoHunterMediaFormats.groups)) {
    const group = document.createElement('div');
    group.className = 'format-group';
    const heading = document.createElement('div');
    heading.className = 'format-heading';
    const title = document.createElement('h3');
    title.textContent = labels[category];
    const actions = document.createElement('div');
    actions.className = 'format-actions';
    for (const [label, checked] of [['All', true], ['None', false]]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        group.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = checked; });
      });
      actions.appendChild(button);
    }
    heading.append(title, actions);
    const options = document.createElement('div');
    options.className = 'format-options';
    for (const format of formats) {
      const label = document.createElement('label');
      label.className = 'format-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.category = category;
      checkbox.value = format;
      const name = document.createElement('span');
      name.textContent = `.${format}`;
      label.append(checkbox, name);
      options.appendChild(label);
    }
    group.append(heading, options);
    fields.formatGroups.appendChild(group);
  }
}

function getFormatSelections() {
  const selected = Object.fromEntries(Object.keys(VideoHunterMediaFormats.groups).map(category => [category, []]));
  fields.formatGroups.querySelectorAll('input[type="checkbox"]:checked').forEach(input => {
    selected[input.dataset.category].push(input.value);
  });
  return selected;
}

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
}

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function readForm() {
  return {
    theme: fields.theme.value,
    badgeMode: fields.badgeMode.value,
    mediaTypes: {
      video: fields.mediaVideo.checked,
      audio: fields.mediaAudio.checked,
      image: fields.mediaImage.checked
    },
    mediaFormats: getFormatSelections(),
    defaultType: fields.defaultType.value,
    minimumSize: fields.minimumSize.value.trim(),
    directOnly: fields.directOnly.checked,
    downloadFolder: fields.downloadFolder.value
      .trim()
      .replace(/\\/g, '/')
      .split('/')
      .filter(part => part && part !== '.' && part !== '..')
      .map(part => part.replace(/[<>:"|?*]/g, '_'))
      .join('/')
  };
}

function populate(settings) {
  const mediaFormats = Object.fromEntries(Object.entries(DEFAULT_SETTINGS.mediaFormats).map(([category, defaults]) => [
    category,
    Array.isArray(settings.mediaFormats?.[category]) ? settings.mediaFormats[category] : defaults
  ]));
  const value = {
    ...DEFAULT_SETTINGS,
    ...settings,
    mediaTypes: { ...DEFAULT_SETTINGS.mediaTypes, ...settings.mediaTypes },
    mediaFormats
  };
  fields.theme.value = value.theme;
  fields.badgeMode.value = value.badgeMode;
  fields.mediaVideo.checked = value.mediaTypes.video;
  fields.mediaAudio.checked = value.mediaTypes.audio;
  fields.mediaImage.checked = value.mediaTypes.image;
  fields.formatGroups.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.checked = value.mediaFormats[input.dataset.category].includes(input.value);
  });
  fields.defaultType.value = value.defaultType;
  fields.minimumSize.value = VideoHunterSize.formatSizeInput(value.minimumSize);
  fields.directOnly.checked = value.directOnly;
  fields.downloadFolder.value = value.downloadFolder;
  applyTheme(value.theme);
}

buildFormatControls();
chrome.storage.local.get('userSettings', ({ userSettings }) => {
  populate(userSettings || {});
});

fields.theme.addEventListener('change', () => applyTheme(fields.theme.value));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (fields.theme.value === 'system') applyTheme('system');
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const settings = readForm();
  if (!Object.values(settings.mediaTypes).some(Boolean)) {
    showStatus('Enable at least one media category.', true);
    return;
  }
  const emptyEnabledCategory = Object.entries(settings.mediaTypes).find(([category, enabled]) => enabled && settings.mediaFormats[category].length === 0);
  if (emptyEnabledCategory) {
    showStatus(`Select at least one ${emptyEnabledCategory[0]} format or disable that category.`, true);
    return;
  }
  if (VideoHunterSize.parseSize(settings.minimumSize) === null) {
    showStatus('Enter a valid size such as 10KB, 750MB, or 10GB.', true);
    fields.minimumSize.focus();
    return;
  }
  chrome.storage.local.set({ userSettings: settings }, () => {
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, true);
      return;
    }
    applyTheme(settings.theme);
    showStatus('Settings saved.');
  });
});

document.getElementById('resetButton').addEventListener('click', () => {
  populate(DEFAULT_SETTINGS);
  chrome.storage.local.set({ userSettings: DEFAULT_SETTINGS }, () => {
    if (chrome.runtime.lastError) showStatus(chrome.runtime.lastError.message, true);
    else showStatus('Defaults restored.');
  });
});