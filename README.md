# QR Session App

A real-time web app where an iPad displays a QR code, a phone scans it and streams camera frames every 30 seconds, and Claude reads any text in those frames and answers it — displayed live on the iPad.

---

## Quick Start (Local)

### 1. Get an Anthropic API Key
- Go to https://console.anthropic.com
- Sign in or create a free account
- Click **API Keys** → **Create Key**
- Copy the key (starts with `sk-ant-...`)

### 2. Install and run
```bash
# Clone or download this folder, then:
npm install

# Copy the example env file
cp .env.example .env

# Edit .env and paste your API key:
# ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE

npm start
```

Open http://localhost:3000 on your iPad (or any browser).

> **Note:** For local testing across devices, your phone and iPad must be on the same Wi-Fi network. Use your computer's local IP instead of `localhost`, e.g. `http://192.168.1.42:3000`.

---

## Deploy to Railway (Free, 5 minutes)

Railway gives you a public HTTPS URL so any phone can connect from anywhere.

### Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/qr-session.git
   git push -u origin main
   ```

2. **Create Railway project**
   - Go to https://railway.app and sign in with GitHub
   - Click **New Project** → **Deploy from GitHub repo**
   - Select your repository

3. **Add environment variable**
   - In your Railway project, click **Variables**
   - Add: `ANTHROPIC_API_KEY` = `sk-ant-YOUR_KEY_HERE`

4. **Deploy**
   - Railway auto-deploys. Wait ~60 seconds.
   - Click **Settings** → **Domains** → **Generate Domain**
   - Your app is live at `https://yourapp.up.railway.app`

5. **Use it**
   - Open the Railway URL on your iPad → QR code appears
   - Scan with your phone → camera starts
   - Point phone at any text → response appears on iPad every 30 seconds

---

## How it works

```
iPad (host.html)          Server (server.js)         Phone (join.html)
      |                         |                           |
      |-- create-session ------>|                           |
      |<- session-created ------|  (QR code generated)      |
      |                         |                           |
      |                         |<-- join-session ----------|
      |<- phone-connected ------|-- joined ---------------->|
      |                         |                           |
      |                         |<-- frame (base64 img) ----|  every 30s
      |                         |                           |
      |                         |-- Claude API call         |
      |                         |   (vision + text prompt)  |
      |<- llm-response ---------|                           |
```

---

## Customising the prompt

In `server.js`, find the `text` field in the Claude API call and edit it:

```javascript
text: `Look at this image carefully. Extract all text, then respond to it as a prompt.
...`
```

You can make Claude respond in a specific language, format, or style.

---

## File structure

```
qr-session/
├── server.js          # Express + Socket.io + Claude API
├── package.json
├── .env.example       # Copy to .env and add your API key
└── public/
    ├── index.html     # Redirects to host.html
    ├── host.html      # iPad screen (QR code + response display)
    └── join.html      # Phone screen (camera + capture)
```
