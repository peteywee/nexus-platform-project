require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const FormData = require('form-data');
const db = require('./db');

const GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

let emitEvent; // This will be set by server.js

const setEventEmitter = (emitter) => {
    emitEvent = emitter;
};

const recordTask = async (type, payload, status = 'pending', result = null, error = null) => {
    try {
        const { rows } = await db.query(
            'INSERT INTO tasks(type, payload, status, result, error) VALUES($1, $2, $3, $4, $5) RETURNING *',
            [type, payload, status, result, error]
        );
        return rows[0];
    } catch (err) {
        console.error('Error recording task:', err);
        emitEvent('TASK_RECORD_ERROR', { type, payload, error: err.message });
    }
};

const updateTaskStatus = async (taskId, status, result = null, error = null) => {
    try {
        await db.query(
            'UPDATE tasks SET status = $1, result = $2, error = $3 WHERE id = $4',
            [status, result, error, taskId]
        );
    } catch (err) {
        console.error('Error updating task status:', err);
        emitEvent('TASK_UPDATE_ERROR', { taskId, status, error: err.message });
    }
};

const handleFileUpload = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const file = req.file;
    const originalname = file.originalname;
    const mimetype = file.mimetype;
    let engineUrl = '';
    let taskType = '';

    emitEvent('FILE_UPLOAD_RECEIVED', { filename: originalname, mimetype });

    let taskId;
    try {
        taskId = (await recordTask('FILE_UPLOAD', { filename: originalname, mimetype })).id;

        const formData = new FormData();
        formData.append('file', file.buffer, {
            filename: originalname,
            contentType: mimetype,
        });

        const headers = {
            ...formData.getHeaders(),
            // FormData.getLengthSync() is synchronous, useful when dealing with file streams or buffers
            // However, it can be slow for very large files. For simplicity, we keep it here.
            'Content-Length': formData.getLengthSync(),
        };

        // Determine destination engine based on MIME type
        if (mimetype === 'application/pdf' || mimetype.startsWith('text/') || mimetype.startsWith('image/') || mimetype.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
            engineUrl = 'http://knowledge-engine:4000/ingest';
            taskType = 'Knowledge Ingestion';
        } else if (mimetype === 'text/csv') {
            engineUrl = 'http://financial-engine:5000/ingest/transactions';
            taskType = 'Financial Ingestion';
        } else {
            const errorMessage = `Unsupported file type: ${mimetype}`;
            console.error(errorMessage);
            emitEvent('FILE_UPLOAD_FAILED', { filename: originalname, error: errorMessage });
            await updateTaskStatus(taskId, 'failed', null, errorMessage);
            return res.status(400).json({ error: errorMessage });
        }

        const response = await axios.post(engineUrl, formData, { headers });
        emitEvent('FILE_UPLOAD_SUCCESS', { filename: originalname, response: response.data, engine: taskType });
        await updateTaskStatus(taskId, 'completed', response.data);
        res.json({ message: `${taskType} initiated successfully.`, data: response.data });

    } catch (error) {
        const errorMessage = error.message;
        const errorDetails = error.response ? error.response.data : 'No response data';
        console.error(`Error during file upload to ${engineUrl}:`, errorMessage, errorDetails);
        emitEvent('FILE_UPLOAD_FAILED', {
            filename: originalname,
            error: errorMessage,
            details: errorDetails,
            engine: taskType,
        });
        await updateTaskStatus(taskId, 'failed', null, errorMessage);
        res.status(500).json({ error: `Failed to process file: ${errorMessage}` });
    }
};

const handleCommand = async (req, res) => {
    const { command } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Command is required.' });
    }

    emitEvent('COMMAND_RECEIVED', { command });

    let taskId;
    try {
        taskId = (await recordTask('COMMAND_EXECUTION', { command })).id;

        // Use Gemini to interpret the command
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `You are an intelligent assistant for the Nexus Platform. Your role is to interpret user commands and decide which internal API to call or what information to provide.
        
        Available actions/APIs:
        1. **Query Knowledge Base**: If the user asks a question about general information, facts, or asks to "search" or "find" something that sounds like an information retrieval task.
           - API: POST http://knowledge-engine:4000/query
           - Payload: {"question": "The user's question"}
           - Respond to the user with the relevant information found.

        2. **Get Financial Summary**: If the user asks for a summary of financial transactions, spending categories, or asks "what are my expenses" or "show financial data".
           - API: GET http://financial-engine:5000/api/financial/summary/by_category
           - Payload: No payload needed.
           - Respond to the user with the financial summary.

        3. **General Inquiry**: If the command is not clearly an API call (e.g., greetings, general chat, platform questions, or unhandled requests).
           - Do not call any API.
           - Respond directly to the user in a helpful manner. You can acknowledge the role of the platform.

        Based on the following user command, respond with the action you would take, structured as a JSON object.
        If an API call is recommended, include "action": "API_CALL", "api": "URL", and "payload": {}.
        If it's a general inquiry, include "action": "GENERAL_INQUIRY", "response": "Your proposed response text".
        
        Example for API_CALL (Knowledge):
        User: "What is the capital of France?"
        Response: {"action": "API_CALL", "api": "http://knowledge-engine:4000/query", "payload": {"question": "capital of France"}}
        
        Example for API_CALL (Financial):
        User: "Summarize my spending"
        Response: {"action": "API_CALL", "api": "http://financial-engine:5000/api/financial/summary/by_category", "payload": {}}

        Example for GENERAL_INQUIRY:
        User: "Hello there"
        Response: {"action": "GENERAL_INQUIRY", "response": "Hello! I am Nexus Platform's AI assistant, ready to help with your data."}

        You must provide a valid JSON object. Do not include any other text or formatting outside the JSON.
        User command: "${command}"
        Response:
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        console.log("Gemini Raw Response:", responseText); // Log raw for debugging

        let parsedAction;
        try {
            // Attempt to parse the response as JSON. Trim whitespace that might interfere.
            parsedAction = JSON.parse(responseText.trim());
        } catch (parseError) {
            console.error("Failed to parse Gemini's JSON response:", parseError);
            emitEvent('GEMINI_PARSE_ERROR', { command, responseText, error: parseError.message });
            // Fallback to a general error response if parsing fails
            parsedAction = { action: "GENERAL_INQUIRY", response: "I had trouble interpreting your command. The AI response was not in the expected format. Could you please rephrase?" };
        }

        let agentResponse = "";
        if (parsedAction.action === "API_CALL") {
            const { api, payload } = parsedAction;
            emitEvent('API_CALL_INITIATED', { api, payload, command });
            let apiResult;
            try {
                if (api.includes("knowledge-engine/query")) {
                    apiResult = await axios.post(api, payload);
                    if (apiResult.data && apiResult.data.results && apiResult.data.results.length > 0) {
                        agentResponse = `Knowledge Base Query Results:\n\n${apiResult.data.results.map(r => `[Score: ${r.score ? r.score.toFixed(2) : 'N/A'}] Source: ${r.source || 'Unknown'}\nContent: ${r.text}`).join('\n\n')}`;
                    } else {
                        agentResponse = "No relevant information found in the Knowledge Base for your query.";
                    }
                } else if (api.includes("financial/summary/by_category")) {
                    apiResult = await axios.get(api);
                    if (apiResult.data && apiResult.data.length > 0) {
                        agentResponse = `Financial Summary by Category:\n\n${apiResult.data.map(item => `- ${item.category}: $${item.total ? parseFloat(item.total).toFixed(2) : 'N/A'}`).join('\n')}`;
                    } else {
                        agentResponse = "No financial data available or categorized yet. Please ingest some transaction data.";
                    }
                } else {
                    agentResponse = `I received an instruction to call an unknown API: ${api}. This issue has been logged.`;
                    emitEvent('UNKNOWN_API_CALL', { api, command });
                }
                emitEvent('API_CALL_COMPLETED', { api, payload, result: apiResult.data });
                await updateTaskStatus(taskId, 'completed', { action: parsedAction.action, apiResult: apiResult.data, agentResponse });
            } catch (apiCallError) {
                console.error(`Error during API call to ${api}:`, apiCallError.message, apiCallError.response ? apiCallError.response.data : '');
                agentResponse = `There was an error communicating with the ${api.includes('knowledge-engine') ? 'Knowledge Engine' : 'Financial Engine'}. Error: ${apiCallError.message}`;
                emitEvent('API_CALL_FAILED', { api, payload, error: apiCallError.message, details: apiCallError.response ? apiCallError.response.data : 'No response data' });
                await updateTaskStatus(taskId, 'failed', null, `API call failed: ${apiCallError.message}`);
            }

        } else if (parsedAction.action === "GENERAL_INQUIRY") {
            agentResponse = parsedAction.response;
            emitEvent('GENERAL_INQUIRY_RESPONSE', { response: agentResponse, command });
            await updateTaskStatus(taskId, 'completed', { action: parsedAction.action, response: agentResponse });
        } else {
            agentResponse = "I'm not sure how to handle that command. Please ensure it's a valid request for knowledge or financial summary.";
            emitEvent('UNHANDLED_COMMAND', { command, parsedAction });
            await updateTaskStatus(taskId, 'failed', null, `Unhandled command action: ${parsedAction.action}`);
        }

        // Send a result event back to the knowledge engine for ingestion if it's a summary/response.
        // This allows the orchestrator's own responses to be searchable.
        if (agentResponse && agentResponse.length > 0) {
            axios.post('http://knowledge-engine:4000/events', {
                type: 'RESULT',
                payload: { summary: agentResponse },
                source_agent: 'NexusOrchestrator' // Mark that this text originated from the orchestrator's AI.
            }).catch(err => console.error("Failed to send result event to Knowledge Engine for self-ingestion:", err.message));
        }

        res.json({ message: agentResponse });

    } catch (error) {
        console.error(`Overall error processing command "${command}":`, error.message);
        emitEvent('COMMAND_PROCESSING_FAILED', { command, error: error.message });
        await updateTaskStatus(taskId, 'failed', null, `Overall processing failed: ${error.message}`);
        res.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
    }
};

module.exports = {
    setEventEmitter,
    handleFileUpload,
    handleCommand,
};
