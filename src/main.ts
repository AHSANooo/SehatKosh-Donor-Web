import './style.css';
import { ApplicationState } from './types';
import { createSession, uploadToS3, commitDonation } from './services/api';
import {
  enqueueDonation,
  subscribeToQueue,
  initOfflineSync,
} from './services/offlineQueue';
import { analyzePii } from './components/piiShield';
import { setupConfirmationModalEvents, showConfirmationModal } from './components/confirmationModal';
import { setupQueueDrawerEvents } from './components/queueDrawer';

// State variables
let currentState: ApplicationState = 'IDLE';
let selectedFile: File | null = null;

// DOM Element references
const form = document.getElementById('donation-form') as HTMLFormElement;
const imageInput = document.getElementById('image-input') as HTMLInputElement;
const dropZone = document.getElementById('drop-zone') as HTMLElement;
const previewContainer = document.getElementById('preview-container') as HTMLElement;
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const uploadPrompt = document.getElementById('upload-prompt') as HTMLElement;
const clearImageBtn = document.getElementById('clear-image') as HTMLButtonElement;
const imageMetaBadge = document.getElementById('image-meta-badge') as HTMLElement;

const transcriptionInput = document.getElementById('transcription-input') as HTMLTextAreaElement;
const charCounter = document.getElementById('char-counter') as HTMLElement;
const piiBadge = document.getElementById('pii-shield-badge') as HTMLElement;

const uploadProgressBar = document.getElementById('upload-progress-bar') as HTMLElement;
const progressFill = document.getElementById('progress-fill') as HTMLElement;
const uploadStatusText = document.getElementById('upload-status-text') as HTMLElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const networkPill = document.getElementById('network-pill') as HTMLElement;
const queuePillBtn = document.getElementById('queue-pill-btn') as HTMLElement;
const queueCountBadge = document.getElementById('queue-count-badge') as HTMLElement;
const alertBanner = document.getElementById('alert-banner') as HTMLElement;
const alertMessage = document.getElementById('alert-message') as HTMLElement;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

function showAlert(message: string, isError: boolean = true) {
  if (!alertBanner || !alertMessage) return;
  alertMessage.textContent = message;
  alertBanner.className = isError
    ? 'p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center justify-between shadow-xs transition'
    : 'p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center justify-between shadow-xs transition';
  alertBanner.classList.remove('hidden');
}

function hideAlert() {
  if (alertBanner) alertBanner.classList.add('hidden');
}

function updateNetworkStatus() {
  const isOnline = navigator.onLine;
  if (!networkPill) return;

  if (isOnline) {
    networkPill.className =
      'text-xs px-2.5 py-1 rounded-full border border-emerald-200 text-emerald-800 bg-emerald-50 font-mono flex items-center gap-1.5 transition cursor-default';
    networkPill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> ONLINE`;
  } else {
    networkPill.className =
      'text-xs px-2.5 py-1 rounded-full border border-amber-300 text-amber-800 bg-amber-50 font-mono flex items-center gap-1.5 transition cursor-default';
    networkPill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> OFFLINE`;
  }

  validateForm();
}

function validateForm(): boolean {
  const hasImage = selectedFile !== null;
  const rawText = transcriptionInput ? transcriptionInput.value.trim() : '';
  const textLength = rawText.length;
  const isTextValid = textLength >= 10 && textLength <= 4000;

  const isValid = hasImage && isTextValid;

  if (submitBtn && currentState !== 'UPLOADING') {
    submitBtn.disabled = !isValid;

    if (!isValid) {
      if (!hasImage && textLength < 10) {
        submitBtn.innerHTML = `<span>Upload (Min 10 chars)</span>`;
      } else if (!hasImage) {
        submitBtn.innerHTML = `<span>Upload (Select image)</span>`;
      } else if (textLength === 0) {
        submitBtn.innerHTML = `<span>Upload (Min 10 chars)</span>`;
      } else {
        submitBtn.innerHTML = `<span>Upload (${10 - textLength} more chars needed)</span>`;
      }
    } else {
      submitBtn.innerHTML = `<span>Upload</span>`;
    }
  }

  return isValid;
}

function setAppState(state: ApplicationState) {
  currentState = state;
  switch (state) {
    case 'IDLE':
    case 'DRAFTING':
      if (uploadProgressBar) uploadProgressBar.classList.add('hidden');
      if (transcriptionInput) transcriptionInput.disabled = false;
      if (imageInput) imageInput.disabled = false;
      validateForm();
      break;

    case 'UPLOADING':
      if (uploadProgressBar) uploadProgressBar.classList.remove('hidden');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Uploading...</span>
        `;
      }
      if (transcriptionInput) transcriptionInput.disabled = true;
      if (imageInput) imageInput.disabled = true;
      break;

    case 'CONFIRMED':
      if (uploadProgressBar) uploadProgressBar.classList.add('hidden');
      break;
  }
}

function updateProgress(percent: number, statusText: string) {
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  if (uploadStatusText) {
    uploadStatusText.textContent = `${percent}% — ${statusText}`;
  }
}

function handleFileSelection(file: File) {
  hideAlert();
  if (!ALLOWED_MIMES.includes(file.type)) {
    showAlert('Invalid file type. Please provide a JPG, PNG, or WebP image.');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showAlert(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed is 10MB.`);
    return;
  }

  selectedFile = file;
  const objectUrl = URL.createObjectURL(file);
  imagePreview.src = objectUrl;

  const formattedSize =
    file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;

  if (imageMetaBadge) {
    imageMetaBadge.textContent = `${file.name} (${formattedSize})`;
    imageMetaBadge.className = 'text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md';
    imageMetaBadge.classList.remove('hidden');
  }

  previewContainer.classList.remove('hidden');
  uploadPrompt.classList.add('hidden');
  setAppState('DRAFTING');
}

function clearImage() {
  selectedFile = null;
  imageInput.value = '';
  imagePreview.src = '';
  previewContainer.classList.add('hidden');
  uploadPrompt.classList.remove('hidden');
  if (imageMetaBadge) {
    imageMetaBadge.classList.add('hidden');
  }
  validateForm();
}

function resetForm() {
  clearImage();
  if (transcriptionInput) transcriptionInput.value = '';
  if (charCounter) {
    charCounter.textContent = '0 / 4000 (Min 10)';
    charCounter.className = 'text-[10px] font-mono text-slate-500';
  }
  if (piiBadge) piiBadge.classList.add('hidden');
  hideAlert();
  setAppState('IDLE');
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
  initOfflineSync();
  updateNetworkStatus();

  window.addEventListener('online', () => {
    updateNetworkStatus();
    showAlert('Connection restored. Online sync active.', false);
    setTimeout(hideAlert, 4000);
  });

  window.addEventListener('offline', () => {
    updateNetworkStatus();
    showAlert('You are offline. Contributions will be safely stored in the local queue.', true);
  });

  // Subscribe to offline queue count (only show if there are pending donations)
  subscribeToQueue((count) => {
    if (queuePillBtn) {
      if (count > 0) {
        queuePillBtn.classList.remove('hidden');
        if (queueCountBadge) {
          queueCountBadge.textContent = `${count}`;
        }
      } else {
        queuePillBtn.classList.add('hidden');
      }
    }
  });

  // Camera and File picker drop zone events
  if (dropZone && imageInput) {
    dropZone.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'clear-image') return;
      imageInput.click();
    });

    imageInput.addEventListener('change', () => {
      if (imageInput.files && imageInput.files[0]) {
        handleFileSelection(imageInput.files[0]);
      }
    });

    // Drag and Drop
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('border-emerald-500', 'bg-emerald-50/40');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-emerald-500', 'bg-emerald-50/40');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelection(e.dataTransfer.files[0]);
      }
    });
  }

  if (clearImageBtn) {
    clearImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearImage();
    });
  }

  // Clinical Tag Chips
  document.querySelectorAll('.clinical-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const tag = (e.currentTarget as HTMLElement).dataset.tag;
      if (tag && transcriptionInput) {
        const start = transcriptionInput.selectionStart;
        const end = transcriptionInput.selectionEnd;
        const currentVal = transcriptionInput.value;
        transcriptionInput.value = currentVal.substring(0, start) + tag + ' ' + currentVal.substring(end);
        transcriptionInput.focus();
        transcriptionInput.selectionStart = transcriptionInput.selectionEnd = start + tag.length + 1;
        transcriptionInput.dispatchEvent(new Event('input'));
      }
    });
  });

  // Transcription real-time input validation & PII shield analysis
  if (transcriptionInput) {
    transcriptionInput.addEventListener('input', () => {
      const length = transcriptionInput.value.trim().length;
      if (charCounter) {
        charCounter.textContent = `${length} / 4000 (Min 10)`;
        if (length < 10) {
          charCounter.className = 'text-[10px] font-mono text-amber-600 font-medium';
        } else {
          charCounter.className = 'text-[10px] font-mono text-slate-500';
        }
      }

      // Analyze PII
      const pii = analyzePii(transcriptionInput.value);
      if (piiBadge) {
        if (pii.hasPii) {
          piiBadge.textContent = `Shield Active: ${pii.totalMatches} PII indicator(s) scrubbed`;
          piiBadge.className = 'absolute bottom-2.5 right-2.5 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md shadow-2xs';
          piiBadge.classList.remove('hidden');
        } else {
          piiBadge.classList.add('hidden');
        }
      }

      validateForm();
    });
  }

  // Close alert button
  const closeAlertBtn = document.getElementById('close-alert-btn');
  if (closeAlertBtn) {
    closeAlertBtn.addEventListener('click', hideAlert);
  }

  // Form submission handler
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm() || !selectedFile) return;

      const transcriptionText = transcriptionInput.value.trim();
      const fileToUpload = selectedFile;

      // 1. Check if offline
      if (!navigator.onLine) {
        try {
          const queued = await enqueueDonation({
            imageBlob: fileToUpload,
            fileName: fileToUpload.name,
            mimeType: fileToUpload.type,
            transcription: transcriptionText,
          });

          showConfirmationModal(queued.localId, true);
          resetForm();
        } catch (err: any) {
          showAlert(`Failed to store offline donation: ${err.message}`);
        }
        return;
      }

      // 2. Online Ingestion Flow
      setAppState('UPLOADING');
      updateProgress(10, 'Requesting upload session...');

      try {
        // Step 1: Session & Pre-Sign
        const session = await createSession(fileToUpload.type, fileToUpload.size);
        updateProgress(30, 'Session granted. Streaming to secure storage...');

        // Step 2: Direct Binary S3 PUT
        await uploadToS3(session.upload_url, fileToUpload, (uploadPercent) => {
          const scaled = 30 + Math.round((uploadPercent / 100) * 50); // 30% to 80%
          updateProgress(scaled, `Streaming scan: ${uploadPercent}%`);
        });

        updateProgress(85, 'Sanitizing, stripping EXIF, and verifying...');

        // Step 3: Commit & Sanitize
        const commitRes = await commitDonation(session.donation_id, transcriptionText);

        updateProgress(100, 'Contribution confirmed!');
        showConfirmationModal(commitRes.donation_id, false);
        resetForm();
      } catch (err: any) {
        console.error('Submission failed:', err);
        // On network failure, automatically save to offline queue
        try {
          const queued = await enqueueDonation({
            imageBlob: fileToUpload,
            fileName: fileToUpload.name,
            mimeType: fileToUpload.type,
            transcription: transcriptionText,
          });
          showConfirmationModal(queued.localId, true);
          showAlert(
            `Network upload interrupted (${err.message}). Saved securely to your offline queue.`,
            true
          );
          resetForm();
        } catch (queueErr) {
          showAlert(`Submission failed: ${err.message}`);
          setAppState('DRAFTING');
        }
      }
    });
  }

  // Setup Modals and Drawers
  setupConfirmationModalEvents(resetForm);
  setupQueueDrawerEvents();
});
