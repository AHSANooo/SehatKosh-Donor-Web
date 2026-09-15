import { SessionResponse, CommitResponse } from '../types';

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function createSession(mimeType: string, fileSize: number): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mime_type: mimeType,
      file_size: fileSize,
      client_timestamp: Date.now(),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Session creation failed' }));
    throw new ApiError(response.status, errorData.error || `HTTP error ${response.status}`);
  }

  return response.json();
}

export function uploadToS3(
  uploadUrl: string,
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', blob.type);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
      } else {
        reject(new ApiError(xhr.status, `S3 direct upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network socket dropped during S3 direct upload'));
    };

    xhr.ontimeout = () => {
      reject(new Error('S3 direct upload timed out'));
    };

    xhr.send(blob);
  });
}

export async function commitDonation(
  donationId: string,
  transcription: string
): Promise<CommitResponse> {
  const response = await fetch(`${API_BASE}/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      donation_id: donationId,
      transcription: transcription,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Commit failed' }));
    throw new ApiError(response.status, errorData.error || `Commit failed with status ${response.status}`);
  }

  return response.json();
}
