/** App name with optional custom logo image; falls back to the robot icon. */
export function BrandMark({ name, logo, class: className = '' }) {
  return (
    <span class={className}>
      {logo ? (
        <img src={logo} alt="" class="brand-logo me-2" width="28" height="28" />
      ) : (
        <i class="bi bi-robot me-2" aria-hidden="true"></i>
      )}
      {name}
    </span>
  );
}

export function readBrand() {
  const root = document.documentElement;
  return {
    name: root.dataset.appName || 'Hermes',
    logo: root.dataset.appLogo || '',
  };
}

export function applyBrand(state) {
  const root = document.documentElement;
  const name = state?.app_name || state?.name || root.dataset.appName || 'Hermes';
  root.dataset.appName = name;
  document.title = name;
  const logo = state?.urls?.logo || state?.logo || '';
  if (logo) root.dataset.appLogo = logo;
  else delete root.dataset.appLogo;
  dispatchEvent(new Event('kocoui:branding'));
  return { name, logo };
}
