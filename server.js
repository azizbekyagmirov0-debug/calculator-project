const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// MongoDB ga ulanish
const MONGODB_URI = 'mongodb+srv://admin:gulsanam2012@cluster0.nhjfldo.mongodb.net/calculator?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB ga muvaffaqiyatli ulandi!'))
    .catch(err => console.error('❌ MongoDB xatolik:', err));

// MODELLAR
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    name: { type: String, required: true },
    picture: String,
    authType: { type: String, enum: ['password', 'google'], default: 'password' },
    lastDevice: String,
    lastBrowser: String,
    loginTime: Date,
    logoutTime: Date,
    joined: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const logSchema = new mongoose.Schema({
    userId: String,
    action: String,
    details: String,
    time: { type: Date, default: Date.now }
});

const Log = mongoose.model('Log', logSchema);

const emailCodeSchema = new mongoose.Schema({
    email: String,
    code: String,
    expiresAt: Date
});

const EmailCode = mongoose.model('EmailCode', emailCodeSchema);

// SOZLAMALAR
const ADMIN_PASS = "eziz2012ggg01$";

// Email yuborish
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'azizbekyagmirov0@gmail.com',
        pass: 'jyhnbpszqfldod' // Bo'shliqsiz yozing
    }
});

// Qurilma aniqlash
function getDeviceInfo(userAgent) {
    if (!userAgent) return { device: 'Noma\'lum', browser: 'Noma\'lum', version: '' };
    const ua = userAgent.toLowerCase();
    let device = 'Kompyuter';
    let browser = 'Noma\'lum';
    let version = '';
    
    if (/tablet|ipad|android(?!.*mobile)/.test(ua)) device = 'Planshet';
    else if (/mobile|android|iphone|ipod/.test(ua)) device = 'Telefon';
    
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
    }
    
    return { device, browser, version };
}

// API ENDPOINTLAR
app.post('/api/auth/send-code', async (req, res) => {
    const { email } = req.body;
    if (!email.endsWith('@gmail.com')) {
        return res.status(400).json({ error: "Faqat gmail.com" });
    }
    
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    try {
        await transporter.sendMail({
            from: 'azizbekyagmirov0@gmail.com',
            to: email,
            subject: 'Tasdiqlash kodi - Kalkulyator',
            text: `Sizning tasdiqlash kodingiz: ${code}\n\nBu kodni hech kimga bermang!`
        });
        
        await EmailCode.deleteMany({ email });
        await EmailCode.create({ email, code, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
        
        res.json({ success: true, message: "Kod yuborildi!" });
    } catch (e) {
        console.error("Email xatolik:", e);
        res.status(500).json({ error: "Email yuborishda xatolik" });
    }
});

app.post('/api/auth/verify-code', async (req, res) => {
    const { email, code, name, userAgent } = req.body;
    
    const record = await EmailCode.findOne({ email, code });
    if (!record) return res.status(400).json({ error: "Kod noto'g'ri" });
    if (record.expiresAt < new Date()) {
        await EmailCode.deleteOne({ _id: record._id });
        return res.status(400).json({ error: "Kod eskirgan" });
    }
    
    const deviceInfo = getDeviceInfo(userAgent);
    const now = new Date();
    
    let user = await User.findOne({ email });
    
    if (!user) {
        const count = await User.countDocuments();
        const newId = (count + 1).toString().padStart(8, '0');
        
        user = await User.create({
            id: newId,
            email,
            name: name || email.split('@')[0],
            picture: `https://ui-avatars.com/api/?name=${name || email}&background=random`,
            authType: 'password',
            lastDevice: deviceInfo.device,
            lastBrowser: `${deviceInfo.browser} ${deviceInfo.version}`,
            loginTime: now,
            joined: now
        });
        
        await addLog(user.id, "RO'YXATDAN O'TISH", `Email kod orqali - ${deviceInfo.device}`);
    } else {
        user.loginTime = now;
        user.logoutTime = null;
        user.lastDevice = deviceInfo.device;
        user.lastBrowser = `${deviceInfo.browser} ${deviceInfo.version}`;
        await user.save();
        await addLog(user.id, "KIRISH", `Email kod orqali - ${deviceInfo.device}`);
    }
    
    await EmailCode.deleteOne({ _id: record._id });
    res.json({ success: true, user });
});

app.post('/api/auth/set-password', async (req, res) => {
    const { email, password, userAgent } = req.body;
    if (password.length < 6) return res.status(400).json({ error: "Parol kamida 6 ta belgi" });
    
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.authType = 'password';
    await user.save();
    await addLog(user.id, "PAROL_O'RNATISH", `Parol o'rnatildi`);
    
    res.json({ success: true, message: "Parol o'rnatildi!" });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password, userAgent } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) return res.status(404).json({ error: "Email topilmadi" });
    
    const deviceInfo = getDeviceInfo(userAgent);
    
    if (!user.password) {
        return res.status(400).json({ 
            error: "Bu akkaunt uchun parol o'rnatilmagan. Parol o'rnating yoki Google orqali kiring.",
            needPassword: true
        });
    }
    
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
        await addLog(user.id, "XATO_KIRISH", `Noto'g'ri parol - ${deviceInfo.device}`);
        return res.status(400).json({ error: "Parol noto'g'ri" });
    }
    
    user.loginTime = new Date();
    user.logoutTime = null;
    user.lastDevice = deviceInfo.device;
    user.lastBrowser = `${deviceInfo.browser} ${deviceInfo.version}`;
    await user.save();
    await addLog(user.id, "KIRISH", `Email orqali - ${deviceInfo.device} (${deviceInfo.browser})`);
    
    res.json({ success: true, user });
});

app.post('/api/auth/google', async (req, res) => {
    const { email, name, picture, userAgent } = req.body;
    if (!email.endsWith('@gmail.com')) return res.status(400).json({ error: "Faqat gmail.com" });
    
    let user = await User.findOne({ email });
    const now = new Date();
    const deviceInfo = getDeviceInfo(userAgent);
    
    if (!user) {
        const count = await User.countDocuments();
        const newId = (count + 1).toString().padStart(8, '0');
        
        user = await User.create({
            id: newId,
            email,
            name,
            picture: picture || `https://ui-avatars.com/api/?name=${name}&background=random`,
            authType: 'google',
            lastDevice: deviceInfo.device,
            lastBrowser: `${deviceInfo.browser} ${deviceInfo.version}`,
            loginTime: now,
            joined: now
        });
        await addLog(user.id, "RO'YXATDAN O'TISH", `Google - ${deviceInfo.device}`);
    } else {
        user.loginTime = now;
        user.logoutTime = null;
        user.lastDevice = deviceInfo.device;
        user.lastBrowser = `${deviceInfo.browser} ${deviceInfo.version}`;
        await user.save();
        await addLog(user.id, "KIRISH", `Google - ${deviceInfo.device}`);
    }
    
    res.json({ success: true, user });
});

app.post('/api/auth/logout', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findOne({ id: userId });
    if (user) {
        user.logoutTime = new Date();
        await user.save();
        await addLog(user.id, "CHIQISH", `Chiqish`);
    }
    res.json({ success: true });
});

app.post('/api/calc/history', async (req, res) => {
    const { userId, expression, result } = req.body;
    await addLog(userId, "HISOBLASH", `${expression} = ${result}`);
    res.json({ success: true });
});

app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASS) return res.status(403).json({ error: "Parol noto'g'ri" });
    
    const users = await User.find({}).sort({ joined: -1 });
    const logs = await Log.find({}).sort({ time: -1 }).limit(100);
    res.json({ success: true, users, logs });
});

async function addLog(userId, action, details) {
    await Log.create({ userId, action, details, time: new Date() });
}

app.listen(3000, () => {
    console.log("Server 3000-portda ishlamoqda...");
    console.log("✅ MongoDB bilan ishlayapti!");
});