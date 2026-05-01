const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'milkcoffee_secret_key_2025';

// CORS - cho phép tất cả (đơn giản hóa)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// Tạo thư mục uploads nếu chưa có
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Cấu hình upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Dữ liệu tạm (dùng RAM)
let users = [{
    id: 1,
    username: 'admin',
    password: '$2a$10$XFEZrZxRq8Z.wU4zFQlXK.4V.hnCqXqXqXqXqXqXqXqXqXqXqXq',
    displayName: 'Quản trị viên',
    role: 'admin',
    avatar: null
}];
let nextId = 2;
let userStats = {};

// Helper
const hashPassword = (pwd) => bcrypt.hashSync(pwd, 10);

// ========== API ==========
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server Milk Coffee đang chạy!' });
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
        if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Tên đã tồn tại' });
        
        const newUser = {
            id: nextId++,
            username,
            password: hashPassword(password),
            displayName: displayName || username,
            role: 'user',
            avatar: null
        };
        users.push(newUser);
        userStats[newUser.id] = { score: 0 };
        res.json({ success: true, message: 'Đăng ký thành công' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = users.find(u => u.username === username);
        if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
        
        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
        
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatar: user.avatar }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const auth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

app.get('/api/users/profile', auth, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    res.json({ ...user, password: undefined, stats: userStats[user.id] || { score: 0 } });
});

app.post('/api/upload/avatar', auth, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    const user = users.find(u => u.id === req.user.id);
    if (user) user.avatar = url;
    res.json({ success: true, avatarUrl: url });
});

app.post('/api/activities', auth, (req, res) => {
    const { score } = req.body;
    if (!userStats[req.user.id]) userStats[req.user.id] = { score: 0 };
    userStats[req.user.id].score += score || 0;
    res.json({ success: true, message: `+${score} điểm` });
});

app.get('/api/events', auth, (req, res) => res.json([]));
app.post('/api/events', auth, (req, res) => res.json({ success: true }));
app.delete('/api/events/:id', auth, (req, res) => res.json({ success: true }));

app.get('/api/library', auth, (req, res) => res.json([]));
app.post('/api/library', auth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    res.json({ success: true, file: { id: Date.now(), name: req.file.originalname, filePath: `/uploads/${req.file.filename}` } });
});
app.delete('/api/library/:id', auth, (req, res) => res.json({ success: true }));

app.get('/api/admin/users', auth, (req, res) => {
    if (req.user.username !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    res.json(users.map(u => ({ ...u, password: undefined })));
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
