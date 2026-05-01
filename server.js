const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'milkcoffee_secret_key_2025';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// ========== CẤU HÌNH UPLOAD FILE ==========
// Đảm bảo thư mục uploads tồn tại
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Cấu hình multer cho avatar và cover
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Loại file không được hỗ trợ'), false);
        }
    }
});

// ========== DỮ LIỆU GIẢ LẬP (Sẽ thay bằng Database sau) ==========
let users = [
    {
        id: 1,
        username: 'admin',
        // Mật khẩu: admin123 (đã mã hóa)
        password: '$2a$10$XFEZrZxRq8Z.wU4zFQlXK.4V.hnCqXqXqXqXqXqXqXqXqXqXqXq',
        displayName: 'Quản trị viên',
        gender: 'Nam',
        avatar: null,
        cover: null,
        role: 'admin',
        createdAt: new Date().toISOString()
    }
];
let nextUserId = 2;

let userStats = {};     // { userId: { score, hours, progress, rank } }
let userEvents = {};    // { userId: [...] }
let libraryFiles = [];   // [{ id, name, type, filePath, uploadedBy, uploadedAt, grade, subject }]

// Helper: Mã hóa mật khẩu
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

// ========== API ĐĂNG KÝ ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
        }
        if (username.length < 3) {
            return res.status(400).json({ error: 'Tên tài khoản phải có ít nhất 3 ký tự' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }

        // Kiểm tra username đã tồn tại
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        }

        // Tạo user mới
        const newUser = {
            id: nextUserId++,
            username,
            password: await hashPassword(password),
            displayName: displayName || username,
            gender: null,
            avatar: null,
            cover: null,
            role: 'user',
            createdAt: new Date().toISOString()
        };

        users.push(newUser);

        // Khởi tạo stats cho user
        userStats[newUser.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
        userEvents[newUser.id] = [];

        res.json({ 
            success: true, 
            message: 'Đăng ký thành công',
            user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== API ĐĂNG NHẬP ==========
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        }

        // Tạo JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                gender: user.gender,
                role: user.role,
                avatar: user.avatar,
                cover: user.cover
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== MIDDLEWARE XÁC THỰC ==========
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
        }
        req.user = user;
        next();
    });
};

// ========== API LẤY THÔNG TIN NGƯỜI DÙNG ==========
app.get('/api/users/profile', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    res.json({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        gender: user.gender,
        role: user.role,
        avatar: user.avatar,
        cover: user.cover,
        createdAt: user.createdAt,
        stats: userStats[user.id] || { score: 0, hours: 0, progress: 0, rank: 100 }
    });
});

// ========== API CẬP NHẬT THÔNG TIN NGƯỜI DÙNG ==========
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { displayName, gender, currentPassword, newPassword, score } = req.body;

        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }

        // Cập nhật thông tin cơ bản
        if (displayName !== undefined) users[userIndex].displayName = displayName;
        if (gender !== undefined) users[userIndex].gender = gender;

        // Cập nhật mật khẩu
        if (currentPassword && newPassword) {
            const validPassword = await bcrypt.compare(currentPassword, users[userIndex].password);
            if (!validPassword) {
                return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
            }
            users[userIndex].password = await hashPassword(newPassword);
        }

        // Cập nhật điểm số (tích lũy)
        if (score !== undefined) {
            if (!userStats[req.user.id]) {
                userStats[req.user.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
            }
            userStats[req.user.id].score += score;
        }

        res.json({
            success: true,
            message: 'Cập nhật thành công',
            user: {
                id: users[userIndex].id,
                username: users[userIndex].username,
                displayName: users[userIndex].displayName,
                gender: users[userIndex].gender,
                avatar: users[userIndex].avatar
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== API UPLOAD ẢNH ĐẠI DIỆN ==========
app.post('/api/upload/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        // Cập nhật URL avatar vào user
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            // Xóa file avatar cũ nếu có (tùy chọn)
            if (users[userIndex].avatar) {
                const oldFileName = users[userIndex].avatar.split('/').pop();
                const oldFilePath = path.join(__dirname, 'uploads', oldFileName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }
            users[userIndex].avatar = avatarUrl;
        }

        res.json({
            success: true,
            avatarUrl: avatarUrl
        });

    } catch (error) {
        console.error('Upload avatar error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== API UPLOAD ẢNH BÌA ==========
app.post('/api/upload/cover', authenticateToken, upload.single('cover'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const coverUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        // Cập nhật URL cover vào user
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            // Xóa file cover cũ nếu có
            if (users[userIndex].cover) {
                const oldFileName = users[userIndex].cover.split('/').pop();
                const oldFilePath = path.join(__dirname, 'uploads', oldFileName);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }
            users[userIndex].cover = coverUrl;
        }

        res.json({
            success: true,
            coverUrl: coverUrl
        });

    } catch (error) {
        console.error('Upload cover error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== API SỰ KIỆN ==========
app.get('/api/events', authenticateToken, (req, res) => {
    const userEventsList = userEvents[req.user.id] || [];
    res.json(userEventsList);
});

app.post('/api/events', authenticateToken, (req, res) => {
    const { title, date } = req.body;

    if (!title || !date) {
        return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }

    if (!userEvents[req.user.id]) {
        userEvents[req.user.id] = [];
    }

    const newEvent = {
        id: Date.now(),
        title,
        date: new Date(date).toISOString(),
        createdAt: new Date().toISOString()
    };

    userEvents[req.user.id].push(newEvent);
    userEvents[req.user.id].sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ success: true, event: newEvent });
});

app.delete('/api/events/:eventId', authenticateToken, (req, res) => {
    const eventId = parseInt(req.params.eventId);

    if (userEvents[req.user.id]) {
        userEvents[req.user.id] = userEvents[req.user.id].filter(e => e.id !== eventId);
    }

    res.json({ success: true });
});

// ========== API HOẠT ĐỘNG (Cập nhật điểm) ==========
app.post('/api/activities', authenticateToken, (req, res) => {
    const { title, score } = req.body;

    // Khởi tạo stats nếu chưa có
    if (!userStats[req.user.id]) {
        userStats[req.user.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
    }
    
    // Cộng điểm
    userStats[req.user.id].score += score;
    
    // Cập nhật progress (ví dụ: 1000 điểm = 100%)
    const progress = Math.min(100, Math.floor(userStats[req.user.id].score / 10));
    userStats[req.user.id].progress = progress;
    
    // Cập nhật rank (giả lập, có thể tính sau)
    userStats[req.user.id].rank = Math.max(1, 101 - Math.floor(userStats[req.user.id].score / 100));

    res.json({ 
        success: true, 
        newScore: userStats[req.user.id].score,
        message: `+${score} điểm`
    });
});

// ========== API LẤY DANH SÁCH HOẠT ĐỘNG ==========
app.get('/api/activities', authenticateToken, (req, res) => {
    // Trả về danh sách hoạt động mẫu (có thể lưu thêm vào database sau)
    const sampleActivities = [
        { id: 1, title: 'Chào mừng bạn đến với Milk Coffee!', score: 0, time: new Date().toISOString() }
    ];
    res.json(sampleActivities);
});

// ========== API THƯ VIỆN ==========
app.get('/api/library', authenticateToken, (req, res) => {
    res.json(libraryFiles);
});

app.post('/api/library', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const { type, grade, subject } = req.body;
        const fileType = req.file.originalname.split('.').pop().toLowerCase();
        
        const newFile = {
            id: Date.now().toString(),
            name: req.file.originalname,
            type: type || 'exam',
            fileType: fileType,
            filePath: `/uploads/${req.file.filename}`,
            uploadedBy: req.user.username,
            uploadedAt: new Date().toISOString(),
            grade: grade || '10',
            subject: subject || 'toan',
            size: req.file.size,
            color: type === 'exam' ? '#1565C0' : '#e6a017',
            color2: type === 'exam' ? '#42a5f5' : '#fbbf24'
        };

        libraryFiles.push(newFile);

        res.json({ 
            success: true, 
            file: newFile 
        });

    } catch (error) {
        console.error('Upload library error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/library/:fileId', authenticateToken, (req, res) => {
    const fileId = req.params.fileId;

    // Kiểm tra quyền admin
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ admin mới có quyền xóa' });
    }

    // Tìm và xóa file vật lý nếu có
    const fileToDelete = libraryFiles.find(f => f.id === fileId);
    if (fileToDelete && fileToDelete.filePath) {
        const fileName = fileToDelete.filePath.split('/').pop();
        const filePath = path.join(__dirname, 'uploads', fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    libraryFiles = libraryFiles.filter(f => f.id !== fileId);
    res.json({ success: true });
});

// ========== API ADMIN: LẤY DANH SÁCH USER ==========
app.get('/api/admin/users', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Không có quyền truy cập' });
    }

    const userList = users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        gender: u.gender,
        role: u.role,
        avatar: u.avatar,
        createdAt: u.createdAt,
        stats: userStats[u.id] || { score: 0, hours: 0, progress: 0, rank: 100 }
    }));

    res.json(userList);
});

app.delete('/api/admin/users/:userId', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Không có quyền truy cập' });
    }

    const userId = parseInt(req.params.userId);
    
    // Không cho xóa chính mình
    if (userId === req.user.id) {
        return res.status(400).json({ error: 'Không thể xóa tài khoản đang đăng nhập' });
    }

    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete && userToDelete.avatar) {
        const fileName = userToDelete.avatar.split('/').pop();
        const filePath = path.join(__dirname, 'uploads', fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    users = users.filter(u => u.id !== userId);
    delete userStats[userId];
    delete userEvents[userId];

    res.json({ success: true });
});

// ========== API ADMIN: CẬP NHẬT USER ==========
app.put('/api/admin/users/:userId', authenticateToken, async (req, res) => {
    const adminUser = users.find(u => u.id === req.user.id);
    if (adminUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Không có quyền truy cập' });
    }

    const userId = parseInt(req.params.userId);
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    const { displayName, gender, password } = req.body;
    
    if (displayName !== undefined) users[userIndex].displayName = displayName;
    if (gender !== undefined) users[userIndex].gender = gender;
    if (password && password.length >= 6) {
        users[userIndex].password = await hashPassword(password);
    }

    res.json({ success: true });
});

// ========== API KIỂM TRA SỨC KHỎE ==========
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/test', (req, res) => {
    res.json({ message: '🚀 Server Milk Coffee đã chạy thành công!' });
});

// ========== KHỞI ĐỘNG SERVER ==========
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
    console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
    console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
});
