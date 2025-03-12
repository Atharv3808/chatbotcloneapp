const express = require('express');
const { createServer } = require('http');
const { Server } = require('ws');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const yahooFinance = require('yahoo-finance2').default;
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config(); // Load environment variables

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Serve static files

const API_KEY = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

// Load Knowledge File
let knowledge = {};
try {
    knowledge = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge.json'), 'utf8'));
} catch (error) {
    console.error("⚠️ Error loading knowledge file:", error);
}

// WebSocket Server
const wss = new Server({ server });

wss.on('connection', (ws) => {
    ws.send('🟢 Connected to WebSocket Server');
});

async function getStockPrice(symbol) {
    try {
        const result = await yahooFinance.quote(symbol);
        return {
            symbol: symbol.toUpperCase(),
            price: `$${result.regularMarketPrice.toFixed(2)}`,
            change: `${result.regularMarketChange?.toFixed(2) || 0}`,
            percentChange: `${(result.regularMarketChangePercent || 0).toFixed(2)}%`
        };
    } catch (error) {
        return { error: 'Stock data unavailable or invalid symbol' };
    }
}

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'No message provided' });

        let foundAnswer = null;
        for (const key in knowledge) {
            if (message.toLowerCase().includes(key.toLowerCase())) {
                foundAnswer = knowledge[key];
                break;
            }
        }

        if (foundAnswer) return res.json({ reply: foundAnswer });

        if (message.toLowerCase().includes("stock price of")) {
            const words = message.split(" ");
            const stockSymbol = words[words.length - 1].toUpperCase();
            const stockData = await getStockPrice(stockSymbol);
            return res.json({ reply: `🚀 ${stockData.symbol}: ${stockData.price} (Change: ${stockData.change}, ${stockData.percentChange}%)` });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const chat = model.startChat({ history: [], generationConfig: { maxOutputTokens: 2048 } });

        const result = await chat.sendMessage(message);
        const response = result.response.text();

        return res.json({ reply: response });

    } catch (error) {
        return res.status(500).json({ error: 'Failed to get response from AI', details: error.message });
    }
});

// Export the Express app (important for Vercel)
module.exports = app;
