# YouTube Shorts Automation System (Full Stack)

A modular AI system that automates the lifecycle of YouTube Shorts creation: from trend analysis and scriptwriting to AI video generation (Veo) and automated uploading (YouTube Data API).

**Architecture:**
*   **Frontend**: React + Tailwind CSS (Vite based)
*   **Backend**: Serverless Functions (Next.js / Vercel API Routes compatible)
*   **AI Engine**: Google GenAI SDK (Gemini 2.5 Flash, Veo 3.1)

---

## 🛠️ Configuration Guide

To run this project, you need to configure two main parts:
1.  **Google GenAI API Key** (for AI Text & Video generation).
2.  **Google Cloud OAuth 2.0** (for YouTube uploading).

### Phase 1: Google Cloud Platform (GCP) Setup

You must create a Google Cloud Project to allow users to log in with their YouTube accounts.

1.  **Create Project**: Go to [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2.  **Enable APIs**:
    *   Navigate to **APIs & Services > Library**.
    *   Search for and enable **YouTube Data API v3**.
3.  **OAuth Consent Screen**:
    *   Go to **APIs & Services > OAuth consent screen**.
    *   Select **External** (unless you are in a Google Workspace org).
    *   Fill in required fields (App name, email).
    *   **Scopes**: Add `.../auth/youtube.upload` and `.../auth/youtube.readonly`.
    *   **Test Users**: Add your own Google email address (important while app is in "Testing" mode).
4.  **Create Credentials**:
    *   Go to **APIs & Services > Credentials**.
    *   Click **Create Credentials > OAuth client ID**.
    *   Application type: **Web application**.
    *   **Authorized redirect URIs** (Add both):
        *   `http://localhost:3000/` (For local development)
        *   `https://<your-project-name>.vercel.app/` (For Vercel production, add this *after* you deploy)
    *   **Copy** the `Client ID` and `Client Secret`.

### Phase 2: Environment Variables

Create a `.env` file in the root directory (do not commit this file):

```env
# 1. AI Generation (Gemini & Veo)
# Get key from: https://aistudio.google.com/
API_KEY=your_google_ai_studio_api_key

# 2. YouTube OAuth (From GCP Step 4)
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret

# 3. App Config
# Local: http://localhost:3000/
# Prod: https://your-app.vercel.app/
GOOGLE_REDIRECT_URI=http://localhost:3000/
```

---

## 🚀 Local Development

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Start Server**:
    ```bash
    npm run dev
    ```

3.  **Open App**:
    Visit `http://localhost:3000`.

4.  **Workflow**:
    *   Click **"連結 YouTube 帳號"**. This will redirect you to Google Login.
    *   After login, you will be redirected back with an auth code.
    *   Click **"一鍵啟動後端自動化流程"** to run the pipeline.

---

## ☁️ Deployment (Vercel)

1.  **Push to GitHub**: Commit your code to a repository.
2.  **Import to Vercel**: Create a new project in Vercel and import your repo.
3.  **Set Environment Variables**:
    In Vercel Project Settings > Environment Variables, add:
    *   `API_KEY`
    *   `GOOGLE_CLIENT_ID`
    *   `GOOGLE_CLIENT_SECRET`
    *   `GOOGLE_REDIRECT_URI` -> Set this to your generic Vercel URL (e.g., `https://my-shorts-app.vercel.app/`)
4.  **Update Google Cloud**:
    *   Go back to Google Cloud Console > Credentials.
    *   Edit your OAuth Client.
    *   Add your Vercel URL (e.g., `https://my-shorts-app.vercel.app/`) to **Authorized redirect URIs**.
5.  **Redeploy**: You might need to redeploy or verify the env vars are active.

---

## 🧩 Modules & Responsibilities

| Module | Description | Inputs | Outputs |
| :--- | :--- | :--- | :--- |
| **TrendSignalExtractor** | Analyzes raw view counts & hashtags. | `ShortsData[]` | `TrendSignals` |
| **CandidateThemeGenerator** | Brainstorms 3 viral concepts. | `TrendSignals` | `CandidateTheme[]` |
| **CandidateWeightEngine** | Scores concepts based on channel fit. | `CandidateTheme[]`, `ChannelState` | `CandidateTheme[]` (with scores) |
| **PromptComposer** | Writes Veo prompt & YouTube metadata. | `CandidateTheme` (Selected) | `PromptOutput` |
| **VideoGenerator** | Calls Veo model to generate MP4. | `PromptOutput` | `VideoAsset` (Base64/Blob) |
| **UploaderScheduler** | Uploads to YouTube via OAuth2. | `VideoAsset`, `AuthCredentials` | `UploadResult` |

---

## ⚠️ Known Limitations & Quotas

*   **Veo Video Generation**: This is a premium/preview feature. Ensure your `API_KEY` project has access to the Veo model. Generation takes 1-2 minutes.
*   **YouTube Quota**: Unverified Google Cloud projects have a daily quota of 10,000 units. A video upload costs 1,600 units. You can upload ~6 videos/day in testing mode.
*   **Token Expiry**: The OAuth token typically lasts 1 hour. The app handles the access token, but implementing Refresh Token logic is recommended for long-running server-side automation (current implementation requires re-login per session).

---
**Project Lead**: Grok
**Lead Engineer**: Gemini