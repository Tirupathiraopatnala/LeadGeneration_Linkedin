# LeadGen AI — LinkedIn Lead Generation Pipeline

A full-stack application that replicates your n8n workflow:
searches LinkedIn posts by keyword → screens comments with AI → enriches profiles → deep qualifies leads.

## Prerequisites
- Node.js v18+
- npm v8+

## Setup

### 1. Backend

```bash
cd backend
npm install

# Copy env file and fill in your Azure OpenAI credentials
cp .env.example .env
```

Edit `backend/.env`:
```
AZURE_OPENAI_KEY=your_actual_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_API_VERSION=2024-02-01
PORT=3001
```

Start the backend:
```bash
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:5173**



