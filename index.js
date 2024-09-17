const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// Токен, который ты получил в BotFather
const token = 'YOUR_TELEGRAM_BOT_TOKEN';

// Создание экземпляра бота
const bot = new TelegramBot(token, { polling: true });

// Файл для хранения данных пользователей
const usersDataFile = './usersData.json';

// Функция для загрузки данных пользователей
function loadUserData() {
    if (fs.existsSync(usersDataFile)) {
        return JSON.parse(fs.readFileSync(usersDataFile, 'utf8'));
    }
    return {};
}

// Функция для сохранения данных пользователей
function saveUserData(data) {
    fs.writeFileSync(usersDataFile, JSON.stringify(data, null, 2));
}

// Загружаем данные пользователей при старте
let userData = loadUserData();

// Обработка новых пользователей
bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Сохраняем пользователя
    if (!userData[userId]) {
        userData[userId] = {
            id: userId,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name || '',
            username: msg.from.username || '',
            messages: []
        };
        saveUserData(userData);

        // Отправляем приветственное сообщение
        bot.sendMessage(chatId, `Привет, ${msg.from.first_name}! Добро пожаловать!`);
    }
});

// Обработка входящих сообщений
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Сохраняем сообщение пользователя
    if (userData[userId]) {
        userData[userId].messages.push({
            text: msg.text,
            date: new Date()
        });
        saveUserData(userData);
    }

    // Ответ бота на сообщение
    bot.sendMessage(chatId, 'Сообщение получено!');
});

console.log('Бот запущен');
