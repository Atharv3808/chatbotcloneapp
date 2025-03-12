require('dotenv').config();
const express = require('express');
const fs = require('fs'); // File system to read knowledge file
const { GoogleGenerativeAI } = require('@google/generative-ai');
const yahooFinance = require('yahoo-finance2').default; // Yahoo Finance API

const app = express();
const port = process.env.PORT || 3000;

// Load API key from environment variables
const API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyAwDsihffOVlRjO3lTry7DsybcGa2-z9zY'; // Fallback to hardcoded key for testing
if (API_KEY === 'AIzaSyAwDsihffOVlRjO3lTry7DsybcGa2-z9zY') {
    console.warn("⚠️ Using hardcoded API key for testing. Please set a valid API key in the .env file.");
}
console.log(`API Key Loaded: ${API_KEY}`); // For debugging purposes
console.log(`Current Working Directory: ${process.cwd()}`); // Log current working directory for debugging
console.log(`Environment Variables Loaded:`, process.env); // Log all environment variables for debugging

const genAI = new GoogleGenerativeAI(API_KEY);

app.use(express.json());
app.use(express.static('public'));

// Load Knowledge File
let knowledge = {};
try {
    knowledge = JSON.parse(fs.readFileSync('./server/knowledge.json', 'utf8'));
    console.log("📖 Knowledge file loaded successfully");
} catch (error) {
    console.error("⚠️ Error loading knowledge file:", error);
}

// Function to get real-time stock price from Yahoo Finance
async function getStockPrice(symbol) {
    try {
        console.log(`📦 Fetching stock data for: ${symbol}`);
        const result = await yahooFinance.quote(symbol);

        if (!result || !result.regularMarketPrice) {
            throw new Error('Invalid stock data received');
        }

        return {
            symbol: symbol.toUpperCase(),
            price: `$${result.regularMarketPrice.toFixed(2)}`,
            change: `${result.regularMarketChange?.toFixed(2) || 0}`,
            percentChange: `${(result.regularMarketChangePercent || 0).toFixed(2)}%`,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('❌ Stock Price Error:', error);
        return { error: 'Stock data unavailable or invalid symbol' };
    }
}

// Chat API Route
app.post('/api/chat', async (req, res) => {
    try {
        console.log('💬 Received message:', req.body.message);

        if (!req.body.message) {
            return res.status(400).json({ error: 'No message provided' });
        }

        const userMessage = req.body.message.toLowerCase().trim();

        // Check if question exists in knowledge file
        let foundAnswer = null;
        for (const key in knowledge) {
            const keyWords = key.toLowerCase().split(" ");
            if (keyWords.every(word => userMessage.includes(word))) {
                foundAnswer = knowledge[key];
                break;
            }
        }

        if (foundAnswer) {
            console.log(`📚 Found answer in knowledge file: ${foundAnswer}`);
            return res.json({ reply: foundAnswer });
        }

        // Check if user is asking for stock price
        if (userMessage.includes("stock price of")) {
            const words = userMessage.split(" ");
            const stockSymbol = words[words.length - 1].toUpperCase();

            const stockData = await getStockPrice(stockSymbol);

            if (stockData.error) {
                console.error(`Stock Price Error: ${stockData.error}`);
                return res.status(400).json({ reply: `⚠️ ${stockData.error}` });
            }

            return res.json({ 
                reply: `🚀 ${stockData.symbol}: ${stockData.price} (Change: ${stockData.change}, ${stockData.percentChange}%)`
            });
        }

        // If no match in knowledge file, use Gemini AI
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

        console.log('🚀 Gemini AI initialized');

        const chat = model.startChat({
            history: [],
            generationConfig: { maxOutputTokens: 2048 },
        });

        const result = await chat.sendMessage(req.body.message);
        const response = result.response.text();

        console.log('💡 AI Response:', response);
        res.json({ reply: response });

    } catch (error) {
        console.error('❌ Chat Error:', error);
        res.status(500).json({ 
            error: 'Failed to get response from AI',
            details: error.message || 'An unexpected error occurred' 
        });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
