
export default async function handler(req: any, res: any) {
  const { action } = req.query;

  // 1. 環境檢查 (SysCheck) - 確保回傳乾淨的 JSON
  if (action === 'check') {
      return res.status(200).json({
          api_key: !!process.env.API_KEY,
          oauth: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
      });
  }

  try {
      // 延遲載入 heavy package
      const { google } = await import('googleapis');
      const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
      const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
      const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/';

      if (!CLIENT_ID || !CLIENT_SECRET) {
          return res.status(200).json({ error: "伺服器環境缺失 GOOGLE_CLIENT_ID/SECRET 配置。" });
      }

      const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

      if (req.method === 'GET') {
        if (action === 'url') {
          const scopes = [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly'
          ];
          const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent'
          });
          return res.status(200).json({ url });
        }
      }

      if (req.method === 'POST') {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Missing code in body' });
        const { tokens } = await oauth2Client.getToken(code);
        return res.status(200).json({ tokens });
      }

      return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error: any) {
      console.error("AUTH_KERNEL_PANIC:", error);
      // 確保 catch 區塊也回傳 JSON
      return res.status(200).json({ 
          error: "授權系統內部故障: " + (error.message || "Unknown"),
          success: false 
      });
  }
}
