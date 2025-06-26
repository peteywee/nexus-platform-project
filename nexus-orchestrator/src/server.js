const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const db = require('./db');
const agent = require('./agent');
// ** NEW: Import authentication dependencies **
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const emitEvent = (type, payload) => {
    const event = { type, payload, timestamp: new Date() };
    console.log('EVENT:', event);
    io.emit('platform_event', event);
};

agent.setEventEmitter(emitEvent);

// --- Static Pages ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'upload.html')));
app.get('/command', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'command.html')));

// --- Agent APIs ---
app.post('/api/upload', upload.single('document'), agent.handleFileUpload);
app.post('/api/command', agent.handleCommand);
app.get('/api/tasks', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
});

// ** NEW: Authentication API Endpoints **

// --- Register a new user ---
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const { rows } = await db.query(
            'INSERT INTO users(email, password_hash) VALUES($1, $2) RETURNING id, email',
            [email, password_hash]
        );
        emitEvent('USER_REGISTERED', { userId: rows[0].id, email: rows[0].email });
        res.status(201).json({ message: "User registered successfully.", user: rows[0] });

    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ error: "A user with this email already exists." });
        }
        console.error("Registration error:", error);
        res.status(500).json({ error: "An error occurred during registration." });
    }
});

// --- Log in a user ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    try {
        const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = rows[0];

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials." });
        }

        const payload = { userId: user.id, email: user.email };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

        emitEvent('USER_LOGGED_IN', { userId: user.id, email: user.email });
        res.json({ message: "Login successful.", token });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "An error occurred during login." });
    }
});


// --- WebSocket and Server Startup ---
io.on('connection', (socket) => {
    console.log('A user connected');
    emitEvent('USER_CONNECTED', { socketId: socket.id });
    socket.on('disconnect', () => console.log('User disconnected'));
});

const PORT = 3000;
server.listen(PORT, async () => {
    await db.initDb();
    console.log(`Nexus Orchestrator listening on internal port ${PORT}`);
    emitEvent('SERVER_START', { message: `Orchestrator online, mapped to external port 3003.` });
});
