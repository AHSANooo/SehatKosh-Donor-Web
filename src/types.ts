export interface QueuedDonation {
  localId: string;
  imageBlob: Blob;
  fileName: string;
  mimeType: string;
  transcription: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export interface SessionRequest {
  mime_type: string;
  file_size: number;
  client_timestamp: number;
}

export interface SessionResponse {
  donation_id: string;
  upload_url: string;
  s3_key?: string;
}

export interface CommitRequest {
  donation_id: string;
  transcription: string;
}

export interface CommitResponse {
  status: 'SUCCESS' | 'ERROR';
  donation_id: string;
  error?: string;
}

export type ApplicationState = 'IDLE' | 'DRAFTING' | 'UPLOADING' | 'CONFIRMED';
