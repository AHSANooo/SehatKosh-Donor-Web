# SehatKosh Donor Web

A standalone, zero-cost, high-resilience web application designed for mobile clinicians to donate prescription scans and transcriptions to the SehatKosh research corpus.

---

## 🌟 Key Architecture & Features

- **Mobile-First Client**: Built with Vite, TypeScript, and Tailwind CSS v3.4. Enforces minimum 48px touch targets, dynamic viewport `min-h-[100dvh]`, and native camera triggers (`capture="environment"`).
- **Zero-Data-Loss Offline Engine**: Client-side persistence using IndexedDB (`idb-keyval`). If offline or experiencing socket drops, contributions are automatically preserved locally and re-synchronized upon reconnection with exponential backoff.
- **Client & Server PII Protection**: Real-time regex inspection and backend sanitization scrubbing Pakistani CNICs (`XXXXX-XXXXXXX-X`), mobile phone numbers, and clinician/patient names, wrapping clean clinical text in `<donor_transcription>` delimiters.
- **Serverless AWS Backend**:
  - `services/pre_sign.py`: MIME type whitelist verification, ULID generation, S3 pre-signed PUT URL minting.
  - `services/sanitize.py`: Magic-byte verification (JPEG, PNG, WebP), EXIF stripping, Pillow WebP re-encoding (85% quality), PII redaction, and CloudFront edge telemetry hashing.
- **Zero-Cost AWS Free Tier Infrastructure**: AWS SAM (`template.yaml`) configuring CloudFront, HTTP API Gateway v2, ARM64 Python 3.11 Lambdas, DynamoDB (on-demand), and private S3 with 24-hour raw intake buffer lifecycles.
- **Built-in Dev Emulation API**: Vite plugin emulates S3 binary uploads, pre-signing, and sanitization locally without requiring AWS credentials.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
pnpm install
# or: npm install
```

### 2. Start Dev Server
```bash
pnpm run dev
```
Open `http://localhost:5173/` in your browser. The app runs with the local mock API enabled by default.

### 3. Run Tests
```bash
# Frontend Unit Tests (Vitest)
pnpm test

# Production Bundle Build
pnpm run build

# Backend Python Tests
python -m unittest tests/test_lambda_services.py
```

---

## ☁️ AWS Production Deployment

### Prerequisites
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

### Deploy Backend Infrastructure
```bash
sam build
sam deploy --guided
```

### Configure Frontend for Production
Create a `.env.production` file:
```env
VITE_API_BASE_URL=https://<your-http-api-id>.execute-api.<region>.amazonaws.com
```

Build the static distribution:
```bash
pnpm run build
```
Deploy the contents of `dist/` to your CloudFront-backed S3 web hosting bucket.
