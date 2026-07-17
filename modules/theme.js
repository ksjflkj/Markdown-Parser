import hljsDarkUrl from 'highlight.js/styles/atom-one-dark.css?url';
import hljsLightUrl from 'highlight.js/styles/atom-one-light.css?url';

function updateHljsTheme(isDark) {
  const link = document.getElementById('hljsTheme');
  if (link) {
    link.href = isDark ? hljsDarkUrl : hljsLightUrl;
  }
}

export function initTheme({ refs, state }) {
  const savedTheme = localStorage.getItem('md-parser-theme');

  if (savedTheme) {
    state.isDark = savedTheme !== 'light';
  } else {
    state.isDark = !window.matchMedia('(prefers-color-scheme: light)').matches;
  }

  document.documentElement.setAttribute('data-theme', state.isDark ? 'dark' : 'light');
  updateHljsTheme(state.isDark);
  updateThemeIcon({ refs, state });

  refs.btnTheme.addEventListener('click', () => {
    state.isDark = !state.isDark;
    document.documentElement.setAttribute('data-theme', state.isDark ? 'dark' : 'light');
    localStorage.setItem('md-parser-theme', state.isDark ? 'dark' : 'light');
    updateHljsTheme(state.isDark);
    updateThemeIcon({ refs, state });
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem('md-parser-theme')) return;
    state.isDark = e.matches;
    document.documentElement.setAttribute('data-theme', state.isDark ? 'dark' : 'light');
    updateHljsTheme(state.isDark);
    updateThemeIcon({ refs, state });
  });
}

export function initColorTheme({ refs, showToast }) {
  const COLOR_SCHEMES = {
    default: { primary: '#6c63ff', secondary: '#ff6584' },
    aurora: { primary: '#00d4ff', secondary: '#7b2fff' },
    coral: { primary: '#ff6b6b', secondary: '#ffa94d' },
    ocean: { primary: '#0ea5e9', secondary: '#06b6d4' },
    emerald: { primary: '#10b981', secondary: '#34d399' },
    rose: { primary: '#e11d48', secondary: '#fb7185' },
    gold: { primary: '#f59e0b', secondary: '#fbbf24' },
    cyber: { primary: '#22d3ee', secondary: '#a855f7' }
  };

  document.querySelectorAll('.theme-preset-card').forEach(card => {
    card.addEventListener('click', () => {
      const scheme = card.dataset.scheme;
      const colors = COLOR_SCHEMES[scheme];
      if (!colors) return;

      applyColorScheme({ refs, primary: colors.primary, secondary: colors.secondary });
      setActivePreset(scheme);
      showToast(`已切换到「${card.querySelector('.theme-preset-name').textContent}」主题`);
    });
  });

  refs.colorPrimary.addEventListener('input', () => {
    refs.hexPrimary.textContent = refs.colorPrimary.value;
    setActivePreset('custom');
  });

  refs.colorSecondary.addEventListener('input', () => {
    refs.hexSecondary.textContent = refs.colorSecondary.value;
    setActivePreset('custom');
  });

  refs.btnApplyCustom.addEventListener('click', () => {
    applyColorScheme({ refs, primary: refs.colorPrimary.value, secondary: refs.colorSecondary.value });
    setActivePreset('custom');
    showToast('自定义配色已应用');
  });

  refs.btnResetTheme.addEventListener('click', () => {
    const def = COLOR_SCHEMES.default;
    applyColorScheme({ refs, primary: def.primary, secondary: def.secondary });
    setActivePreset('default');
    showToast('已重置为默认配色');
  });

  const savedPrimary = localStorage.getItem('md-color-primary');
  const savedSecondary = localStorage.getItem('md-color-secondary');
  const savedScheme = localStorage.getItem('md-color-scheme') || 'default';

  if (savedPrimary && savedSecondary) {
    applyColorScheme({ refs, primary: savedPrimary, secondary: savedSecondary });
  }

  setActivePreset(savedScheme);
}

function updateThemeIcon({ refs, state }) {
  if (state.isDark) {
    refs.themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
  } else {
    refs.themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>`;
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyColorScheme({ refs, primary, secondary }) {
  const root = document.documentElement;
  root.style.setProperty('--accent-primary', primary);
  root.style.setProperty('--accent-secondary', secondary);
  root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${primary}, ${secondary})`);
  root.style.setProperty('--accent-glow', hexToRgba(primary, 0.2));
  root.style.setProperty('--border-accent', hexToRgba(primary, 0.27));

  localStorage.setItem('md-color-primary', primary);
  localStorage.setItem('md-color-secondary', secondary);

  refs.colorPrimary.value = primary;
  refs.colorSecondary.value = secondary;
  refs.hexPrimary.textContent = primary;
  refs.hexSecondary.textContent = secondary;
}

function setActivePreset(scheme) {
  document.querySelectorAll('.theme-preset-card').forEach(card => {
    card.classList.toggle('active', card.dataset.scheme === scheme);
  });

  if (scheme) {
    localStorage.setItem('md-color-scheme', scheme);
  }
}
