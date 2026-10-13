import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installViewportResync } from '@/lib/viewportResync';

describe('installViewportResync', () => {
  let uninstall: () => void;
  let onResize: ReturnType<typeof vi.fn<() => void>>;

  const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    onResize = vi.fn<() => void>();
    window.addEventListener('resize', onResize);
    uninstall = installViewportResync(document, window);
  });

  afterEach(() => {
    uninstall();
    window.removeEventListener('resize', onResize);
    vi.restoreAllMocks();
  });

  it('dispatches resize when the page becomes visible', () => {
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch resize when the page becomes hidden', () => {
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onResize).not.toHaveBeenCalled();
  });

  it('dispatches resize on pageshow and focus', () => {
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('focus'));
    expect(onResize).toHaveBeenCalledTimes(2);
  });

  it('stops listening after uninstall', () => {
    uninstall();
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(onResize).not.toHaveBeenCalled();
  });
});
