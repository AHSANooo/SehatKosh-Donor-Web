import { get, set } from 'idb-keyval';
import { QueuedDonation } from '../types';
import { createSession, uploadToS3, commitDonation } from './api';

const QUEUE_STORAGE_KEY = 'sehatkosh_donation_offline_queue';

export type QueueUpdateListener = (count: number, items: QueuedDonation[]) => void;
const listeners: Set<QueueUpdateListener> = new Set();

export function subscribeToQueue(listener: QueueUpdateListener): () => void {
  listeners.add(listener);
  getQueue().then((items) => listener(items.length, items));
  return () => listeners.delete(listener);
}

async function notifyListeners(): Promise<void> {
  const items = await getQueue();
  for (const listener of listeners) {
    try {
      listener(items.length, items);
    } catch (err) {
      console.error('Error notifying queue listener:', err);
    }
  }
}

export async function getQueue(): Promise<QueuedDonation[]> {
  const queue = await get<QueuedDonation[]>(QUEUE_STORAGE_KEY);
  return queue || [];
}

export async function enqueueDonation(
  data: Omit<QueuedDonation, 'localId' | 'timestamp' | 'retryCount'>
): Promise<QueuedDonation> {
  const queue = await getQueue();
  const newItem: QueuedDonation = {
    ...data,
    localId: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: Date.now(),
    retryCount: 0,
  };
  queue.push(newItem);
  await set(QUEUE_STORAGE_KEY, queue);
  await notifyListeners();
  return newItem;
}

export async function removeQueuedDonation(localId: string): Promise<void> {
  const queue = await getQueue();
  const updated = queue.filter((item) => item.localId !== localId);
  await set(QUEUE_STORAGE_KEY, updated);
  await notifyListeners();
}

export async function updateQueueItem(
  localId: string,
  updater: (item: QueuedDonation) => QueuedDonation
): Promise<void> {
  const queue = await getQueue();
  const index = queue.findIndex((item) => item.localId === localId);
  if (index !== -1) {
    queue[index] = updater(queue[index]);
    await set(QUEUE_STORAGE_KEY, queue);
    await notifyListeners();
  }
}

let isFlushing = false;

/**
 * Flush pending records with exponential backoff
 */
export async function flushOfflineQueue(
  onStep?: (msg: string, current: number, total: number) => void
): Promise<{ successCount: number; failedCount: number }> {
  if (isFlushing) {
    return { successCount: 0, failedCount: 0 };
  }
  if (!navigator.onLine) {
    return { successCount: 0, failedCount: 0 };
  }

  isFlushing = true;
  let successCount = 0;
  let failedCount = 0;

  try {
    const queue = await getQueue();
    if (queue.length === 0) {
      return { successCount: 0, failedCount: 0 };
    }

    const total = queue.length;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (onStep) {
        onStep(`Processing queue item ${i + 1} of ${total}`, i + 1, total);
      }

      // Check exponential backoff delay based on retryCount: 2^n * 1000ms
      const backoffMs = Math.min(Math.pow(2, item.retryCount) * 1000, 30000);
      if (item.retryCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(backoffMs, 2000)));
      }

      try {
        // 1. Pre-sign session
        const session = await createSession(item.mimeType, item.imageBlob.size);

        // 2. Direct S3 PUT
        await uploadToS3(session.upload_url, item.imageBlob);

        // 3. Commit
        await commitDonation(session.donation_id, item.transcription);

        // 4. Remove from queue on success
        await removeQueuedDonation(item.localId);
        successCount++;
      } catch (err: any) {
        failedCount++;
        const errorMessage = err?.message || 'Network or upload failure';
        await updateQueueItem(item.localId, (curr) => ({
          ...curr,
          retryCount: curr.retryCount + 1,
          lastError: errorMessage,
        }));
      }
    }
  } finally {
    isFlushing = false;
  }

  return { successCount, failedCount };
}

// Background auto-sync listener on window 'online'
export function initOfflineSync(): void {
  window.addEventListener('online', () => {
    console.log('[SehatKosh Offline Sync] Reconnected. Flushing pending queue...');
    flushOfflineQueue().catch((err) =>
      console.warn('[SehatKosh Offline Sync] Flush error:', err)
    );
  });
}
