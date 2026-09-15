import { defineConfig, Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

/**
 * Local dev mock API plugin to emulate AWS Lambda & S3 locally
 */
function localMockApiPlugin(): Plugin {
  const inMemoryStorage = new Map<string, { buffer: Buffer; mimeType: string }>();

  return {
    name: 'local-mock-api',
    configureServer(server) {
      // 1. Session & Pre-Sign Mock: POST /api/session
      server.middlewares.use('/api/session', (req, res, next) => {
        if (req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { mime_type, file_size } = body;

              if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime_type)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid MIME type' }));
                return;
              }

              if (file_size && file_size > 10 * 1024 * 1024) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File size exceeds 10MB limit' }));
                return;
              }

              // Generate pseudo-ULID
              const mockUlid = `01JC8ZP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
              const uploadUrl = `/api/mock-s3-upload/${mockUlid}`;

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  donation_id: mockUlid,
                  upload_url: uploadUrl,
                  s3_key: `raw-intake/${mockUlid}.tmp`,
                })
              );
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });

      // 2. S3 Direct Binary Upload Mock: PUT /api/mock-s3-upload/:id
      server.middlewares.use('/api/mock-s3-upload', (req, res, next) => {
        if (req.method === 'PUT') {
          const donationId = req.url?.replace(/^\//, '').split('?')[0];
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => {
            chunks.push(Buffer.from(chunk));
          });
          req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || 'image/jpeg';
            if (donationId) {
              inMemoryStorage.set(donationId, { buffer, mimeType: contentType });
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Binary successfully uploaded to mock S3' }));
          });
        } else {
          next();
        }
      });

      // 3. Commit & Sanitize Mock: POST /api/commit
      server.middlewares.use('/api/commit', (req, res, next) => {
        if (req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const { donation_id, transcription } = body;

              if (!donation_id) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'donation_id is required' }));
                return;
              }

              // Scrub PII for local preview
              const cnicRegex = /\b\d{5}[-]?\d{7}[-]?\d{1}\b/g;
              const phoneRegex = /(\+92|0)?3\d{2}[-\s]?\d{7}\b/g;
              const nameRegex = /\b(dr|doctor|patient|mr|mrs|ms)\.?\s+[a-zA-Z]+/gi;

              const sanitizedText = (transcription || '')
                .replace(cnicRegex, '[REDACTED_CNIC]')
                .replace(phoneRegex, '[REDACTED_PHONE]')
                .replace(nameRegex, '[REDACTED_NAME]');

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  status: 'SUCCESS',
                  donation_id,
                  transcription_sanitized: sanitizedText,
                  storage: 'sanitized-archive/mock',
                })
              );
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [localMockApiPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
});
