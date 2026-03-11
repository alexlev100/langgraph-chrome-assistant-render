# Local LangGraph Chrome Assistant

## Stack
- Chrome MV3 Side Panel (`extension/`): React + TypeScript + shadcn-style UI + WebSocket/REST client
- Backend (`backend/`): FastAPI + LangGraph orchestration + Groq (`openai/gpt-oss-20b`)

## Setup
1. Backend:
   - `cd backend`
   - `python3 -m venv .venv && source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - `cp ../.env.example .env` and set `GROQ_API_KEY`
   - `uvicorn app.main:app --reload --port 8000`
2. Extension:
   - `cd extension`
   - `npm install`
   - `npm run build`
   - Load `extension/dist` in `chrome://extensions` (Developer mode)

## Tests
- Backend: `cd backend && source .venv/bin/activate && python -m pytest ../tests/backend -q`
- Extension unit: `cd extension && npm test`

## Notes
- Session memory is in-memory by `session_id` and resets when backend restarts.
- Chat history is not persisted across extension restarts.
