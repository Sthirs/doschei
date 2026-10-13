// Installed Android PWAs can resume from the background with a stale window
// size, leaving the layout viewport too narrow until something triggers a
// reflow (a reopen or a rotation). Dispatching `resize` on resume makes the
// browser and any resize listeners re-measure.
export function installViewportResync(
  doc: Document = document,
  win: Window = window,
): () => void {
  const resync = () => {
    win.requestAnimationFrame(() => win.dispatchEvent(new Event('resize')));
  };

  const onVisibility = () => {
    if (doc.visibilityState === 'visible') resync();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pageshow', resync);
  win.addEventListener('focus', resync);

  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pageshow', resync);
    win.removeEventListener('focus', resync);
  };
}
