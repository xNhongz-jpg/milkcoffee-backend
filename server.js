const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'milkcoffee_secret_key_2025';
const GEMINI_API_KEY = 'AIzaSyCM417vH6NrezkvKaxvViJfdn-qL70g7o8';
const BASE_URL = 'https://milkcoffee-backend-production.up.railway.app';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Tạo thư mục uploads nếu chưa có
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('uploads/exams')) fs.mkdirSync('uploads/exams');

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
    result = result.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return result;
}

// Cấu hình upload file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'examFile') cb(null, 'uploads/exams/');
        else cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const nameWithoutExt = path.basename(file.originalname, ext);
        const cleanName = removeAccents(nameWithoutExt);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '_' + cleanName + ext);
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ========== FILE LƯU TRỮ DỮ LIỆU ==========
const USERS_FILE = 'users.json';
const STATS_FILE = 'stats.json';
const EVENTS_FILE = 'events.json';
const ACTIVITIES_FILE = 'activities.json';
const LIBRARY_FILE = 'library.json';
const EXAMS_FILE = 'exams.json';
const EXAM_RESULTS_FILE = 'exam_results.json';
const EXAM_SESSIONS_FILE = 'exam_sessions.json';
const EXAM_EXITS_FILE = 'exam_exits.json';

// ========== DỮ LIỆU ==========
let users = [];
let userStats = {};
let userEvents = {};
let userActivities = {};
let libraryFiles = [];
let exams = [];
let examResults = {};
let examSessions = {};
let examExits = {};

// ========== HÀM LOAD DATA ==========
function loadData() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const savedUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
            const adminExists = savedUsers.find(u => u.username === 'admin');
            if (adminExists) users = savedUsers;
            else users = [users[0], ...savedUsers];
        }
        if (fs.existsSync(STATS_FILE)) userStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        if (fs.existsSync(EVENTS_FILE)) userEvents = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
        if (fs.existsSync(ACTIVITIES_FILE)) userActivities = JSON.parse(fs.readFileSync(ACTIVITIES_FILE, 'utf8'));
        if (fs.existsSync(LIBRARY_FILE)) libraryFiles = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
        if (fs.existsSync(EXAMS_FILE)) exams = JSON.parse(fs.readFileSync(EXAMS_FILE, 'utf8'));
        if (fs.existsSync(EXAM_RESULTS_FILE)) examResults = JSON.parse(fs.readFileSync(EXAM_RESULTS_FILE, 'utf8'));
        if (fs.existsSync(EXAM_SESSIONS_FILE)) examSessions = JSON.parse(fs.readFileSync(EXAM_SESSIONS_FILE, 'utf8'));
        if (fs.existsSync(EXAM_EXITS_FILE)) examExits = JSON.parse(fs.readFileSync(EXAM_EXITS_FILE, 'utf8'));
    } catch (err) { console.log('Không thể đọc file dữ liệu:', err); }
}

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveStats() { fs.writeFileSync(STATS_FILE, JSON.stringify(userStats, null, 2)); }
function saveEvents() { fs.writeFileSync(EVENTS_FILE, JSON.stringify(userEvents, null, 2)); }
function saveActivities() { fs.writeFileSync(ACTIVITIES_FILE, JSON.stringify(userActivities, null, 2)); }
function saveLibrary() { fs.writeFileSync(LIBRARY_FILE, JSON.stringify(libraryFiles, null, 2)); }
function saveExams() { fs.writeFileSync(EXAMS_FILE, JSON.stringify(exams, null, 2)); }
function saveExamResults() { fs.writeFileSync(EXAM_RESULTS_FILE, JSON.stringify(examResults, null, 2)); }
function saveExamSessions() { fs.writeFileSync(EXAM_SESSIONS_FILE, JSON.stringify(examSessions, null, 2)); }
function saveExamExits() { fs.writeFileSync(EXAM_EXITS_FILE, JSON.stringify(examExits, null, 2)); }

// ========== KHỞI TẠO ADMIN ==========
const initAdmin = async () => {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    users.push({
        id: 1, username: 'admin', password: hashedPassword, displayName: 'Quản trị viên',
        gender: 'Nam', role: 'admin', avatar: null, cover: null, createdAt: new Date().toISOString()
    });
    userStats[1] = { score: 0, hours: 0, progress: 0, rank: 100 };
    saveUsers(); saveStats();
};

loadData();
if (users.length === 0) initAdmin();
else if (!users.find(u => u.username === 'admin')) initAdmin();

// ========== MIDDLEWARE XÁC THỰC ==========
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token không hợp lệ' });
        req.user = user;
        next();
    });
};

// ========== API ĐĂNG KÝ ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;
        if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
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
        saveUsers(); saveStats();
        res.json({ success: true, message: 'Đăng ký thành công', user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ========== API ĐĂNG NHẬP ==========
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = users.find(u => u.username === username);
        if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username, displayName: user.displayName, gender: user.gender, role: user.role, avatar: user.avatar, cover: user.cover } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ========== API LẤY THÔNG TIN NGƯỜI DÙNG ==========
app.get('/api/users/profile', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json({ id: user.id, username: user.username, displayName: user.displayName, gender: user.gender, role: user.role, avatar: user.avatar || null, cover: user.cover || null, createdAt: user.createdAt, stats: userStats[user.id] || { score: 0, hours: 0, progress: 0, rank: 100 } });
});

// ========== API CẬP NHẬT THÔNG TIN ==========
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { displayName, gender, currentPassword, newPassword } = req.body;
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex === -1) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        if (displayName) users[userIndex].displayName = displayName;
        if (gender) users[userIndex].gender = gender;
        if (currentPassword && newPassword) {
            const validPassword = await bcrypt.compare(currentPassword, users[userIndex].password);
            if (!validPassword) return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
            if (newPassword.length < 6) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
            users[userIndex].password = await bcrypt.hash(newPassword, 10);
        }
        saveUsers();
        res.json({ success: true, message: 'Cập nhật thành công', user: { id: users[userIndex].id, username: users[userIndex].username, displayName: users[userIndex].displayName, gender: users[userIndex].gender, avatar: users[userIndex].avatar, cover: users[userIndex].cover } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ========== API UPLOAD ẢNH ==========
app.post('/api/upload/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file được upload' });
        const avatarUrl = `${BASE_URL}/uploads/${req.file.filename}`;
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) { users[userIndex].avatar = avatarUrl; saveUsers(); }
        res.json({ success: true, avatarUrl: avatarUrl });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/upload/cover', authenticateToken, upload.single('cover'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file được upload' });
        const coverUrl = `${BASE_URL}/uploads/${req.file.filename}`;
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) { users[userIndex].cover = coverUrl; saveUsers(); }
        res.json({ success: true, coverUrl: coverUrl });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ========== API SỰ KIỆN ==========
app.get('/api/events', authenticateToken, (req, res) => { res.json(userEvents[req.user.id] || []); });
app.post('/api/events', authenticateToken, (req, res) => {
    const { title, date } = req.body;
    if (!userEvents[req.user.id]) userEvents[req.user.id] = [];
    const newEvent = { id: Date.now(), title, date: new Date(date).toISOString(), createdAt: new Date().toISOString() };
    userEvents[req.user.id].push(newEvent);
    userEvents[req.user.id].sort((a, b) => new Date(a.date) - new Date(b.date));
    saveEvents();
    res.json({ success: true, event: newEvent });
});
app.delete('/api/events/:eventId', authenticateToken, (req, res) => {
    const eventId = parseInt(req.params.eventId);
    if (userEvents[req.user.id]) userEvents[req.user.id] = userEvents[req.user.id].filter(e => e.id !== eventId);
    saveEvents();
    res.json({ success: true });
});

// ========== API HOẠT ĐỘNG ==========
app.get('/api/activities', authenticateToken, (req, res) => {
    const userActivityList = userActivities[req.user.id] || [];
    res.json([...userActivityList].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 50));
});
app.post('/api/activities', authenticateToken, (req, res) => {
    const { title, score } = req.body;
    if (!userStats[req.user.id]) userStats[req.user.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
    userStats[req.user.id].score += score;
    saveStats();
    if (!userActivities[req.user.id]) userActivities[req.user.id] = [];
    const newActivity = { id: Date.now(), title: title, score: score, time: new Date().toISOString() };
    userActivities[req.user.id].unshift(newActivity);
    if (userActivities[req.user.id].length > 100) userActivities[req.user.id] = userActivities[req.user.id].slice(0, 100);
    saveActivities();
    res.json({ success: true, newScore: userStats[req.user.id].score, message: `+${score} điểm`, activity: newActivity });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => { res.json({ valid: true, user: req.user }); });

// ========== API QUẢN LÝ NGƯỜI DÙNG (ADMIN) ==========
app.get('/api/admin/users', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Không có quyền truy cập' });
    res.json(users.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, gender: u.gender, role: u.role, avatar: u.avatar, cover: u.cover, createdAt: u.createdAt, stats: userStats[u.id] || { score: 0, hours: 0, progress: 0, rank: 100 } })));
});

app.put('/api/admin/users/:userId', authenticateToken, async (req, res) => {
    const admin = users.find(u => u.id === req.user.id);
    if (admin?.role !== 'admin') return res.status(403).json({ error: 'Không có quyền truy cập' });
    const userId = parseInt(req.params.userId);
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    const { displayName, gender, password } = req.body;
    if (displayName) users[userIndex].displayName = displayName;
    if (gender) users[userIndex].gender = gender;
    if (password && password.length >= 6) users[userIndex].password = await bcrypt.hash(password, 10);
    saveUsers();
    res.json({ success: true, message: 'Cập nhật người dùng thành công' });
});

app.delete('/api/admin/users/:userId', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Không có quyền truy cập' });
    const userId = parseInt(req.params.userId);
    if (userId === 1) return res.status(400).json({ error: 'Không thể xóa tài khoản admin' });
    users = users.filter(u => u.id !== userId);
    delete userStats[userId];
    delete userEvents[userId];
    delete userActivities[userId];
    saveUsers(); saveStats(); saveEvents(); saveActivities();
    res.json({ success: true });
});

// ========== API THƯ VIỆN ==========
app.get('/api/library', authenticateToken, (req, res) => { res.json(libraryFiles); });
app.post('/api/library', authenticateToken, upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có file được upload' });
        const { type, grade, subject } = req.body;
        const fileUrl = `${BASE_URL}/uploads/${req.file.filename}`;
        const fileExt = path.extname(req.file.originalname).substring(1);
        const subjectColors = { toan: { color: '#1e88e5', color2: '#42a5f5' }, van: { color: '#8e24aa', color2: '#ab47bc' }, anh: { color: '#43a047', color2: '#66bb6a' }, ly: { color: '#fb8c00', color2: '#ffa726' }, hoa: { color: '#e53935', color2: '#ef5350' }, sinh: { color: '#00897b', color2: '#26a69a' }, su: { color: '#6d4c41', color2: '#8d6e63' }, dia: { color: '#546e7a', color2: '#78909c' } };
        const colors = subjectColors[subject] || { color: '#1565C0', color2: '#42a5f5' };
        const newFile = { id: Date.now().toString(), name: req.file.originalname, displayName: req.file.originalname, type: type, grade: grade || '10', subject: subject || 'toan', fileType: fileExt, color: colors.color, color2: colors.color2, filePath: fileUrl, uploadedBy: req.user.username, uploadedAt: new Date().toISOString(), size: req.file.size };
        libraryFiles.push(newFile);
        saveLibrary();
        res.json({ success: true, file: newFile });
    } catch (error) { res.status(500).json({ error: error.message }); }
});
app.delete('/api/library/:fileId', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Chỉ admin mới có quyền xóa' });
    const fileId = req.params.fileId;
    const fileToDelete = libraryFiles.find(f => f.id === fileId);
    if (fileToDelete && fileToDelete.filePath) {
        const filePath = path.join(__dirname, fileToDelete.filePath.replace(BASE_URL, ''));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    libraryFiles = libraryFiles.filter(f => f.id !== fileId);
    saveLibrary();
    res.json({ success: true });
});

// ========== API QUẢN LÝ ĐỀ THI ==========
app.get('/api/exams', authenticateToken, (req, res) => { res.json(exams); });
app.get('/api/exams/:id', authenticateToken, (req, res) => {
    const exam = exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    res.json(exam);
});

// Hàm parse nội dung từ file Word
async function parseWordDocument(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value;
    const lines = text.split('\n').filter(l => l.trim());
    const questions = [];
    let currentQuestion = null;
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^\d+[\.\)]/.test(trimmed)) {
            if (currentQuestion && currentQuestion.options.length === 4) questions.push(currentQuestion);
            currentQuestion = { text: trimmed.replace(/^\d+[\.\)]\s*/, ''), options: [], correct: 0 };
        } else if (/^[A-D][\.\)]/.test(trimmed) && currentQuestion) {
            currentQuestion.options.push(trimmed.replace(/^[A-D][\.\)]\s*/, ''));
        }
    }
    if (currentQuestion && currentQuestion.options.length === 4) questions.push(currentQuestion);
    return questions;
}

// Upload file Excel/Word để tạo đề thi (Admin)
app.post('/api/admin/upload-exam', authenticateToken, upload.single('examFile'), async (req, res) => {
    try {
        const user = users.find(u => u.id === req.user.id);
        if (user?.role !== 'admin') return res.status(403).json({ error: 'Chỉ admin mới có quyền' });
        const { title, grade, subject, timeLimit, numQuestions } = req.body;
        const file = req.file;
        const fileExt = path.extname(file.originalname).toLowerCase();
        let questions = [];
        if (fileExt === '.xlsx' || fileExt === '.xls') {
            const workbook = XLSX.readFile(file.path);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet);
            for (const row of data) {
                questions.push({
                    text: row.cau_hoi || row.question,
                    options: [row.A || row.option_a, row.B || row.option_b, row.C || row.option_c, row.D || row.option_d],
                    correct: ['A', 'B', 'C', 'D'].indexOf(row.dap_an || row.answer),
                    level: row.muc_do || 'Trung bình'
                });
            }
        } else if (fileExt === '.docx' || fileExt === '.doc') {
            questions = await parseWordDocument(file.path);
            questions = questions.map((q, idx) => ({ ...q, level: 'Trung bình', id: idx + 1 }));
        } else {
            return res.status(400).json({ error: 'Chỉ hỗ trợ file Excel (.xlsx, .xls) hoặc Word (.docx)' });
        }
        if (questions.length === 0) return res.status(400).json({ error: 'Không tìm thấy câu hỏi trong file' });
        const newExam = {
            id: Date.now().toString(),
            title: title || path.basename(file.originalname, path.extname(file.originalname)),
            grade: grade || '10',
            subject: subject || 'toan',
            bankQuestions: questions,
            timeLimit: parseInt(timeLimit) || 60,
            numQuestions: parseInt(numQuestions) || Math.min(30, questions.length),
            createdAt: new Date().toISOString(),
            createdBy: req.user.username
        };
        exams.push(newExam);
        saveExams();
        fs.unlinkSync(file.path);
        res.json({ success: true, exam: newExam, totalQuestions: questions.length });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Tạo đề thi ngẫu nhiên từ ngân hàng câu hỏi
app.post('/api/exams/:id/generate', authenticateToken, (req, res) => {
    const exam = exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
    let { numQuestions = exam.numQuestions || 30, timeLimit = exam.timeLimit || 60 } = req.body;
    numQuestions = Math.min(numQuestions, exam.bankQuestions.length);
    let shuffledBank = [...exam.bankQuestions];
    for (let i = shuffledBank.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledBank[i], shuffledBank[j]] = [shuffledBank[j], shuffledBank[i]];
    }
    const selectedQuestions = shuffledBank.slice(0, numQuestions);
    const finalQuestions = selectedQuestions.map(q => {
        const options = [...q.options];
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }
        const newCorrect = options.findIndex(opt => opt === q.options[q.correct]);
        return { id: Date.now() + Math.random(), text: q.text, options: options, correct: newCorrect, level: q.level };
    });
    for (let i = finalQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
    }
    const sessionExam = {
        id: Date.now().toString(),
        examId: exam.id,
        title: exam.title,
        questions: finalQuestions,
        timeLimit: timeLimit,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + timeLimit * 60 * 1000)
    };
    examSessions[req.user.id] = sessionExam;
    saveExamSessions();
    res.json({ success: true, exam: { id: sessionExam.id, title: sessionExam.title, questions: finalQuestions.map(q => ({ id: q.id, text: q.text, options: q.options })), timeLimit: sessionExam.timeLimit, expiresAt: sessionExam.expiresAt } });
});

// Ghi nhận thoát toàn màn hình
app.post('/api/exams/exit-record', authenticateToken, (req, res) => {
    if (!examExits[req.user.id]) examExits[req.user.id] = 0;
    examExits[req.user.id]++;
    saveExamExits();
    res.json({ success: true, exitCount: examExits[req.user.id] });
});

// Nộp bài thi
app.post('/api/exams/:id/submit-full', authenticateToken, (req, res) => {
    const { answers, exitCount } = req.body;
    const session = examSessions[req.user.id];
    if (!session) return res.status(400).json({ error: 'Phiên làm bài không tồn tại' });
    const isExpired = new Date() > new Date(session.expiresAt);
    let correctCount = 0;
    const results = [];
    session.questions.forEach(q => {
        const userAnswer = answers[q.id];
        const isCorrect = userAnswer !== undefined && userAnswer === q.correct;
        if (isCorrect) correctCount++;
        results.push({ id: q.id, text: q.text, options: q.options, correctAnswer: q.options[q.correct], userAnswer: userAnswer !== undefined ? q.options[userAnswer] : 'Chưa trả lời', isCorrect: isCorrect, level: q.level });
    });
    const score = Math.round((correctCount / session.questions.length) * 10);
    const earnedPoints = score * 10;
    if (!userStats[req.user.id]) userStats[req.user.id] = { score: 0, hours: 0, progress: 0, rank: 100 };
    userStats[req.user.id].score += earnedPoints;
    saveStats();
    if (!userActivities[req.user.id]) userActivities[req.user.id] = [];
    userActivities[req.user.id].unshift({ id: Date.now(), title: `Hoàn thành đề thi: ${session.title}`, score: earnedPoints, time: new Date().toISOString() });
    saveActivities();
    if (!examResults[req.user.id]) examResults[req.user.id] = [];
    examResults[req.user.id].unshift({ examId: session.examId, examTitle: session.title, score: score, correctCount: correctCount, totalQuestions: session.questions.length, results: results, exitCount: exitCount || 0, completedAt: new Date().toISOString(), isExpired: isExpired });
    if (examResults[req.user.id].length > 50) examResults[req.user.id] = examResults[req.user.id].slice(0, 50);
    saveExamResults();
    delete examSessions[req.user.id];
    saveExamSessions();
    res.json({ success: true, score: score, correctCount: correctCount, totalQuestions: session.questions.length, results: results, exitCount: exitCount || 0, isExpired: isExpired, message: `Bạn đạt ${score}/10 điểm! +${earnedPoints} điểm tích lũy` });
});

// API AI giải thích câu hỏi
app.post('/api/ai/explain', authenticateToken, async (req, res) => {
    const { questionText, correctAnswer, userAnswer, options } = req.body;
    const prompt = `Bạn là giáo viên dạy giỏi. Hãy giải thích câu hỏi trắc nghiệm sau:\n\nCâu hỏi: ${questionText}\nCác đáp án:\nA. ${options[0]}\nB. ${options[1]}\nC. ${options[2]}\nD. ${options[3]}\n\nĐáp án đúng là: ${correctAnswer}\nHọc sinh chọn: ${userAnswer || 'Chưa chọn đáp án'}\n\nHãy giải thích:\n1. Tại sao đáp án đúng lại đúng\n2. Nếu học sinh chọn sai, hãy giải thích tại sao sai\n3. Cung cấp kiến thức cần nhớ`;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const explanation = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không thể giải thích lúc này.';
        res.json({ success: true, explanation });
    } catch (error) {
        res.json({ success: true, explanation: `📚 Giải thích:\nĐáp án đúng là: ${correctAnswer}\n\nHãy xem lại kiến thức về chủ đề này nhé!` });
    }
});

// API lấy lịch sử làm bài
app.get('/api/exams/results/history', authenticateToken, (req, res) => { res.json(examResults[req.user.id] || []); });

// API lấy thống kê admin
app.get('/api/admin/stats', authenticateToken, (req, res) => {
    const admin = users.find(u => u.id === req.user.id);
    if (admin?.role !== 'admin') return res.status(403).json({ error: 'Không có quyền truy cập' });
    res.json({ totalUsers: users.length, totalExams: exams.length, totalLibraryFiles: libraryFiles.length, topUsers: Object.entries(userStats).map(([userId, stats]) => ({ userId: parseInt(userId), username: users.find(u => u.id == userId)?.username || 'Unknown', displayName: users.find(u => u.id == userId)?.displayName || 'Unknown', score: stats.score })).sort((a, b) => b.score - a.score).slice(0, 10) });
});

// API test
app.get('/api/test', (req, res) => { res.json({ message: '🚀 Server Milk Coffee đã chạy thành công!' }); });
app.get('/api/health', (req, res) => { res.json({ status: 'OK', timestamp: new Date().toISOString() }); });

// ========== KHỞI ĐỘNG SERVER ==========
app.listen(PORT, () => {
    console.log(`✅ Server chạy tại ${BASE_URL}`);
    console.log(`📝 Test API: ${BASE_URL}/api/test`);
    console.log(`🔐 Đăng nhập: POST ${BASE_URL}/api/auth/login`);
    console.log(`👤 Admin: admin / admin123`);
    console.log(`📁 Upload file đề thi: POST ${BASE_URL}/api/admin/upload-exam (admin only)`);
});
