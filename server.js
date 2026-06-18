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

// Ro'yxatdan o'tish (Email/Parol)
app.post('/api/auth/register', (req, res) => {
    const { email, password, name } = req.body;
    
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
    const newUser = {
        id: newId,
        email,
        password,
        name,
        picture: `https://ui-avatars.com/api/?name=${name}&background=random`,
        joined: new Date().toLocaleString(),
        loginTime: null,
        logoutTime: null,
        authType: 'password' // Parol bilan ro'yxatdan o'tgan
    };
    
    db.users.push(newUser);
    addLog(newUser.id, "RO'YXATDAN O'TISH", `Email: ${email}, Ism: ${name}`);
    saveData(db);
    
    res.json({ success: true, message: "Muvaffaqiyatli ro'yxatdan o'tdingiz!" });
});

// Kirish (Email/Parol)
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    
    if (!user) {
        return res.status(404).json({ error: "Email topilmadi. Avval ro'yxatdan o'ting." });
    }
    
    // Agar user Google orqali ro'yxatdan o'tgan bo'lsa
    if (user.authType === 'google' || !user.password) {
        return res.status(400).json({ 
            error: "Bu akkaunt Google orqali yaratilgan. Iltimos, Google orqali kiring.",
            suggestGoogle: true
        });
    }
    
    if (user.password !== password) {
        return res.status(400).json({ error: "Parol noto'g'ri" });
    }
    
    user.loginTime = new Date().toLocaleString();
    user.logoutTime = null;
    addLog(user.id, "KIRISH", `Email orqali kirish`);
    saveData(db);
    
    res.json({ success: true, user });
});

// Google orqali kirish
app.post('/api/auth/google', (req, res) => {
    const { email, name, picture } = req.body;
    
    if (!email.endsWith('@gmail.com')) {
        return res.status(400).json({ error: "Faqat gmail.com" });
    }
    
    let user = db.users.find(u => u.email === email);
    const now = new Date().toLocaleString();
    
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
            authType: 'google' // Google orqali kirgan
        };
        db.users.push(user);
        addLog(user.id, "RO'YXATDAN O'TISH", `Google orqali yangi foydalanuvchi: ${name}`);
    } else {
        user.loginTime = now;
        user.logoutTime = null;
        addLog(user.id, "KIRISH", `Google orqali kirish: ${name}`);
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
        addLog(user.id, "CHIQISH", `Chiqish vaqti: ${now}`);
        saveData(db);
    }
    res.json({ success: true });
});

// Hisoblash tarixi
app.post('/api/calc/history', (req, res) => {
    const { userId, expression, result } = req.body;
    const now = new Date().toLocaleString();
    addLog(userId, "HISOBLASH", `${expression} = ${result} | Vaqt: ${now}`);
    saveData(db);
    res.json({ success: true });
});

// Admin panel
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        const recentLogs = db.logs.slice(0, 100);
        res.json({ success: true, users: db.users, logs: recentLogs });
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