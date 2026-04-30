const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'milkcoffee_secret_key_2025_super_secure';

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

// ==================== CẤU HÌNH UPLOAD ====================
// Tạo thư mục uploads nếu chưa có
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}
if (!fs.existsSync('uploads/avatars')) {
    fs.mkdirSync('uploads/avatars');
}
if (!fs.existsSync('uploads/covers')) {
    fs.mkdirSync('uploads/covers');
}
if (!fs.existsSync('uploads/files')) {
    fs.mkdirSync('uploads/files');
}

// Cấu hình upload avatar
const avatarStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/avatars/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Cấu hình upload cover
const coverStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/covers/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'cover-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Cấu hình upload file
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/files/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const avatarUpload = multer({ 
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const coverUpload = multer({ 
    storage: coverStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const fileUpload = multer({ 
    storage: fileStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ==================== DỮ LIỆU (Tạm thời lưu trong RAM) ====================
let users = [];
let userStats = {};
let userEvents = {};
let userNews = {};
let libraryFiles = [];
let exams = [];
let activities = {};

// Hàm hash password
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

// Tạo admin mặc định nếu chưa có
async function createDefaultAdmin() {
    const adminExists = users.find(u => u.username === 'admin');
    if (!adminExists) {
        const hashedPassword = await hashPassword('admin123');
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
        console.log('✅ Đã tạo tài khoản admin mặc định: admin / admin123');
    }
}

// ==================== MIDDLEWARE XÁC THỰC ====================
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

// ==================== API AUTH ====================
// Đăng ký
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Tên đăng nhập phải có ít nhất 3 ký tự' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }

        // Kiểm tra username tồn tại
        if (users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        }

        // Tạo user mới
        const newUser = {
            id: users.length + 1,
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
        userStats[newUser.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
        userEvents[newUser.id] = [];
        userNews[newUser.id] = [];
        activities[newUser.id] = [];

        res.json({ 
            success: true, 
            message: 'Đăng ký thành công',
            user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Đăng nhập
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
        res.status(500).json({ error: error.message });
    }
});

// ==================== API USER PROFILE ====================
// Lấy thông tin profile
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

// Cập nhật profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { displayName, gender, currentPassword, newPassword } = req.body;

        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }

        // Cập nhật thông tin cơ bản
        if (displayName) users[userIndex].displayName = displayName;
        if (gender) users[userIndex].gender = gender;

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

        res.json({
            success: true,
            message: 'Cập nhật thành công',
            user: {
                id: users[userIndex].id,
                username: users[userIndex].username,
                displayName: users[userIndex].displayName,
                gender: users[userIndex].gender
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API UPLOAD ====================
// Upload avatar
app.post('/api/upload/avatar', authenticateToken, avatarUpload.single('avatar'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;

        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            users[userIndex].avatar = avatarUrl;
        }

        res.json({
            success: true,
            avatarUrl: avatarUrl
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload cover
app.post('/api/upload/cover', authenticateToken, coverUpload.single('cover'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }

        const coverUrl = `${req.protocol}://${req.get('host')}/uploads/covers/${req.file.filename}`;

        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            users[userIndex].cover = coverUrl;
        }

        res.json({
            success: true,
            coverUrl: coverUrl
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== API HOẠT ĐỘNG ====================
// Lấy danh sách hoạt động
app.get('/api/activities', authenticateToken, (req, res) => {
    const userActivities = activities[req.user.id] || [];
    res.json(userActivities);
});

// Thêm hoạt động
app.post('/api/activities', authenticateToken, (req, res) => {
    const { title, score } = req.body;
    
    if (!activities[req.user.id]) {
        activities[req.user.id] = [];
    }
    
    // Cập nhật điểm
    if (!userStats[req.user.id]) {
        userStats[req.user.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
    }
    userStats[req.user.id].score += score;
    
    const newActivity = {
        id: Date.now(),
        title: title,
        score: score,
        time: new Date().toISOString()
    };
    
    activities[req.user.id].unshift(newActivity);
    
    // Giới hạn 100 hoạt động gần nhất
    if (activities[req.user.id].length > 100) {
        activities[req.user.id] = activities[req.user.id].slice(0, 100);
    }
    
    res.json({ 
        success: true, 
        activity: newActivity,
        newScore: userStats[req.user.id].score
    });
});

// ==================== API SỰ KIỆN ====================
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
        title: title,
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

// ==================== API ĐỀ THI ====================
// Lấy danh sách đề thi
app.get('/api/exams', authenticateToken, (req, res) => {
    res.json(exams);
});

// Lấy một đề thi
app.get('/api/exams/:examId', authenticateToken, (req, res) => {
    const exam = exams.find(e => e.id === req.params.examId);
    if (!exam) {
        return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    }
    res.json(exam);
});

// Tạo đề thi mới (chỉ admin)
app.post('/api/exams', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ admin mới có quyền tạo đề thi' });
    }
    
    const { title, grade, subject, questions } = req.body;
    
    if (!title || !questions || questions.length === 0) {
        return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
    
    const newExam = {
        id: Date.now().toString(),
        title: title,
        grade: grade,
        subject: subject,
        questions: questions,
        createdAt: new Date().toISOString(),
        createdBy: req.user.username
    };
    
    exams.push(newExam);
    res.json({ success: true, exam: newExam });
});

// Cập nhật đề thi (chỉ admin)
app.put('/api/exams/:examId', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ admin mới có quyền sửa đề thi' });
    }
    
    const examIndex = exams.findIndex(e => e.id === req.params.examId);
    if (examIndex === -1) {
        return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    }
    
    const { title, grade, subject, questions } = req.body;
    
    exams[examIndex] = {
        ...exams[examIndex],
        title: title || exams[examIndex].title,
        grade: grade || exams[examIndex].grade,
        subject: subject || exams[examIndex].subject,
        questions: questions || exams[examIndex].questions,
        updatedAt: new Date().toISOString()
    };
    
    res.json({ success: true, exam: exams[examIndex] });
});

// Xóa đề thi (chỉ admin)
app.delete('/api/exams/:examId', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ admin mới có quyền xóa đề thi' });
    }
    
    const examIndex = exams.findIndex(e => e.id === req.params.examId);
    if (examIndex === -1) {
        return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    }
    
    exams.splice(examIndex, 1);
    res.json({ success: true });
});

// ==================== API THƯ VIỆN ====================
app.get('/api/library', authenticateToken, (req, res) => {
    res.json(libraryFiles);
});

app.post('/api/library', authenticateToken, fileUpload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Không có file được upload' });
        }
        
        const { type, grade, subject } = req.body;
        const fileUrl = `${req.protocol}://${req.get('host')}/uploads/files/${req.file.filename}`;
        
        const newFile = {
            id: Date.now().toString(),
            name: req.file.originalname,
            type: type,
            grade: grade,
            subject: subject,
            filePath: fileUrl,
            uploadedBy: req.user.username,
            uploadedAt: new Date().toISOString(),
            size: req.file.size
        };
        
        libraryFiles.push(newFile);
        
        res.json({ 
            success: true, 
            file: newFile 
        });
        
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
    libraryFiles = libraryFiles.filter(f => f.id !== fileId);
    res.json({ success: true });
});

// ==================== API ADMIN ====================
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
    const admin = users.find(u => u.id === req.user.id);
    if (admin?.role !== 'admin') {
        return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    
    const userId = parseInt(req.params.userId);
    const userToDelete = users.find(u => u.id === userId);
    
    if (!userToDelete) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }
    
    if (userToDelete.role === 'admin') {
        return res.status(403).json({ error: 'Không thể xóa tài khoản admin' });
    }
    
    users = users.filter(u => u.id !== userId);
    delete userStats[userId];
    delete userEvents[userId];
    delete userNews[userId];
    delete activities[userId];
    
    res.json({ success: true });
});

app.put('/api/admin/users/:userId', authenticateToken, (req, res) => {
    const admin = users.find(u => u.id === req.user.id);
    if (admin?.role !== 'admin') {
        return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    
    const userId = parseInt(req.params.userId);
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }
    
    const { displayName, gender, password } = req.body;
    
    if (displayName) users[userIndex].displayName = displayName;
    if (gender) users[userIndex].gender = gender;
    
    res.json({ success: true });
});

// ==================== API KIỂM TRA SERVER ====================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        users: users.length,
        exams: exams.length
    });
});

app.get('/api/test', (req, res) => {
    res.json({ message: '🚀 Server Milk Coffee đã chạy thành công!' });
});

// ==================== KHỞI ĐỘNG SERVER ====================
async function startServer() {
    await createDefaultAdmin();
    
    // Tạo đề thi mẫu nếu chưa có
    if (exams.length === 0) {
        const sampleExam = {
            id: 'sample_exam_1',
            title: 'Đề thi mẫu - Toán 10',
            grade: '10',
            subject: 'toan',
            questions: [
                {
                    id: 1,
                    text: 'Giá trị của biểu thức A = 2x + 3 khi x = 5 là:',
                    options: ['10', '11', '12', '13'],
                    correct: 2,
                    level: 'Dễ'
                },
                {
                    id: 2,
                    text: 'Phương trình x² - 5x + 6 = 0 có tập nghiệm là:',
                    options: ['{1,6}', '{2,3}', '{-2,-3}', '{1,5}'],
                    correct: 1,
                    level: 'Trung bình'
                },
                {
                    id: 3,
                    text: 'Hàm số y = 2x + 3 là hàm số gì?',
                    options: ['Hàm số bậc nhất', 'Hàm số bậc hai', 'Hàm số hằng', 'Hàm số nghịch biến'],
                    correct: 0,
                    level: 'Dễ'
                },
                {
                    id: 4,
                    text: 'Tập xác định của hàm số y = √(x - 2) là:',
                    options: ['x ≥ 0', 'x ≥ 2', 'x > 2', 'x ∈ R'],
                    correct: 1,
                    level: 'Trung bình'
                },
                {
                    id: 5,
                    text: 'Cho tam giác ABC có AB = 3, AC = 4, BC = 5. Tam giác ABC là tam giác gì?',
                    options: ['Tam giác đều', 'Tam giác cân', 'Tam giác vuông', 'Tam giác tù'],
                    correct: 2,
                    level: 'Trung bình'
                }
            ],
            createdAt: new Date().toISOString(),
            createdBy: 'admin'
        };
        exams.push(sampleExam);
        console.log('✅ Đã tạo đề thi mẫu');
    }
    
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   ☕ MILK COFFEE BACKEND - ĐÃ CHẠY THÀNH CÔNG!             ║
║                                                            ║
║   📍 Server: http://localhost:${PORT}                          ║
║   🧪 Test API: http://localhost:${PORT}/api/test               ║
║   💚 Health: http://localhost:${PORT}/api/health              ║
║                                                            ║
║   👤 Admin: admin / admin123                               ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
        `);
    });
}

startServer();
