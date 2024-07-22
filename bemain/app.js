const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config();
const User = require("./models/user");
const app = express();
app.use(bodyParser.json());
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error", err);
  });

async function askGemini(question) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
  try {
    const response = await axios.post(apiUrl, {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: question,
            },
          ],
        },
      ],
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const responseData = response.data;
    if (!responseData || !responseData.candidates || !responseData.candidates[0]) {
      console.error('Invalid API response');
      return null;
    }
    
    const responseText = responseData.candidates[0].content.parts[0].text;
    
    return responseText;
  } catch (error) {
    console.log(error);
    return null;
  }
}

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

async function processEmails(auth, userId) {
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

 
  const { default: pThrottle } = await import('p-throttle');
  const throttle = pThrottle({
    limit: 1,
    interval: 1000
  });
  const throttledAskGemini = throttle(askGemini);

  
  let allMessagesText = '';

  for (const message of messages) {
    try {
      const msg = await service.users.messages.get({ userId, id: message.id });
      const snippet = msg.data.snippet || 'No snippet available';
      const body = getMessageBody(msg.data);
      const sender = msg.data.payload.headers.find(header => header.name === 'From').value;
      allMessagesText += `From: ${sender}\nSnippet: ${snippet}\nBody: ${body}\n\n`;
    } catch (error) {
      console.error(`Failed to process message ${message.id}:`, error);
    }
  }


  const prompt = `Summarize the following emails:\n\n${allMessagesText}`;
  const summary = await throttledAskGemini(prompt);
  return summary;
}

async function main(email, phoneNumber, credentials) {
    const userId = email.trim();
    const summary = await processEmails(credentials, userId);
    console.log(`Phone Number: ${phoneNumber}\nSummary:\n${summary}`);
  
    await User.updateOne(
      { email: userId },
      { $set: { summary: summary } }
    );
  
    const whatsappApiUrl = `https://graph.facebook.com/v20.0/372210405975987/messages`;
    const whatsappApiKey = process.env.WHATSAPP_BUSINESS_API_KEY;
  
    const message = `Summary: ${summary}`;
    const data = {
      "messaging_product": "whatsapp",
      "to": "916268809504",
      "type": "template",
      "template": {
    "name": "hello_world",
    "language": {
      "code": "en_US"
    }
}
    };
  
    const headers = {
      'Authorization': `Bearer ${whatsappApiKey}`,
      'Content-Type': 'application/json'
    };
  
    axios.post(whatsappApiUrl, data, { headers })
      .then(response => console.log(`Sent message to ${phoneNumber}: ${response.data}`))
      .catch(error => console.error(`Error sending message: ${error}`));
  }
  
  app.post("/", async (req, res) => {
    try {
      const users = await User.find({});
      for (const user of users) {
        const { email, accessToken, refreshToken, expiresAt, phoneNumber } = user;
  
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
  
        await main(email, phoneNumber, credentials);
      }
      res.json({ message: "Email processing started for all users." });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "Failed to process emails" });
    }
  });
  
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });