# B-READY 2026 Methodology Chatbot

A web-based chatbot that answers questions about the World Bank's Business Ready (B-READY) methodology using the Methodology Handbook 2026 Edition.

[![B-READY Chatbot](https://img.shields.io/badge/B--READY-2026%20Methodology%20Assistant-002244)](https://www.worldbank.org/en/businessready)

## Features

- 💬 **Conversational Interface**: Ask questions in natural language
- 📚 **Comprehensive Knowledge**: Trained on the full B-READY 2026 Methodology Handbook
- 🔍 **Smart Search**: Automatically finds relevant handbook sections
- 📱 **Responsive Design**: Works on desktop and mobile
- ⚡ **Fast Responses**: Powered by Claude AI

## Quick Deploy to Netlify

### Option 1: Deploy via GitHub

1. Push this repository to your GitHub account
2. Go to [app.netlify.com](https://app.netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect to your GitHub and select this repository
5. After deployment, go to **Site Settings** → **Environment Variables**
6. Add your API key:
   - **Key**: `ANTHROPIC_API_KEY`
   - **Value**: Your Claude API key from [console.anthropic.com](https://console.anthropic.com)
7. Trigger a redeploy (Deploys → Trigger deploy)

### Option 2: Manual Deploy via Netlify Dashboard

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click "Add new site" → "Deploy manually"
3. Drag and drop this entire folder
4. Go to **Site Settings** → **Environment Variables**
5. Add `ANTHROPIC_API_KEY` with your Claude API key
6. Trigger a redeploy

### Option 3: Deploy via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Navigate to project folder and deploy
cd b-ready-2026-chatbot
netlify deploy --prod

# Set environment variable
netlify env:set ANTHROPIC_API_KEY your_api_key_here
```

## Project Structure

```
b-ready-2026-chatbot/
├── index.html                    # Main chat interface
├── netlify.toml                  # Netlify configuration
├── package.json                  # Dependencies
├── netlify/
│   └── functions/
│       └── chat.js              # Serverless function (calls Claude API)
├── data/
│   ├── handbook-chunks.json     # Processed handbook content (1039 chunks)
│   └── search-index.json        # Search index for quick lookup
└── README.md
```

## How It Works

1. **User asks a question** in the chat interface
2. **Keyword search** finds relevant sections from the handbook
3. **Claude API** generates an answer using the relevant context
4. **Response** is displayed in the chat with proper formatting

## Getting Your Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Navigate to "API Keys"
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-`)

**Important**: Keep your API key secret. Never commit it to version control.

## Customization

### Changing the Appearance

Edit the CSS in `index.html` to match your branding. Key variables:

```css
:root {
    --wb-blue: #002244;        /* Primary color */
    --wb-gold: #F4A100;        /* Accent color */
    --bg-light: #f8f9fa;       /* Background */
}
```

### Adjusting the AI Behavior

Modify the `systemPrompt` in `netlify/functions/chat.js` to change how Claude responds.

### Updating the Handbook

To update with a new version of the handbook:

1. Use the `chunk_handbook.py` script to process the new PDF
2. Replace the JSON files in the `data/` folder
3. Redeploy

```bash
python chunk_handbook.py new_handbook.pdf ./data
```

## Estimated Costs

- **Netlify**: Free tier includes 125K function requests/month
- **Claude API**: ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens
- **Typical query**: ~$0.01-0.03 per question

## Troubleshooting

**"API key not configured"**: Make sure `ANTHROPIC_API_KEY` is set in Netlify environment variables and you've redeployed.

**"Failed to process request"**: Check the function logs in Netlify dashboard (Functions → chat → Recent invocations).

**Slow responses**: The first request after inactivity may be slow due to cold starts. Subsequent requests are faster.

## Support

For questions about:

- **B-READY Methodology**: [worldbank.org/b-ready](https://www.worldbank.org/en/businessready)
- **This Chatbot**: Open an issue on GitHub
- **Claude API**: [docs.anthropic.com](https://docs.anthropic.com)

## License

This chatbot is provided for educational and informational purposes. The B-READY Methodology Handbook content is © World Bank Group.

---

Built with ❤️ for the B-READY team
