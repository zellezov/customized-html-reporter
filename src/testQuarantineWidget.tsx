// Custom addition: non-collapsible header row for quarantine test management.

import * as React from 'react';
import type { TestFileSummary } from './types';
import { useQuarantine, getQuarantineSelectLabel } from './quarantineContext';
import { clsx } from '@web/uiUtils';
import './chip.css';
import './testQuarantineWidget.css';

export const TestQuarantineWidget: React.FC<{ files: TestFileSummary[] }> = ({ files }) => {
  const { quarantineFilter, isSelectable, toggleGroup, getGroupState, selectedTestIds, allFullSelectableIds } = useQuarantine();
  const globalCheckboxRef = React.useRef<HTMLInputElement>(null);

  // Filtered (visible) IDs — used for toggling what the user sees.
  const allSelectableIds = React.useMemo(
    () => files.flatMap(f => f.tests).filter(t => isSelectable(t.outcome)).map(t => t.testId),
    [files, isSelectable]
  );

  const isPassed = quarantineFilter === 'passed';
  // Use full (unfiltered) IDs as denominator so global checkbox reflects true coverage.
  const globalState = isPassed ? 'unchecked' : getGroupState(allFullSelectableIds);

  React.useEffect(() => {
    if (globalCheckboxRef.current)
      globalCheckboxRef.current.indeterminate = !isPassed && globalState === 'indeterminate';
  }, [isPassed, globalState]);

  const labelText = getQuarantineSelectLabel(quarantineFilter, 'global');
  const isRemove = quarantineFilter === 'skipped';
  const count = selectedTestIds.size;
  const buttonEnabled = count > 0;
  const countLabel = `${count} test${count !== 1 ? 's' : ''}`;
  const buttonLabel = !buttonEnabled
    ? (isRemove ? 'Remove from Quarantine' : 'Send to Quarantine')
    : (isRemove ? `Remove ${countLabel} from Quarantine` : `Send ${countLabel} to Quarantine`);

  return (
    <div className='chip'>
      <div className='chip-header expanded-false quarantine-widget-header'>
        <label className={clsx('quarantine-global-label', isPassed && 'quarantine-global-label-disabled')}>
          <input
            ref={globalCheckboxRef}
            type='checkbox'
            className='quarantine-checkbox-global'
            disabled={isPassed}
            checked={globalState === 'checked'}
            onChange={() => toggleGroup(allSelectableIds)}
          />
          <span className='quarantine-global-label-text'>{labelText}</span>
        </label>
        <span className='quarantine-widget-spacer' />
        <button
          disabled={!buttonEnabled}
          className={clsx('quarantine-widget-button', isRemove ? 'quarantine-widget-button-remove' : 'quarantine-widget-button-send')}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
};
