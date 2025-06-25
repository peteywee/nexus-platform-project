const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const db = require('./db');
const agent = require('./agent');

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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'upload.html')));
app.get('/command', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'command.html')));

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
