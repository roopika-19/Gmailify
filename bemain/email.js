const { google } = require('googleapis');
const fetch = require('node-fetch');
const venom = require('venom-bot');

require('dotenv').config();

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const modelName = 'gemini-pro';
const apiKey = process.env.GOOGLE_API_KEY;

const generativeAI = {
    configure: function(apiKey) {
        this.apiKey = apiKey;
    },
    generateContent: async function(prompt) {
        const response = await fetch('https://api.example.com/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({ model: modelName, prompt: prompt })
        });
        const data = await response.json();
        return data.content;
    }
};
generativeAI.configure(apiKey);

function getMessageBody(message) {
    if (message.payload.body.data) {
        return Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else {
        const parts = message.payload.parts || [];
        for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body.data) {
                return Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
        }
    }
    return null;
}

async function processMainAsync(messages, service, userId) {
    const tasks = messages.map(message => worker2(message, service, userId));
    return await Promise.all(tasks);
}



async function worker2(message, service, userId) {
    try {
        const msg = await service.users.messages.get({ userId, id: message.id });
        const snippet = msg.data.snippet || 'No snippet available';
        const body = getMessageBody(msg.data);
        const prompt = `Summarize the following email for a text message with the sender's name:\n\n${snippet}\n\n${body}`;
        const response = await generativeAI.generateContent(prompt);
        return response;
    } catch (error) {
        console.error(`Failed to process message ${message.id}:`, error);
        throw error;
    }
}

async function fetchEmailsForUser(auth, userId) {
    const service = google.gmail({ version: 'v1', auth });
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const formattedYesterday = yesterday.toISOString().split('T')[0].replace(/-/g, '/');

    let response = await service.users.messages.list({ userId, q: `after:${formattedYesterday}` });
    let messages = response.data.messages || [];

    while (response.data.nextPageToken) {
        response = await service.users.messages.list({
            userId,
            q: `after:${formattedYesterday}`,
            pageToken: response.data.nextPageToken
        });
        messages = messages.concat(response.data.messages || []);
    }

    const summaries = await processMainAsync(messages, service, userId);
    return summaries;
}

async function sendMessageWithVenom(phoneNumber, message) {
    try {
        const client = await venom.create();
        await client.sendText(`+91${phoneNumber.replace(/^\+/, '')}`, message);
        console.log(`Message sent to ${phoneNumber}`);
    } catch (error) {
        console.error(`Failed to send message to ${phoneNumber}:`, error);
    }
}

async function main(email, phoneNumber, credentials) {
    const userId = email.trim();
    const summaries = await fetchEmailsForUser(credentials, userId);
    const fullMessage = summaries.join('\n');
    await sendMessageWithVenom(phoneNumber, fullMessage);
}

if (require.main === module) {
    const userData = JSON.parse(process.argv[2]);
    const { email, accessToken, refreshToken, expiresAt, phoneNumber } = userData;

    const credentials = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'https://oauth2.googleapis.com/token'
    );
    credentials.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: new Date(expiresAt).getTime()
    });

    main(email, phoneNumber, credentials).catch(console.error);
}
