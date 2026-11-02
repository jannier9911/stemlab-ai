# STEMLAB AI

Starter project for a public web app that separates an uploaded music track into five downloadable stems using the AudioShake Tasks API.

## Five outputs

1. Vocals
2. Drums
3. Bass
4. Piano
5. Other instruments (AudioShake `residual`: everything not covered by the other requested stems)

The `residual` stem is not guaranteed to be a clean "other instruments" category. It is the remainder after the requested models have been separated.

## Requirements

- Python 3.10+
- Node.js 20+
- An AudioShake API key

AudioShake's API is paid by credits. Its developer docs currently state 10 free starter credits on signup; the stem models are billed per minute. Five requested targets therefore consume credits for each target. Check your account's model availability and pricing before allowing public uploads.

## 1. Configure the backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

Copy `.env.example` to `.env` and add your API key:

```env
AUDIOSHAKE_API_KEY=your_real_key_here
FRONTEND_ORIGIN=http://localhost:5173
MAX_UPLOAD_MB=100
```

Never put the API key in frontend code or commit `.env`.

Run the API:

```bash
uvicorn app:app --reload --port 8000
```

## 2. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

## 3. Test

Upload an audio file you own or have permission to process. The backend:
- validates the extension and size,
- uploads the file to AudioShake's `/assets`,
- creates a `/tasks` job for vocals, drums, bass, piano and residual,
- lets the frontend poll task status,
- returns the provider's output links when complete.

## API routes

- `GET /api/health`
- `POST /api/separations` (multipart field: `file`)
- `GET /api/separations/{task_id}`
- `GET /api/separations/{task_id}/download` (ZIP)

## Important production work still required

This is a runnable MVP starter, not a deployed production service. Before opening it publicly, add:
- user authentication and per-user quotas/rate limits,
- abuse prevention and CAPTCHA,
- durable job storage (PostgreSQL/Redis) rather than in-memory/provider-only lookup,
- secure private object storage and short-lived download URLs,
- automated deletion/retention policy,
- billing/credit limits and monitoring,
- HTTPS, production CORS, logging, alerts and backups,
- legal terms, privacy policy and copyright/permission checks.

The app is free to end users only if you fund the API usage and enforce fair-use limits. Do not promise unlimited free processing.

## References

- AudioShake API intro: https://developer.audioshake.ai/
- Upload asset: https://developer.audioshake.ai/api-reference/assets/upload
- Create task: https://developer.audioshake.ai/api-reference/tasks/create
- Get task: https://developer.audioshake.ai/api-reference/tasks/get
- Stem models: https://developer.audioshake.ai/models
- Instrument separation guide: https://developer.audioshake.ai/separate-stems


## Public deployment (one URL)

This repository includes a Dockerfile and Render Blueprint so the React site and API can run under one public URL.

1. Create a GitHub repository and upload the contents of this project (do not upload any `.env` file or API key).
2. In Render, choose **New → Blueprint**, connect that GitHub repository, and deploy the `render.yaml` service.
3. When Render asks for `AUDIOSHAKE_API_KEY`, enter the key privately in Render's environment-variable form. Never put it in frontend code or GitHub.
4. Wait for the deployment to finish, then open the `*.onrender.com` URL Render gives you. Check `/api/health`.

The Render free instance may sleep when idle and can have resource/time limits. Public anonymous use also needs abuse protection and spending limits before promotion; the AudioShake credits are paid from the account connected to this API key.
