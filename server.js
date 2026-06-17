const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// HTML va statik fayllarni ko'rsatish
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let usersDB = []; 
let logsDB = [];
const ADMIN_PASS = "eziz2012ggg01$";

app.post('/api/auth/google', (req, res) => {
    const { email, name, picture } = req.body;
    if (!email.endsWith('@gmail.com')) {
        return res.status(400).json({ error: "Faqat gmail.com" });
    }
    let user = usersDB.find(u => u.email === email);
    if (!user) {
        const newId = (usersDB.length + 1).toString().padStart(8, '0');
        user = { 
            id: newId, 
            email, 
            name, 
            picture: picture || 'https://via.placeholder.com/50', 
            joined: new Date().toLocaleString() 
        };
        usersDB.push(user);
        addLog(user.id, "RO'YXATDAN O'TISH", "Yangi foydalanuvchi");
    } else {
        addLog(user.id, "KIRISH", "Tizimga kirdi");
    }
    res.json({ success: true, user });
});

app.post('/api/calc/history', (req, res) => {
    const { userId, expression, result } = req.body;
    addLog(userId, "HISOBLASH", `${expression} = ${result}`);
    res.json({ success: true });
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASS) {
        res.json({ success: true, users: usersDB, logs: logsDB });
    } else {
        res.status(403).json({ error: "Parol noto'g'ri" });
    }
});

function addLog(userId, action, details) {
    logsDB.unshift({ userId, action, details, time: new Date().toLocaleString() });
}

app.listen(3000, () => {
    console.log("Server 3000-portda ishlamoqda...");
});