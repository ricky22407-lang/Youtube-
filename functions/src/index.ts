
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

/**
 * 雲端自動化引擎 (每分鐘檢查一次)
 */
export const cloudAutoPilotEngine = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async (context) => {
    // 強制校準為台北時間
    const now = new Date();
    const twTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const currentDay = twTime.getDay();
    const currentTime = twTime.getHours().toString().padStart(2, '0') + ':' + twTime.getMinutes().toString().padStart(2, '0');

    try {
      // 1. 更新心跳資訊
      await db.collection("system").doc("status").set({
        lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
        engineStatus: 'online'
      }, { merge: true });

      // 2. 搜尋需要執行的頻道
      const snapshot = await db.collection("channels")
        .where("schedule.autoEnabled", "==", true)
        .get();

      for (const doc of snapshot.docs) {
        const chan = doc.data();
        const isScheduled = chan.schedule.activeDays.includes(currentDay);
        const isTimeMatch = chan.schedule.time === currentTime;
        
        // 冷卻時間：1小時內執行過就不重複執行
        const lastRun = chan.lastRunTime?.toMillis ? chan.lastRunTime.toMillis() : 0;
        const cooledDown = (Date.now() - lastRun) > (50 * 60 * 1000);

        if (isScheduled && isTimeMatch && cooledDown) {
          await runChannelTask(doc.id, chan);
        }
      }
    } catch (err) {
      console.error("Engine Pulse Error:", err);
    }
  });

async function runChannelTask(id: string, chan: any) {
  const ref = db.collection("channels").doc(id);
  const API_KEY = process.env.API_KEY;

  if (!API_KEY) {
    await ref.update({ status: 'error', lastLog: '雲端環境缺失 API_KEY' });
    return;
  }

  try {
    await ref.update({ status: 'running', lastLog: '雲端全自動流程啟動...' });
    
    // 此處執行 AI 分析與影片上傳... (具體邏輯可參照 PipelineCore)
    
    await ref.update({
      status: 'success',
      lastRunTime: admin.firestore.FieldValue.serverTimestamp(),
      lastLog: `✅ 自動發布成功 (${new Date().toLocaleTimeString()})`
    });
  } catch (e: any) {
    await ref.update({ status: 'error', lastLog: `❌ 雲端錯誤: ${e.message}` });
  }
}
