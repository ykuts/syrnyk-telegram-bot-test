const fs = require('fs');
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Токен бота (хранится в переменных окружения)
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

Звертаю вашу увагу, що з 7 жовтня ми підвищуємо ціни. Нові ціни можна знайти у файлі нижче. 📄⬇️

В майбутньому через цей бот можна буде робити замовлення, але поки що, для замовлень пишіть мені у чат, як і раніше. 👌

Ваша сировар, Ірина.
`;

// Файл для хранения данных пользователей
const usersDataFile = './usersData.json';

// Функция для загрузки данных пользователей из файла
function loadUserData() {
    if (fs.existsSync(usersDataFile)) {
        return JSON.parse(fs.readFileSync(usersDataFile, 'utf8'));
    }
    return {};
}

// Функция для сохранения данных пользователей в файл
function saveUserData(data) {
    fs.writeFileSync(usersDataFile, JSON.stringify(data, null, 2), 'utf8');
}

// Загружаем данные пользователей при запуске
let userData = loadUserData();







// Функция для обработки нового пользователя
function handleNewUser(msg) {
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    const lastName = msg.from.last_name || '';
    const username = msg.from.username || '';

    // Проверяем, есть ли пользователь уже в базе
    if (!userData[userId]) {
        // Если нет, сохраняем нового пользователя
        userData[userId] = {
            userId,
            firstName,
            lastName,
            username,
            messages: []
        };
        saveUserData(userData);

        // Отправляем приветственное сообщение
        bot.sendMessage(userId, firstMessage, { parse_mode: 'HTML' });
    }
}

// Функция для сохранения сообщений пользователя с датой и временем
function saveUserMessage(msg) {
    const userId = msg.from.id;
    const messageId = msg.message_id;

    // Проверяем, существует ли пользователь в базе данных
    if (userData[userId]) {
        const existingMessages = userData[userId].messages;

        // Проверяем, есть ли сообщение уже в базе
        if (!existingMessages.find(m => m.messageId === messageId)) {
            // Добавляем сообщение с датой и временем
            existingMessages.push({
                messageId, // Уникальный идентификатор сообщения
                text: msg.text || '', // Для некорректных или пустых текстовых сообщений
                date: new Date().toISOString() // Сохраняем дату и время отправки сообщения
            });
            saveUserData(userData);
        }
    }
}

// Команда для рассылки сообщения всем подписчикам
bot.onText(/\/broadcast (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const broadcastMessage = match[1];  // Сообщение после команды /broadcast

    // Проверка на администратора (например, с твоим Telegram ID)
    const adminIds = process.env.ADMIN_IDS.split(',').map(id => parseInt(id, 10));
    
    console.log(`Your ID: ${msg.from.id}, Admin ID: ${adminIds}`);
    if (!adminIds.includes(msg.from.id)) {
        return bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
    }

    // Отправка сообщения всем пользователям
    Object.keys(userData).forEach(userId => {
        bot.sendMessage(userId, broadcastMessage)
            .catch((error) => {
                console.log(`Не удалось отправить сообщение пользователю ${userId}:`, error);
            });
    });

    bot.sendMessage(chatId, 'Повідомлення надіслане всім підписникам!');
});

// Команда для получения ID пользователя
bot.onText(/\/myid/, (msg) => {
    bot.sendMessage(msg.chat.id, `Ваш Telegram ID: ${msg.from.id}`);
});



bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, firstMessage, { parse_mode: 'HTML' });
});

// Обработчик всех входящих сообщений
const processedMessages = new Set(); // Множество для хранения обработанных сообщений

bot.on('message', (msg) => {
    const messageId = msg.message_id;

    // Проверяем, было ли уже обработано это сообщение
    if (processedMessages.has(messageId)) {
        return; // Пропускаем уже обработанное сообщение
    }

    // Добавляем сообщение в множество обработанных
    processedMessages.add(messageId);

    // Проверяем, если это новое сообщение от пользователя
    handleNewUser(msg);

    // Если это не команда (например, /start), сохраняем сообщение и отправляем ответ
    if (msg.text && !msg.text.startsWith('/')) {
        saveUserMessage(msg);
        bot.sendMessage(msg.chat.id, `Дякуємо за повідомлення! Ми відповімо найближчим часом`);
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
