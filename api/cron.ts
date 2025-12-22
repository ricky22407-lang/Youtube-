
import admin from 'firebase-admin';
import { PipelineCore } from '../services/pipelineCore';

// 初始化 Firebase Admin (使用 Vercel 環境變數)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // 處理 Vercel 中私鑰換行符號的問題
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

export default async function cronHandler(req: any, res: any) {
  // 檢查是否為 Vercel Cron 觸發 (或是開發測試)
  // Vercel 會在 Header 帶入 Authorization: Bearer {CRON_SECRET}
  
  try {
    const now = new Date();
    // 校準為台北時間 (UTC+8)
    const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const currentDay = twTime.getDay();
    const currentTime = twTime.getHours().toString().padStart(2, '0') + ':' + twTime.getMinutes().toString().padStart(2, '0');

    // 1. 更新引擎心跳狀態
    await db.collection("system").doc("status").set({
      lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
      engineStatus: 'online',
      source: 'Vercel-Cron-Engine'
    }, { merge: true });

    console.log(`[Vercel Engine] 心跳更新成功: ${currentTime}`);

    // 2. 搜尋排程頻道
    const snapshot = await db.collection("channels")
      .where("schedule.autoEnabled", "==", true)
      .get();

    const executionLog = [];

    for (const doc of snapshot.docs) {
      const chan = doc.data();
      const isScheduled = chan.schedule.activeDays.includes(currentDay);
      const isTimeMatch = chan.schedule.time === currentTime;
      
      // 冷卻檢查：防止重複觸發
      const lastRun = chan.lastRunTime?.toMillis ? chan.lastRunTime.toMillis() : 0;
      const isCooledDown = (Date.now() - lastRun) > (50 * 60 * 1000);

      if (isScheduled && isTimeMatch && isCooledDown) {
        executionLog.push(`執行頻道: ${chan.name}`);
        await runPipeline(doc.id, chan);
      }
    }

    return res.status(200).json({ 
      success: true, 
      time: currentTime,
      executed: executionLog 
    });

  } catch (error: any) {
    console.error("[Cron Engine Error]:", error);
    return res.status(500).json({ error: error.message });
  }
}

async function runPipeline(id: string, chan: any) {
  const ref = db.collection("channels").doc(id);
  try {
    await ref.update({ status: 'running', lastLog: 'Vercel 雲端自動化已接手處理...' });
    
    // 這裡呼叫 PipelineCore 的邏輯
    const trends = await PipelineCore.fetchTrends(chan as any);
    const plan = await PipelineCore.planContent(trends, { niche: chan.niche } as any);
    const video = await PipelineCore.renderVideo(plan);
    const result = await PipelineCore.uploadVideo({
      video_asset: video,
      metadata: plan,
      authCredentials: chan.auth,
      schedule: { privacy_status: 'public' }
    });

    await ref.update({
      status: 'success',
      lastRunTime: admin.firestore.FieldValue.serverTimestamp(),
      lastLog: `✅ 雲端自動發布成功！影片ID: ${result.video_id}`
    });
  } catch (e: any) {
    await ref.update({ status: 'error', lastLog: `❌ 雲端自動化錯誤: ${e.message}` });
  }
}
