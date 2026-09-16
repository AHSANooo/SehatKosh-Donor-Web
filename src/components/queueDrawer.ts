import { getQueue, removeQueuedDonation, flushOfflineQueue } from '../services/offlineQueue';

export function renderQueueDrawer(): void {
  const drawer = document.getElementById('queue-drawer');
  if (!drawer) return;

  const container = document.getElementById('queue-items-container');
  if (!container) return;

  getQueue().then((items) => {
    if (items.length === 0) {
      container.innerHTML = `
        <div class="py-8 text-center text-slate-400 text-xs font-mono">
          <svg class="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 13l4 4L19 7" />
          </svg>
          No pending offline donations.
        </div>
      `;
      return;
    }

    container.innerHTML = items
      .map(
        (item) => `
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
        <div class="flex items-center justify-between">
          <span class="font-mono text-emerald-700 font-semibold text-[11px]">${item.localId}</span>
          <span class="text-[10px] text-slate-500 font-mono">${new Date(item.timestamp).toLocaleTimeString()}</span>
        </div>
        <p class="text-slate-700 line-clamp-2 italic text-[11px]">"${item.transcription}"</p>
        <div class="flex items-center justify-between pt-1 border-t border-slate-200 text-[10px] text-slate-500">
          <span>Retries: ${item.retryCount} ${item.lastError ? `(${item.lastError})` : ''}</span>
          <button data-id="${item.localId}" class="remove-queue-btn text-rose-600 hover:text-rose-700 px-2.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 transition font-mono touch-manipulation">
            Remove
          </button>
        </div>
      </div>
    `
      )
      .join('');

    // Bind remove buttons
    container.querySelectorAll('.remove-queue-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id;
        if (id) {
          await removeQueuedDonation(id);
          renderQueueDrawer();
        }
      });
    });
  });
}

export function setupQueueDrawerEvents(): void {
  const openBtn = document.getElementById('queue-pill-btn');
  const closeBtn = document.getElementById('close-queue-drawer');
  const drawer = document.getElementById('queue-drawer');
  const flushBtn = document.getElementById('flush-queue-btn');

  if (openBtn && drawer) {
    openBtn.addEventListener('click', () => {
      renderQueueDrawer();
      drawer.classList.remove('hidden');
    });
  }

  if (closeBtn && drawer) {
    closeBtn.addEventListener('click', () => {
      drawer.classList.add('hidden');
    });
  }

  if (flushBtn) {
    flushBtn.addEventListener('click', async () => {
      flushBtn.setAttribute('disabled', 'true');
      flushBtn.textContent = 'Syncing...';
      try {
        await flushOfflineQueue();
        renderQueueDrawer();
      } finally {
        flushBtn.removeAttribute('disabled');
        flushBtn.textContent = 'Force Sync Now';
      }
    });
  }
}
