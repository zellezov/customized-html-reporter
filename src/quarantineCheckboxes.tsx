// Custom addition: quarantine checkbox components for file-level and test-level selection.

import * as React from 'react';
import type { TestCaseSummary } from './types';
import { useQuarantine, getQuarantineSelectLabel } from './quarantineContext';
import './quarantineCheckboxes.css';

/**
 * Checkbox shown in the chip-header (beforeToggle) for file-level selection.
 * Renders a placeholder if there are no selectable tests in the file.
 */
export const FileQuarantineCheckbox: React.FC<{ fileId: string; tests: TestCaseSummary[] }> = ({ fileId, tests }) => {
  const { isSelectable, toggleGroup, getGroupState, quarantineFilter, fullSelectableIdsByFileId } = useQuarantine();
  const checkboxRef = React.useRef<HTMLInputElement>(null);

  // Filtered (visible) IDs — used for toggling what the user sees.
  const selectableIds = React.useMemo(
    () => tests.filter(t => isSelectable(t.outcome)).map(t => t.testId),
    [tests, isSelectable]
  );

  // Full (unfiltered) IDs — used as denominator so checkbox state reflects true coverage.
  const fullIds = fullSelectableIdsByFileId.get(fileId) ?? selectableIds;

  const state = getGroupState(fullIds);

  React.useEffect(() => {
    if (checkboxRef.current)
      checkboxRef.current.indeterminate = state === 'indeterminate';
  }, [state]);

  if (!fullIds.length)
    return <span className='quarantine-checkbox-placeholder' />;

  const label = getQuarantineSelectLabel(quarantineFilter, 'file');

  return (
    <input
      ref={checkboxRef}
      type='checkbox'
      className='quarantine-checkbox'
      title={label}
      checked={state === 'checked'}
      onChange={() => toggleGroup(selectableIds)}
      onClick={e => e.stopPropagation()}
    />
  );
};

/**
 * Checkbox shown before the status icon in each test row.
 * Renders a placeholder if the test is not selectable (e.g. passed test on non-passed filter).
 */
export const TestQuarantineCheckbox: React.FC<{ test: TestCaseSummary }> = ({ test }) => {
  const { isSelectable, toggleTest, selectedTestIds, quarantineFilter } = useQuarantine();

  if (!isSelectable(test.outcome))
    return <span className='quarantine-checkbox-placeholder' />;

  const label = getQuarantineSelectLabel(quarantineFilter, 'test');

  return (
    <input
      type='checkbox'
      className='quarantine-checkbox'
      title={label}
      checked={selectedTestIds.has(test.testId)}
      onChange={() => toggleTest(test.testId)}
    />
  );
};
