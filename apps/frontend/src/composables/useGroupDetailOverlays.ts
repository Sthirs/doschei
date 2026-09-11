import { useRoutedOverlay } from '@/composables/useRoutedOverlay';

/**
 * Wires `GroupDetailView`'s two routed overlays (Totals, Export) into the
 * renamed bindings its template already uses. Split out of the view itself
 * so the two `useRoutedOverlay` calls don't push it over the ADR-0021 pure
 * LOC ceiling.
 */
export function useGroupDetailOverlays() {
  const totals = useRoutedOverlay('totals');
  const exportOverlay = useRoutedOverlay('export');

  return {
    showTotalsModal: totals.isOpen,
    openTotals: totals.open,
    closeTotals: totals.close,
    showExportModal: exportOverlay.isOpen,
    openExport: exportOverlay.open,
    closeExport: exportOverlay.close,
  };
}
