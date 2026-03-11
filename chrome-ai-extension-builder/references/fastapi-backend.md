# FastAPI Backend Reference

Complete patterns for building Chrome extension backends with FastAPI.

## Table of Contents

- [Project Setup](#project-setup)
- [CORS Configuration](#cors-configuration)
- [REST Endpoints](#rest-endpoints)
- [WebSocket Streaming](#websocket-streaming)
- [Session Management](#session-management)
- [Error Handling](#error-handling)
- [Production Deployment](#production-deployment)

---

## Project Setup

### Directory Structure

```
backend/
├── main.py              # FastAPI app, routes, middleware
├── agent.py             # LangGraph agent definition
├── state.py             # Agent state TypedDict
├── tools.py             # LLM tool definitions
├── config.py            # Environment configuration
├── requirements.txt
├── Dockerfile
└── .env
```

### requirements.txt

```
# Core
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
python-dotenv>=1.0.0

# AI/LLM
langgraph>=0.0.40
langchain-google-genai>=1.0.0
google-generativeai>=0.8.0
# langchain-anthropic>=0.1.0  # For Claude

# Tools
requests>=2.31.0
httpx>=0.26.0  # Async HTTP client

# Production
redis>=5.0.0  # Session storage
gunicorn>=21.0.0
```

### config.py

```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # API Keys
    google_api_key: str = ""
    anthropic_api_key: str = ""
    exa_api_key: str = ""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # CORS
    allowed_origins: list[str] = [
        "chrome-extension://*",
        "http://localhost:*",
    ]

    # Redis (production)
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

---

## CORS Configuration

### Basic Setup

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings

app = FastAPI(title="AI Extension Backend")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Chrome Extension CORS

```python
# Chrome extensions send Origin: chrome-extension://EXTENSION_ID
# Use wildcard pattern or specific ID

ALLOWED_ORIGINS = [
    "chrome-extension://*",  # All extensions (dev)
    "chrome-extension://abcdefghijklmnop",  # Specific extension (prod)
    "http://localhost:5173",  # Vite dev server
]
```

---

## REST Endpoints

### Chat Endpoint

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

class ChatRequest(BaseModel):
    message: str
    page_content: Optional[str] = None
    page_details: Optional[dict] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str
    tool_calls: Optional[list] = None

@app.post("/chat/{session_id}", response_model=ChatResponse)
async def chat(session_id: str, request: ChatRequest):
    try:
        state = get_session(session_id)

        # Update context
        if request.page_content:
            state["page_content"] = request.page_content
        if request.page_details:
            state["page_details"] = request.page_details

        # Add message
        state["messages"].append({
            "role": "user",
            "content": request.message
        })

        # Run agent
        result = await run_agent(state)
        save_session(session_id, result)

        return ChatResponse(
            response=result["messages"][-1]["content"],
            session_id=session_id,
            tool_calls=result.get("tool_calls"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Page Context Endpoint

```python
class PageContext(BaseModel):
    title: str
    url: str
    text: str
    forms: Optional[list] = None

@app.post("/context/{session_id}")
async def update_context(session_id: str, context: PageContext):
    """Update page context without sending a message."""
    state = get_session(session_id)
    state["page_content"] = f"Page: {context.title}\nURL: {context.url}\n\n{context.text}"
    state["page_details"] = context.model_dump()
    save_session(session_id, state)
    return {"status": "updated"}
```

### Session Management Endpoints

```python
@app.get("/session/{session_id}")
async def get_session_info(session_id: str):
    """Get session state (for debugging/admin)."""
    state = get_session(session_id)
    return {
        "session_id": session_id,
        "message_count": len(state.get("messages", [])),
        "has_context": bool(state.get("page_content")),
    }

@app.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """Clear session state."""
    delete_session(session_id)
    return {"status": "cleared"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

---

## WebSocket Streaming

### Basic WebSocket Handler

```python
from fastapi import WebSocket, WebSocketDisconnect
import json

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()

    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            request = json.loads(data)

            # Get/create session
            state = get_session(session_id)

            # Update context
            if "page_content" in request:
                state["page_content"] = request["page_content"]
            if "page_details" in request:
                state["page_details"] = request["page_details"]

            # Add user message
            state["messages"].append({
                "role": "user",
                "content": request["message"]
            })

            # Send status
            await websocket.send_json({"type": "status", "status": "thinking"})

            # Stream response
            async for chunk in run_agent_streaming(state):
                await websocket.send_json({
                    "type": "token",
                    "content": chunk
                })

            # Send completion
            await websocket.send_json({"type": "done"})

            # Save state
            save_session(session_id, state)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": str(e)
        })
```

### Connection Manager

```python
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = []
        self.active_connections[session_id].append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            self.active_connections[session_id].remove(websocket)

    async def broadcast(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            for connection in self.active_connections[session_id]:
                await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Process and broadcast...
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
```

---

## Session Management

### In-Memory (Development)

```python
from typing import Dict
from state import AgentState

# Simple dict storage
sessions: Dict[str, AgentState] = {}

def get_session(session_id: str) -> AgentState:
    if session_id not in sessions:
        sessions[session_id] = AgentState(messages=[])
    return sessions[session_id]

def save_session(session_id: str, state: AgentState):
    sessions[session_id] = state

def delete_session(session_id: str):
    sessions.pop(session_id, None)
```

### Redis (Production)

```python
import redis
import json
from config import get_settings

settings = get_settings()
redis_client = redis.from_url(settings.redis_url)

SESSION_TTL = 3600 * 24  # 24 hours

def get_session(session_id: str) -> AgentState:
    data = redis_client.get(f"session:{session_id}")
    if data:
        return AgentState(**json.loads(data))
    return AgentState(messages=[])

def save_session(session_id: str, state: AgentState):
    redis_client.setex(
        f"session:{session_id}",
        SESSION_TTL,
        json.dumps(dict(state))
    )

def delete_session(session_id: str):
    redis_client.delete(f"session:{session_id}")
```

---

## Error Handling

### Global Exception Handler

```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_error",
            "message": str(exc) if settings.debug else "An error occurred",
        }
    )

class APIError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code

@app.exception_handler(APIError)
async def api_error_handler(request: Request, exc: APIError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "message": exc.message}
    )
```

### LLM Error Handling

```python
from google.api_core.exceptions import ResourceExhausted, InvalidArgument

async def run_agent_with_retry(state: AgentState, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            return await run_agent(state)
        except ResourceExhausted:
            if attempt == max_retries - 1:
                raise APIError("rate_limited", "API rate limit exceeded", 429)
            await asyncio.sleep(2 ** attempt)
        except InvalidArgument as e:
            raise APIError("invalid_request", str(e), 400)
```

---

## Production Deployment

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Run with gunicorn + uvicorn workers
CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### Environment Variables

```bash
# .env.production
GOOGLE_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
EXA_API_KEY=your-key
REDIS_URL=redis://redis:6379
DEBUG=false
```

### Running in Production

```bash
# With Docker
docker-compose up -d

# Without Docker (with gunicorn)
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000

# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
