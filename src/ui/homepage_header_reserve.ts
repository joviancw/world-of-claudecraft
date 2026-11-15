// Keeps full-screen character/login panels aligned under the fixed site header.
// The takeover uses a transparent top border on #charselect-panel /
// #charcreate-panel; this module measures the live header and writes
// --homepage-header-reserve so that border matches reality (menu open, locale,
// safe-area, and future header tweaks).

export const HOMEPAGE_HEADER_RESERVE_VAR = '--homepage-header-reserve';

export function syncHomepageHeaderReserve(
  doc: Document | undefined = globalThis.document,
): void {
  if (!doc) return;
  const header = doc.querySelector('.homepage-header');
  if (!header) {
    doc.documentElement.style.removeProperty(HOMEPAGE_HEADER_RESERVE_VAR);
    return;
  }
  const height = Math.ceil(header.getBoundingClientRect().height);
  doc.documentElement.style.setProperty(HOMEPAGE_HEADER_RESERVE_VAR, `${height}px`);
}

let homepageHeaderReserveInstalled = false;

export function installHomepageHeaderReserveSync(): void {
  if (homepageHeaderReserveInstalled || typeof window === 'undefined') return;
  homepageHeaderReserveInstalled = true;
  let raf = 0;
  const remeasure = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => syncHomepageHeaderReserve());
  };
  window.addEventListener('resize', remeasure, { passive: true });
  const header = document.querySelector('.homepage-header');
  if (header && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(header);
  }
}