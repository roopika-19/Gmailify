const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();
const User = require("./models/user");

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = "http://localhost:3000/auth/callback/google";

const app = express();
app.use(bodyParser.json());
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error", err);
  });

app.post("/auth/google/callback", async (req, res) => {
  const code = req.body.code;

  const body = new URLSearchParams({
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.log("Error data:", errorData);
      throw new Error('Network response was not ok: ' + errorData.error_description);
    }

    const data = await response.json();
    console.log("Success:", data);

    const parts = data.id_token.split('.');
    const encodedPayload = parts[1];
    const decodedPayload = Buffer.from(encodedPayload, 'base64').toString('utf-8');
    const { email } = JSON.parse(decodedPayload);
    const expiresAt = new Date().getTime() + (data.expires_in * 1000);

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      existingUser.accessToken = data.access_token;
      existingUser.refreshToken = data.refresh_token;
      existingUser.expiresAt = new Date(expiresAt);
      await existingUser.save();
      res.json({ message: "Authorized successfully!", id: existingUser._id });
    } else {
      const newUser = new User({
        email: email,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(expiresAt),
      });
      await newUser.save();
      res.json({ message: "User created successfully!", id: newUser._id });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to authorize" });
  }
});

app.post("/user/update-phone", async (req, res) => {
  const { userId, phoneNumber } = req.body;
  console.log(userId);

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.phoneNumber = phoneNumber;
    await user.save();

    res.json({ message: "Phone number updated successfully!" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to update phone number" });
  }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
