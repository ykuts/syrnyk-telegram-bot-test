const { Pool } = require('pg');
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Bot token from environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Welcome message
const firstMessage = `
Шановні друзі!

Вітаю всіх, хто приєднався до мого чат-бота "SYRNYK"! 🎉
Тут я буду надсилати важливу інформацію про:
🔔 оновлення цін
🛒 асортимент
🚚 час доставки

Звертаю вашу увагу, що з 7 жовтня діють НОВІ ціни. Нові ціни можна знайти у файлі нижче. 📄⬇️

В майбутньому через цей бот можна буде робити замовлення, але поки що, для замовлень пишіть мені у чат, як і раніше. 👌

Ваша сировар, Ірина.
`;

// PostgreSQL database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Function to execute SQL queries
async function queryDB(query, values = []) {
    const client = await pool.connect();
    try {
        const res = await client.query(query, values);
        return res;
    } finally {
        client.release();
    }
}

// Function to handle new users
async function handleNewUser(msg) {
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name || '';
    const username = msg.from.username || '';

    // Check if user already exists in database
    const result = await queryDB('SELECT * FROM users WHERE user_id = $1', [userId]);

    // If user doesn't exist, add them and send welcome message
    if (result.rows.length === 0) {
        await queryDB(
            'INSERT INTO users (user_id, first_name, last_name, username, welcome_message_sent) VALUES ($1, $2, $3, $4, FALSE)',
            [userId, firstName, lastName, username]
        );

        // Send welcome message
        bot.sendMessage(userId, firstMessage, { parse_mode: 'HTML' });

        // Optionally send PDF file
        const documentPath = './assets/Prix.pdf';
        const fileOptions = {
            filename: 'Prix.pdf',
            contentType: 'application/pdf'
        };
        bot.sendDocument(userId, documentPath, {}, fileOptions)
            .catch((error) => {
                console.log(`Failed to send PDF file to user ${userId}:`, error);
            });
        
        // Update welcome_message_sent status
        await queryDB(
            'UPDATE users SET welcome_message_sent = TRUE WHERE user_id = $1',
            [userId]
        );
    }
}

// Function to save user messages to database
async function saveUserMessage(msg) {
    const userId = msg.from.id;
    const messageId = msg.message_id;
    const text = msg.text || '';

    // Save message to database with timestamp
    await queryDB(
        'INSERT INTO messages (user_id, message_id, text, date) VALUES ($1, $2, $3, NOW())',
        [userId, messageId, text]
    );
}

// Function to forward messages to admin
async function forwardToAdmin(msg) {
    const adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10));
    const userName = msg.from.username ? `@${msg.from.username}` : 'No username';
    const userFullName = `${msg.from.first_name} ${msg.from.last_name || ''}`.trim();
    
    const forwardMessage = `
📩 New message from user:
👤 Name: ${userFullName}
🆔 ID: ${msg.from.id}
📱 Username: ${userName}
📝 Text: ${msg.text}
`;

    // Send message to each admin
    for (const adminId of adminIds) {
        try {
            await bot.sendMessage(adminId, forwardMessage);
            
            // If message contains media files, forward them as well
            if (msg.photo || msg.video || msg.document || msg.voice || msg.audio) {
                await bot.forwardMessage(adminId, msg.chat.id, msg.message_id);
            }
        } catch (error) {
            console.error(`Error forwarding message to admin ${adminId}:`, error);
        }
    }
}

// Command to broadcast message to all subscribers
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const broadcastMessage = match[1];

    // Check if sender is admin
    const adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10));
    if (!adminIds.includes(msg.from.id)) {
        return bot.sendMessage(chatId, 'You do not have permission to use this command.');
    }

    // Get all users from database
    const result = await queryDB('SELECT user_id FROM users');
    const users = result.rows;

    // Send message to each user
    users.forEach(user => {
        bot.sendMessage(user.user_id, broadcastMessage)
            .catch((error) => {
                console.log(`Failed to send message to user ${user.user_id}:`, error);
            });
    });

    bot.sendMessage(chatId, 'Message has been sent to all subscribers!');
});

// Command to get user's Telegram ID
bot.onText(/\/myid/, (msg) => {
    bot.sendMessage(msg.chat.id, `Your Telegram ID: ${msg.from.id}`);
});

// Handler for all incoming messages
bot.on('message', async (msg) => {
    const messageId = msg.message_id;
    const userId = msg.from.id;

    try {
        // Check if message was already processed
        const processedMessageQuery = `
            SELECT COUNT(*) 
            FROM messages 
            WHERE message_id = $1 AND user_id = $2
        `;
        const result = await pool.query(processedMessageQuery, [messageId, userId]);

        if (result.rows[0].count > 0) {
            return; // Skip already processed message
        }

        // Check if this is a new user
        await handleNewUser(msg);

        // If this is not a command, save message, forward to admin and send response
        if (msg.text && !msg.text.startsWith('/')) {
            await saveUserMessage(msg);
            await forwardToAdmin(msg); // Forward message to admin
            
            bot.sendMessage(msg.chat.id, `Вітаю! Дякую за повідомлення!

Наразі цей бот не працює, будь ласка, для замовлень - пишіть в особисті повідомлення за номером 
+41-79-715-87-74 ✅

З повагою, 
Команда SYRNYK`);
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Polling error handler
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);

    if (error.response && error.response.body) {
        console.log('Error details:', error.response.body);
    } else {
        console.log('Error details are not available.');
    }
});