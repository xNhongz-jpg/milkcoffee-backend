const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'milkcoffee_secret_key_2025';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// Tạo thư mục uploads nếu chưa có
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// ========== HÀM LOẠI BỎ DẤU TIẾNG VIỆT ==========
function removeAccents(str) {
    if (!str) return '';
    
    const accents = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
    const unaccented = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
    
    let result = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    for (let i = 0; i < accents.length; i++) {
        const regex = new RegExp(accents[i], 'gi');
        result = result.replace(regex, unaccented[i]);
    }
    
    // Thay thế khoảng trắng và ký tự đặc biệt bằng dấu gạch dưới
    result = result.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Thay thế nhiều dấu gạch dưới liên tiếp bằng một dấu
    result = result.replace(/_+/g, '_');
    // Xóa dấu gạch dưới ở đầu và cuối
    result = result.replace(/^_|_$/g, '');
    
    return result;
}

// Cấu hình upload ảnh và file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, ext);
        // Loại bỏ dấu tiếng Việt và thay thế ký tự đặc biệt
        const cleanName = removeAccents(nameWithoutExt);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Tên file: timestamp_tenKhongDau.duoi
        cb(null, uniqueSuffix + '_' + cleanName + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB cho file
});

// ========== FILE LƯU TRỮ DỮ LIỆU ==========
const USERS_FILE = 'users.json';
const STATS_FILE = 'stats.json';
const EVENTS_FILE = 'events.json';
const ACTIVITIES_FILE = 'activities.json';

// Hàm đọc dữ liệu từ file
function loadData() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const savedUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            if (savedUsers.length > 0) {
                const adminExists = savedUsers.find(u => u.username === 'admin');
                if (adminExists) {
                    users = savedUsers;
                } else {
                    users = [users[0], ...savedUsers];
                }
            }
        }
        if (fs.existsSync(STATS_FILE)) {
            userStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
        if (fs.existsSync(EVENTS_FILE)) {
            userEvents = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
        }
        if (fs.existsSync(ACTIVITIES_FILE)) {
            userActivities = JSON.parse(fs.readFileSync(ACTIVITIES_FILE, 'utf8'));
        }
    } catch (err) {
        console.log('Không thể đọc file dữ liệu:', err);
    }
}

// Hàm lưu dữ liệu
function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveStats() {
    fs.writeFileSync(STATS_FILE, JSON.stringify(userStats, null, 2));
}

function saveEvents() {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(userEvents, null, 2));
}

function saveActivities() {
    fs.writeFileSync(ACTIVITIES_FILE, JSON.stringify(userActivities, null, 2));
}

// ========== DỮ LIỆU ==========
let users = [];
let userStats = {};
let userEvents = {};
let userActivities = {};

// Tạo tài khoản admin mặc định
const initAdmin = async () => {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    users.push({
        id: 1,
        username: 'admin',
        password: hashedPassword,
        displayName: 'Quản trị viên',
        gender: 'Nam',
        role: 'admin',
        avatar: null,
        cover: null,
        createdAt: new Date().toISOString()
    });
    userStats[1] = { score: 0, hours: 0, progress: 0, rank: 100 };
    saveUsers();
    saveStats();
};

// Đọc dữ liệu từ file trước
loadData();

// Nếu chưa có user nào (file trống), tạo admin
if (users.length === 0) {
    initAdmin();
} else {
    const adminExists = users.find(u => u.username === 'admin');
    if (!adminExists) {
        initAdmin();
    }
}

// ========== MIDDLEWARE XÁC THỰC ==========
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token không hợp lệ' });
        }
        req.user = user;
        next();
    });
};

// ========== API ĐĂNG KÝ ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;
        
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            id: users.length + 1,
            username,
            password: hashedPassword,
            displayName: displayName || username,
            gender: null,
            role: 'user',
            avatar: null,
            cover: null,
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        userStats[newUser.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
        
        saveUsers();
        saveStats();
        
        res.json({ 
            success: true, 
            message: 'Đăng ký thành công',
            user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName }
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API ĐĂNG NHẬP ==========
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        }
        
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
        res.status(500).json({ error: error.message });
    }
});

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
        avatar: user.avatar || null,
        cover: user.cover || null,
        createdAt: user.createdAt,
        stats: userStats[user.id] || { score: 0, hours: 0, progress: 0, rank: 100 }
    });
});

// ========== API CẬP NHẬT THÔNG TIN ==========
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { displayName, gender, currentPassword, newPassword } = req.body;
        
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }
        
        if (displayName) users[userIndex].displayName = displayName;
        if (gender) users[userIndex].gender = gender;
        
        if (currentPassword && newPassword) {
            const validPassword = await bcrypt.compare(currentPassword, users[userIndex].password);
            if (!validPassword) {
                return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
            }
            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
            }
            users[userIndex].password = await bcrypt.hash(newPassword, 10);
        }
        
        saveUsers();
        
        res.json({
            success: true,
            message: 'Cập nhật thành công',
            user: {
                id: users[userIndex].id,
                username: users[userIndex].username,
                displayName: users[userIndex].displayName,
                gender: users[userIndex].gender,
                avatar: users[userIndex].avatar,
                cover: users[userIndex].cover
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API UPLOAD ẢNH ĐẠI DIỆN ==========
app.post('/api/upload/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }
        
        const avatarUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
        
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            users[userIndex].avatar = avatarUrl;
            saveUsers();
        }
        
        res.json({
            success: true,
            avatarUrl: avatarUrl
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== API UPLOAD ẢNH BÌA ==========
app.post('/api/upload/cover', authenticateToken, upload.single('cover'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }
        
        const coverUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
        
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            users[userIndex].cover = coverUrl;
            saveUsers();
        }
        
        res.json({
            success: true,
            coverUrl: coverUrl
        });
        
    } catch (error) {
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
    
    saveEvents();
    
    res.json({ success: true, event: newEvent });
});

app.delete('/api/events/:eventId', authenticateToken, (req, res) => {
    const eventId = parseInt(req.params.eventId);
    
    if (userEvents[req.user.id]) {
        userEvents[req.user.id] = userEvents[req.user.id].filter(e => e.id !== eventId);
        saveEvents();
    }
    
    res.json({ success: true });
});

// ========== API LẤY LỊCH SỬ HOẠT ĐỘNG ==========
app.get('/api/activities', authenticateToken, (req, res) => {
    const userActivityList = userActivities[req.user.id] || [];
    const recentActivities = [...userActivityList].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 50);
    res.json(recentActivities);
});

// ========== API THÊM HOẠT ĐỘNG ==========
app.post('/api/activities', authenticateToken, (req, res) => {
    const { title, score } = req.body;
    
    if (!userStats[req.user.id]) {
        userStats[req.user.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
    }
    userStats[req.user.id].score += score;
    saveStats();
    
    if (!userActivities[req.user.id]) {
        userActivities[req.user.id] = [];
    }
    
    const newActivity = {
        id: Date.now(),
        title: title,
        score: score,
        time: new Date().toISOString()
    };
    
    userActivities[req.user.id].unshift(newActivity);
    if (userActivities[req.user.id].length > 100) {
        userActivities[req.user.id] = userActivities[req.user.id].slice(0, 100);
    }
    saveActivities();
    
    res.json({ 
        success: true, 
        newScore: userStats[req.user.id].score,
        message: `+${score} điểm`,
        activity: newActivity
    });
});

// ========== API KIỂM TRA TOKEN ==========
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ========== API LẤY DANH SÁCH USER (ADMIN) ==========
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

// ========== API XÓA USER (ADMIN) ==========
app.delete('/api/admin/users/:userId', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    
    const userId = parseInt(req.params.userId);
    if (userId === 1) {
        return res.status(400).json({ error: 'Không thể xóa tài khoản admin' });
    }
    
    users = users.filter(u => u.id !== userId);
    delete userStats[userId];
    delete userEvents[userId];
    delete userActivities[userId];
    
    saveUsers();
    saveStats();
    saveEvents();
    saveActivities();
    
    res.json({ success: true });
});

// ========== API THƯ VIỆN (LIBRARY) ==========
const LIBRARY_FILE = 'library.json';
let libraryFiles = [];

if (fs.existsSync(LIBRARY_FILE)) {
    libraryFiles = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
}

function saveLibrary() {
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(libraryFiles, null, 2));
}

app.get('/api/library', authenticateToken, (req, res) => {
    res.json(libraryFiles);
});

app.post('/api/library', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }
        
        const { type } = req.body;
        const fileUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
        
        // Lưu tên gốc (có dấu) để hiển thị, và tên file đã xử lý để lưu trữ
        const originalName = req.file.originalname;
        
        const newFile = {
            id: Date.now().toString(),
            name: originalName,           // Tên gốc có dấu để hiển thị
            displayName: originalName,
            type: type,
            filePath: fileUrl,
            uploadedBy: req.user.username,
            uploadedAt: new Date().toISOString(),
            size: req.file.size
        };
        
        libraryFiles.push(newFile);
        saveLibrary();
        
        res.json({ success: true, file: newFile });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/library/:fileId', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ admin mới có quyền xóa' });
    }
    
    const fileId = req.params.fileId;
    const fileToDelete = libraryFiles.find(f => f.id === fileId);
    if (fileToDelete && fileToDelete.filePath) {
        // Xóa file vật lý nếu có
        const filePath = path.join(__dirname, fileToDelete.filePath.replace(`http://localhost:${PORT}`, ''));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    
    libraryFiles = libraryFiles.filter(f => f.id !== fileId);
    saveLibrary();
    
    res.json({ success: true });
});

// ========== API TEST ==========
app.get('/api/test', (req, res) => {
    res.json({ message: '🚀 Server Milk Coffee đã chạy thành công!' });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ========== KHỞI ĐỘNG SERVER ==========
app.listen(PORT, () => {
    console.log(`✅ Server chạy tại http://localhost:${PORT}`);
    console.log(`📝 Test API: http://localhost:${PORT}/api/test`);
    console.log(`🔐 Đăng nhập: POST http://localhost:${PORT}/api/auth/login`);
    console.log(`📝 Đăng ký: POST http://localhost:${PORT}/api/auth/register`);
    console.log(`👤 Admin: admin / admin123`);
    console.log(`💾 Dữ liệu được lưu trong file: ${USERS_FILE}, ${STATS_FILE}, ${EVENTS_FILE}, ${ACTIVITIES_FILE}`);
});