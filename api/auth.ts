import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/';

export default async function handler(req: any, res: any) {
  try {
      // Diagnostic check
      if (!CLIENT_ID || !CLIENT_SECRET) {
          console.error("Missing Google OAuth Env Vars");
          return res.status(500).json({ 
              error: 'Server Misconfiguration: GOOGLE_CLIENT_ID or SECRET missing.' 
          });
      }

      const oauth2Client = new google.auth.OAuth2(
        CLIENT_ID,
        CLIENT_SECRET,
        REDIRECT_URI
      );

      // 1. Generate Auth URL (GET)
      if (req.method === 'GET') {
        const { action } = req.query;

        if (action === 'url') {
          const scopes = [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly'
          ];

          const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent' // Force refresh token
          });

          return res.status(200).json({ url });
        }
      }

      // 2. Exchange Code for Tokens (POST)
      if (req.method === 'POST') {
        const { code } = req.body;
        if (!code) {
          return res.status(400).json({ error: 'Missing auth code' });
        }

        try {
          const { tokens } = await oauth2Client.getToken(code);
          return res.status(200).json({ tokens });
        } catch (error: any) {
          console.error('Error exchanging token:', error);
          return res.status(500).json({ error: 'Failed to exchange token: ' + error.message });
        }
      }

      return res.status(400).json({ error: 'Invalid request method' });

  } catch (error: any) {
      console.error("Auth Endpoint Error:", error);
      return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}