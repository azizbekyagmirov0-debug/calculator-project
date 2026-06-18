const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const DATA_FILE = 'data.json';
const ADMIN_PASS = "eziz2012ggg01$";

// Qurilma va brauzerni aniqlash
function getDeviceInfo(userAgent) {
    if (!userAgent) return { device: 'Noma\'lum', browser: 'Noma\'lum', version: '' };
    
    const ua = userAgent.toLowerCase();
    let device = 'Kompyuter';
    let browser = 'Noma\'lum';
    let version = '';
    
    // Qurilmani aniqlash
    if (/tablet|ipad|android(?!.*mobile)/.test(ua)) {
        device = 'Planshet';
    } else if (/mobile|android|iphone|ipod/.test(ua)) {
        device = 'Telefon';
    }
    
    // Brauzerni aniqlash
    if (ua.includes('chrome') && !ua.includes('edg')) {
        browser = 'Chrome';
        const match = ua.match(/chrome\/([\d.]+)/);
        version = match ? match[1] : '';
    } else if (ua.includes('firefox')) {
        browser = 'Firefox';
        const match = ua.match(/firefox\/([\d.]+)/);
        version = match ? match[1] : '';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
        browser = 'Safari';
        const match = ua.match(/version\/([\d.]+)/);
        version = match ? match[1] : '';
    } else if (ua.includes('edg')) {
        browser = 'Edge';
        const match = ua.match(/edg\/([\d.]+)/);
        version = match ? match[1] : '';
    } else if (ua.includes('opera') || ua.includes('opr')) {
        browser = 'Opera';
        const match = ua.match(/(opera|opr)\/([\d.]+)/);
        version = match ? match[2] : '';
    }
    
    return { device, browser, version };
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Ma'lumotlarni o'qishda xatolik:", e);
    }
    return { users: [], logs: [] };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Ma'lumotlarni saqlashda xatolik:", e);
    }
}

let db = loadData();

// Ro'yxatdan o'tish
app.post('/api/auth/register', (req, res) => {
    const { email, password, name, userAgent } = req.body;
    
    if (!email.endsWith('@gmail.com')) {
        return res.status(400).json({ error: "Faqat gmail.com email ishlatiladi" });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: "Parol kamida 6 ta belgi bo'lishi kerak" });
    }
    
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
    }
    
    const newId = (db.users.length + 1).toString().padStart(8, '0');
    const deviceInfo = getDeviceInfo(userAgent);
    
    const newUser = {
        id: newId,
        email,
        password,
        name,
        picture: `https://ui-avatars.com/api/?name=${name}&background=random`,
        joined: new Date().toLocaleString(),
        loginTime: null,
        logoutTime: null,
        authType: 'password',
        lastDevice: deviceInfo.device,
        lastBrowser: `${deviceInfo.browser} ${deviceInfo.version}`
    };
    
    db.users.push(newUser);
    addLog(newUser.id, "RO'YXATDAN O'TISH", `Email: ${email}, Qurilma: ${deviceInfo.device}, Brauzer: ${deviceInfo.browser} ${deviceInfo.version}`);
    saveData(db);
    
    res.json({ success: true, message: "Muvaffaqiyatli ro'yxatdan o'tdingiz!" });
});

// Kirish (Email/Parol)
app.post('/api/auth/login', (req, res) => {
    const { email, password, userAgent } = req.body;
    const user = db.users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: "Email topilmadi" });
    }
    
    const deviceInfo = getDeviceInfo(userAgent);
    
    // Agar foydalanuvchi Google orqali yaratilgan bo'lsa va paroli yo'q bo'lsa
    if (user.authType === 'google' && !user.password) {
        user.password = password;
        user.authType = 'password';
        user.lastDevice = deviceInfo.device;
        user.lastBrowser = `${deviceInfo.browser} ${deviceInfo.version}`;
        addLog(user.id, "PAROL_SAQLANDI", `Parol saqlandi - ${deviceInfo.device} (${deviceInfo.browser} ${deviceInfo.version})`);
        saveData(db);
        
        return res.status(400).json({ 
            error: "Bu akkaunt Google orqali yaratilgan. Parol saqlandi. Keyingi safar shu parol bilan kira olasiz.",
            suggestGoogle: true,
            passwordSaved: true
        });
    }
    
    if (user.password !== password) {
        addLog(user.id, "XATO_KIRISH", `Noto'g'ri parol - ${deviceInfo.device} (${deviceInfo.browser})`);
        saveData(db);
        return res.status(400).json({ error: "Parol noto'g'ri" });
    }
    
    user.loginTime = new Date().toLocaleString();
    user.logoutTime = null;
    user.lastDevice = deviceInfo.device;
    user.lastBrowser = `${deviceInfo.browser} ${deviceInfo.version}`;
    addLog(user.id, "KIRISH", `Email orqali - ${deviceInfo.device} (${deviceInfo.browser} ${deviceInfo.version})`);
    saveData(db);
    
    res.json({ success: true, user });
});

// Google orqali kirish
app.post('/api/auth/google', (req, res) => {
    const { email, name, picture, userAgent } = req.body;
    
    if (!email.endsWith('@gmail.com')) {
        return res.status(400).json({ error: "Faqat gmail.com" });
    }
    
    let user = db.users.find(u => u.email === email);
    const now = new Date().toLocaleString();
    const deviceInfo = getDeviceInfo(userAgent);
    
    if (!user) {
        const newId = (db.users.length + 1).toString().padStart(8, '0');
        user = { 
            id: newId, 
            email, 
            name, 
            picture: picture || `https://ui-avatars.com/api/?name=${name}&background=random`, 
            joined: now,
            loginTime: now,
            logoutTime: null,
            authType: 'google',
            password: null,
            lastDevice: deviceInfo.device,
            lastBrowser: `${deviceInfo.browser} ${deviceInfo.version}`
        };
        db.users.push(user);
        addLog(user.id, "RO'YXATDAN O'TISH", `Google - ${deviceInfo.device} (${deviceInfo.browser} ${deviceInfo.version})`);
    } else {
        user.loginTime = now;
        user.logoutTime = null;
        user.lastDevice = deviceInfo.device;
        user.lastBrowser = `${deviceInfo.browser} ${deviceInfo.version}`;
        addLog(user.id, "KIRISH", `Google - ${deviceInfo.device} (${deviceInfo.browser} ${deviceInfo.version})`);
    }
    
    saveData(db);
    res.json({ success: true, user });
});

// Chiqish
app.post('/api/auth/logout', (req, res) => {
    const { userId } = req.body;
    let user = db.users.find(u => u.id === userId);
    if (user) {
        const now = new Date().toLocaleString();
        user.logoutTime = now;
        addLog(user.id, "CHIQISH", `Chiqish - ${user.lastDevice || ''}`);
        saveData(db);
    }
    res.json({ success: true });
});

// Hisoblash tarixi
app.post('/api/calc/history', (req, res) => {
    const { userId, expression, result } = req.body;
    const now = new Date().toLocaleString();
    addLog(userId, "HISOBLASH", `${expression} = ${result}`);
    saveData(db);
    res.json({ success: true });
});

// Admin panel - PAROL BILAN
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        const recentLogs = db.logs.slice(0, 100);
        const usersWithPassword = db.users.map(u => ({
            id: u.id,
            email: u.email,
            password: u.password || '(Google orqali)',
            name: u.name,
            authType: u.authType,
            lastDevice: u.lastDevice,
            lastBrowser: u.lastBrowser,
            loginTime: u.loginTime,
            logoutTime: u.logoutTime,
            joined: u.joined
        }));
        res.json({ success: true, users: usersWithPassword, logs: recentLogs });
    } else {
        res.status(403).json({ error: "Parol noto'g'ri" });
    }
});

function addLog(userId, action, details) {
    db.logs.unshift({ userId, action, details, time: new Date().toLocaleString() });
    if (db.logs.length > 1000) {
        db.logs = db.logs.slice(0, 1000);
    }
}

app.listen(3000, () => {
    console.log("Server 3000-portda ishlamoqda...");
    console.log(`Ma'lumotlar ${DATA_FILE} fayliga saqlanmoqda.`);
});