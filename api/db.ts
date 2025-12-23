
export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();
  
  if (!ID_OR_URL) {
    return res.status(200).json({ 
      success: false, 
      error: '環境變數遺失: 請在 Vercel 設定中配置 VITE_FIREBASE_PROJECT_ID。' 
    });
  }

  const getFullUrl = (input: string) => {
    // 1. 如果已經是完整網址，直接回傳
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }

    // 2. 判斷是否為新版或特定區域的 Realtime Database (通常包含 -default-rtdb)
    if (input.includes('-default-rtdb')) {
      // 假設格式為 my-project-id-default-rtdb
      return `https://${input}.asia-southeast1.firebasedatabase.app/channels.json`;
    }

    // 3. 判斷是否包含區域點 (如 project.region)
    if (input.includes('.')) {
      const parts = input.split('.');
      return `https://${parts[0]}.${parts[1]}.firebasedatabase.app/channels.json`;
    }

    // 4. 預設為舊版美國區域
    return `https://${input}.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);

  try {
    if (action === 'list') {
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) {
        if (dbRes.status === 404) {
          throw new Error(`找不到路徑 (404)。解決方案：1. 前往 Firebase Console > Realtime Database 點擊「建立資料庫」。2. 檢查資料庫區域，如果不是美國，請在 Vercel 中將 VITE_FIREBASE_PROJECT_ID 設為完整網址。當前嘗試連線: ${DB_URL}`);
        }
        throw new Error(`Firebase Error: ${dbRes.status} (${dbRes.statusText})`);
      }
      
      const rawText = await dbRes.text();
      const data = rawText ? JSON.parse(rawText) : null;
      let channels = data ? (Array.isArray(data) ? data : Object.values(data)) : [];
      channels = channels.filter((c: any) => c && typeof c === 'object' && c.id);
      
      return res.status(200).json({ success: true, channels });
    }

    if (action === 'sync' && req.method === 'POST') {
      const { channels } = req.body;
      const syncRes = await fetch(DB_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channels || [])
      });
      if (!syncRes.ok) throw new Error(`Firebase Sync Failed: ${syncRes.status}`);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Unknown Action' });
  } catch (e: any) {
    console.error("[ONYX DB Error]", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
