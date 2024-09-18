const { Pool } = require('pg');
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Токен бота из переменных окружения
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Приветственное сообщение
const firstMessage = `
Шановні друзі!

Вітаю всіх, хто приєднався до мого чат-бота “SYRNYK”! 🎉
Тут я буду надсилати важливу інформацію про:
🔔 оновлення цін
🛒 асортимент
🚚 час доставки

Звертаю вашу увагу, що з 7 жовтня діють НОВІ ціни. Нові ціни можна знайти у файлі нижче. 📄⬇️

В майбутньому через цей бот можна буде робити замовлення, але поки що, для замовлень пишіть мені у чат, як і раніше. 👌

Ваша сировар, Ірина.
`;

// Подключение к базе данных PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Функция для выполнения SQL-запросов
async function queryDB(query, values = []) {
    const client = await pool.connect();
    try {
        const res = await client.query(query, values);
        return res;
    } finally {
        client.release();
    }
}

// Функция для обработки нового пользователя
async function handleNewUser(msg) {
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name || '';
    const username = msg.from.username || '';

    // Проверяем, есть ли пользователь уже в базе данных
    const result = await queryDB('SELECT * FROM users WHERE user_id = $1', [userId]);

    // Если пользователя нет в базе, добавляем его и отправляем приветственное сообщение
    if (result.rows.length === 0) {
        await queryDB(
            'INSERT INTO users (user_id, first_name, last_name, username, welcome_message_sent) VALUES ($1, $2, $3, $4, FALSE)',
            [userId, firstName, lastName, username]
        );

        // Отправляем приветственное сообщение
        bot.sendMessage(userId, firstMessage, { parse_mode: 'HTML' });

        // Дополнительно отправляем PDF-файл (опционально)
        const documentPath = './assets/Prix.pdf'; // Локальный путь к PDF-файлу
        const fileOptions = {
            filename: 'Prix.pdf',
            contentType: 'application/pdf' // Явно указываем тип содержимого
        };
        bot.sendDocument(userId, documentPath, {}, fileOptions)
            .catch((error) => {
                console.log(`Не удалось отправить PDF-файл пользователю ${userId}:`, error);
            });
        // Обновляем поле `welcome_message_sent`
        await queryDB(
            'UPDATE users SET welcome_message_sent = TRUE WHERE user_id = $1',
            [userId]
        );
    
    }
}

// Функция для сохранения сообщений пользователей
async function saveUserMessage(msg) {
    const userId = msg.from.id;
    const messageId = msg.message_id;
    const text = msg.text || '';

    // Сохраняем сообщение в базу данных с датой и временем
    await queryDB(
        'INSERT INTO messages (user_id, message_id, text, date) VALUES ($1, $2, $3, NOW())',
        [userId, messageId, text]
    );
}

// Команда для рассылки сообщения всем подписчикам
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const broadcastMessage = match[1];

    // Проверка на администратора
    const adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10));
    if (!adminIds.includes(msg.from.id)) {
        return bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
    }

    // Получаем всех пользователей из базы данных
    const result = await queryDB('SELECT user_id FROM users');
    const users = result.rows;

    // Отправляем сообщение каждому пользователю
    users.forEach(user => {
        bot.sendMessage(user.user_id, broadcastMessage)
            .catch((error) => {
                console.log(`Не удалось отправить сообщение пользователю ${user.user_id}:`, error);
            });
    });

    bot.sendMessage(chatId, 'Повідомлення надіслане всім підписникам!');
});

// Команда для получения ID пользователя
bot.onText(/\/myid/, (msg) => {
    bot.sendMessage(msg.chat.id, `Ваш Telegram ID: ${msg.from.id}`);
});

/* // Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const userId = msg.from.id;

    // Отправляем приветственное сообщение
    bot.sendMessage(userId, firstMessage, { parse_mode: 'HTML' });

    // Дополнительно отправляем PDF-файл (опционально)
    const documentPath = './assets/Prix.pdf'; // Локальный путь к PDF-файлу
    const fileOptions = {
        filename: 'Prix.pdf',
        contentType: 'application/pdf' // Явно указываем тип содержимого
    };
    bot.sendDocument(userId, documentPath, {}, fileOptions)
        .catch((error) => {
            console.log(`Не удалось отправить PDF-файл пользователю ${userId}:`, error);
        });

    
}); */

// Обработчик всех входящих сообщений
bot.on('message', async (msg) => {
    const messageId = msg.message_id;
    const userId = msg.from.id;

    try {
        // Проверяем, было ли уже обработано это сообщение
        const processedMessageQuery = `
            SELECT COUNT(*) 
            FROM messages 
            WHERE message_id = $1 AND user_id = $2
        `;
        const result = await pool.query(processedMessageQuery, [messageId, userId]);

        if (result.rows[0].count > 0) {
            return; // Пропускаем уже обработанное сообщение
        }

        // Проверяем, если это новое сообщение от пользователя
        await handleNewUser(msg);

        // Если это не команда (например, /start), сохраняем сообщение и отправляем ответ
        if (msg.text && !msg.text.startsWith('/')) {
            await saveUserMessage(msg);
            bot.sendMessage(msg.chat.id, `Дякуємо за повідомлення! Ми відповімо найближчим часом`);
        }
    } catch (error) {
        console.error('Ошибка при обработке сообщения:', error);
    }
});


// Обработчик ошибок polling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);

    // Проверяем, есть ли объект error.response и его свойства
    if (error.response && error.response.body) {
        console.log('Error details:', error.response.body);
    } else {
        console.log('Error details are not available.');
    }
});
