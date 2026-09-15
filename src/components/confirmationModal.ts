export function showConfirmationModal(donationId: string, isOffline: boolean = false): void {
  const modal = document.getElementById('confirmation-modal');
  const idDisplay = document.getElementById('confirmed-donation-id');
  const badgeDisplay = document.getElementById('confirmed-status-badge');
  const noteDisplay = document.getElementById('confirmed-note');

  if (!modal || !idDisplay || !badgeDisplay || !noteDisplay) return;

  idDisplay.textContent = donationId;

  if (isOffline) {
    badgeDisplay.className =
      'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30';
    badgeDisplay.textContent = 'QUEUED FOR SYNC';
    noteDisplay.textContent =
      'Prescription saved securely in local storage. It will be uploaded automatically once connection is restored.';
  } else {
    badgeDisplay.className =
      'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    badgeDisplay.textContent = 'VERIFIED & ARCHIVED';
    noteDisplay.textContent =
      'Prescription de-identified, normalized to WebP, and committed to the research corpus.';
  }

  modal.classList.remove('hidden');
}

export function setupConfirmationModalEvents(onReset: () => void): void {
  const modal = document.getElementById('confirmation-modal');
  const copyBtn = document.getElementById('copy-id-btn');
  const resetBtn = document.getElementById('donate-another-btn');
  const idDisplay = document.getElementById('confirmed-donation-id');

  if (copyBtn && idDisplay) {
    copyBtn.addEventListener('click', async () => {
      const id = idDisplay.textContent || '';
      if (id) {
        await navigator.clipboard.writeText(id);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span>Copied!</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 2000);
      }
    });
  }

  if (resetBtn && modal) {
    resetBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      onReset();
    });
  }
}
