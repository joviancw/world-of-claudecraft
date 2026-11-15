// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  HOMEPAGE_HEADER_RESERVE_VAR,
  syncHomepageHeaderReserve,
} from '../src/ui/homepage_header_reserve';

describe('homepage_header_reserve', () => {
  it('writes the measured header height to the document root', () => {
    document.body.innerHTML = '<header class="homepage-header"></header>';
    const header = document.querySelector('.homepage-header') as HTMLElement;
    header.getBoundingClientRect = () =>
      ({
        height: 62,
        width: 800,
        top: 0,
        left: 0,
        right: 800,
        bottom: 62,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    syncHomepageHeaderReserve();
    expect(document.documentElement.style.getPropertyValue(HOMEPAGE_HEADER_RESERVE_VAR)).toBe(
      '62px',
    );
  });
});