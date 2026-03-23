// Custom addition: confirmation dialog for quarantine send/remove actions.

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import type { TestFileSummary } from './types';
import './quarantineConfirmDialog.css';

type Props = {
  isOpen: boolean;
  isRemove: boolean;
  selectedTestIds: Set<string>;
  fullFiles: TestFileSummary[];
  onConfirm: () => void;
  onClose: () => void;
};

export const QuarantineConfirmDialog: React.FC<Props> = ({
  isOpen, isRemove, selectedTestIds, fullFiles, onConfirm, onClose,
}) => {
  // Close on Escape key.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Build selected test list grouped by file, preserving report order.
  const groups: { fileName: string; labels: string[] }[] = [];
  for (const file of fullFiles) {
    const labels = file.tests
      .filter(t => selectedTestIds.has(t.testId))
      .map(t => [...t.path, t.title].join(' › '));
    if (labels.length)
      groups.push({ fileName: file.fileName, labels });
  }

  const title = isRemove ? 'Remove from Quarantine' : 'Send to Quarantine';
  const body = isRemove
    ? 'The following tests will be re-enabled in CI and will block merge requests if they fail. Confirm only if you have verified they pass reliably and are no longer flaky.'
    : 'The following tests will be quarantined and excluded from CI runs. They will not block merge requests, but will also not catch regressions during that time. Confirm only if you have investigated these failures and verified they are unrelated to your changes. Quarantining a test that exposes a real bug will hide that bug from CI.';

  return ReactDOM.createPortal(
    <div className='qcd-backdrop' onClick={onClose}>
      <div className='qcd-dialog' role='dialog' aria-modal='true' onClick={e => e.stopPropagation()}>
        <h2 className='qcd-title'>{title}</h2>
        <p className='qcd-body'>{body}</p>
        <div className='qcd-test-list'>
          {groups.map(({ fileName, labels }) => (
            <div key={fileName} className='qcd-file-group'>
              <div className='qcd-file-name'>{fileName}</div>
              <ul className='qcd-tests'>
                {labels.map(label => (
                  <li key={label} className='qcd-test-item'>{label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className='qcd-actions'>
          <button className='qcd-btn-cancel' onClick={onClose}>Cancel</button>
          <button
            className={isRemove ? 'qcd-btn-confirm-remove' : 'qcd-btn-confirm-send'}
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
