// Custom addition: React context for quarantine feature — filter detection and selection state.

import * as React from 'react';
import type { TestFileSummary } from './types';
import { useSearchParams } from './links';

export type QuarantineFilter = 'all' | 'passed' | 'failed' | 'flaky' | 'skipped';

export type QuarantineContextValue = {
  selectedTestIds: Set<string>;
  quarantineFilter: QuarantineFilter;
  isSelectable: (outcome: string) => boolean;
  // Full (unfiltered) file list — used by the confirmation dialog to resolve test names.
  fullFiles: TestFileSummary[];
  // Full (unfiltered) selectable IDs — used as denominators for checkbox state display.
  fullSelectableIdsByFileId: Map<string, string[]>;
  allFullSelectableIds: string[];
  toggleTest: (testId: string) => void;
  // toggleGroup operates on the filtered (visible) IDs — selects what you see.
  toggleGroup: (selectableTestIds: string[]) => void;
  // getGroupState uses the provided IDs as the denominator; pass full IDs for accurate state.
  getGroupState: (denominatorIds: string[]) => 'checked' | 'indeterminate' | 'unchecked';
};

export const QuarantineContext = React.createContext<QuarantineContextValue | null>(null);

export function useQuarantine(): QuarantineContextValue {
  const ctx = React.useContext(QuarantineContext);
  if (!ctx)
    throw new Error('useQuarantine must be used within a QuarantineProvider');
  return ctx;
}

export function detectQuarantineFilter(searchParams: URLSearchParams): QuarantineFilter {
  const q = searchParams.get('q') || '';
  if (q.includes('s:passed')) return 'passed';
  if (q.includes('s:failed')) return 'failed';
  if (q.includes('s:flaky')) return 'flaky';
  if (q.includes('s:skipped')) return 'skipped';
  return 'all';
}

export function isSelectableForFilter(filter: QuarantineFilter, outcome: string): boolean {
  if (filter === 'passed') return false;
  if (filter === 'failed') return outcome === 'unexpected';
  if (filter === 'flaky') return outcome === 'flaky';
  if (filter === 'skipped') return outcome === 'skipped';
  // 'all': failed and flaky (skipped tests are not shown on the 'all' filter)
  return outcome === 'unexpected' || outcome === 'flaky';
}

// Returns the checkbox label for a given filter and scope.
export function getQuarantineSelectLabel(filter: QuarantineFilter, scope: 'global' | 'file' | 'test'): string {
  const kind = filter === 'flaky' ? 'flaky' : filter === 'skipped' ? 'skipped' : 'failed';
  if (scope === 'test')
    return `Select ${kind} test`;
  const suffix = scope === 'file' ? ' in spec file' : '';
  return `Select all ${kind} tests${suffix}`;
}

export const QuarantineProvider: React.FC<{
  children: React.ReactNode;
  fullFiles: TestFileSummary[];
}> = ({ children, fullFiles }) => {
  const searchParams = useSearchParams();
  const quarantineFilter = detectQuarantineFilter(searchParams);
  const [selectedTestIds, setSelectedTestIds] = React.useState<Set<string>>(new Set());
  const prevFilterRef = React.useRef<QuarantineFilter>(quarantineFilter);

  // Reset selection when the status filter tab changes (not on text search changes).
  React.useEffect(() => {
    if (prevFilterRef.current !== quarantineFilter) {
      prevFilterRef.current = quarantineFilter;
      setSelectedTestIds(new Set());
    }
  }, [quarantineFilter]);

  const isSelectable = React.useCallback(
    (outcome: string) => isSelectableForFilter(quarantineFilter, outcome),
    [quarantineFilter]
  );

  // Precompute full (unfiltered) selectable IDs per file and globally.
  // These serve as denominators so checkbox state reflects true coverage,
  // not just what's visible under the current text search.
  const fullSelectableIdsByFileId = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const file of fullFiles) {
      const ids = file.tests
        .filter(t => isSelectableForFilter(quarantineFilter, t.outcome))
        .map(t => t.testId);
      map.set(file.fileId, ids);
    }
    return map;
  }, [fullFiles, quarantineFilter]);

  const allFullSelectableIds = React.useMemo(
    () => [...fullSelectableIdsByFileId.values()].flat(),
    [fullSelectableIdsByFileId]
  );

  const toggleTest = React.useCallback((testId: string) => {
    setSelectedTestIds(prev => {
      const next = new Set(prev);
      if (next.has(testId))
        next.delete(testId);
      else
        next.add(testId);
      return next;
    });
  }, []);

  const toggleGroup = React.useCallback((selectableTestIds: string[]) => {
    setSelectedTestIds(prev => {
      const allSelected = selectableTestIds.length > 0 && selectableTestIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of selectableTestIds)
          next.delete(id);
      } else {
        for (const id of selectableTestIds)
          next.add(id);
      }
      return next;
    });
  }, []);

  const getGroupState = React.useCallback((denominatorIds: string[]): 'checked' | 'indeterminate' | 'unchecked' => {
    if (!denominatorIds.length)
      return 'unchecked';
    const selectedCount = denominatorIds.filter(id => selectedTestIds.has(id)).length;
    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === denominatorIds.length) return 'checked';
    return 'indeterminate';
  }, [selectedTestIds]);

  return (
    <QuarantineContext.Provider value={{
      selectedTestIds,
      quarantineFilter,
      isSelectable,
      fullFiles,
      fullSelectableIdsByFileId,
      allFullSelectableIds,
      toggleTest,
      toggleGroup,
      getGroupState,
    }}>
      {children}
    </QuarantineContext.Provider>
  );
};
