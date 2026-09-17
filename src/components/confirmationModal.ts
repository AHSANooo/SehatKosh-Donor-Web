export function showConfirmationModal(isOfflineOrId: boolean | string = false, isOffline: boolean = false): void {
  const modal = document.getElementById('confirmation-modal');
  const badgeDisplay = document.getElementById('confirmed-status-badge');
  const noteDisplay = document.getElementById('confirmed-note');

  if (!modal || !badgeDisplay) return;

  const offline = typeof isOfflineOrId === 'boolean' ? isOfflineOrId : isOffline;

  if (offline) {
    badgeDisplay.className =
      'inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200';
    badgeDisplay.textContent = 'QUEUED FOR SYNC';
    if (noteDisplay) {
      noteDisplay.textContent =
        'Prescription saved securely in local storage. It will be uploaded automatically once connection is restored.';
      noteDisplay.classList.remove('hidden');
    }
  } else {
    badgeDisplay.className =
      'inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200';
    badgeDisplay.textContent = 'VERIFIED & ARCHIVED';
    if (noteDisplay) {
      noteDisplay.textContent = '';
      noteDisplay.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
}

export function setupConfirmationModalEvents(onReset: () => void): void {
  const modal = document.getElementById('confirmation-modal');
  const resetBtn = document.getElementById('donate-another-btn');

  if (resetBtn && modal) {
    resetBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      onReset();
    });
  }
}

