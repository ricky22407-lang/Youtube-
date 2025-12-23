
export default async function handler(req: any, res: any) {
  const { action } = req.query;
  const ID_OR_URL = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();
  
  if (!ID_OR_URL) {
    return res.status(200).json({ 
      success: false, 
      error: '環境變數遺失: 請在 Vercel 設定中配置 VITE_FIREBASE_PROJECT_ID。' 
    });
  }

  // 聰明解析 Firebase REST URL
  const getFullUrl = (input: string) => {
    if (input.startsWith('http')) {
      return input.endsWith('.json') ? input : `${input.endsWith('/') ? input : input + '/'}channels.json`;
    }
    // 如果包含點，通常是新版的 region 格式，例如 project-id.asia-southeast1
    if (input.includes('.')) {
      return `https://${input}.firebasedatabase.app/channels.json`;
    }
    // 預設舊版格式
    return `https://${input}.firebaseio.com/channels.json`;
  };

  const DB_URL = getFullUrl(ID_OR_URL);

  try {
    if (action === 'list') {
      const dbRes = await fetch(DB_URL);
      if (!dbRes.ok) {
        const errorDetail = dbRes.status === 404 ? 
          `找不到路徑。請檢查 Firebase Realtime Database 是否已建立，且網址正確。嘗試連線至: ${DB_URL.split('.com')[0]}...` : 
          `Firebase Error: ${dbRes.status}`;
        throw new Error(errorDetail);
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
