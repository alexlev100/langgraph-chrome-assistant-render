"""
FastAPI Backend for Chrome AI Extension

Run: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import os
from dotenv import load_dotenv

from agent import create_agent, run_agent, run_agent_streaming
from state import AgentState

load_dotenv()

app = FastAPI(title="Chrome AI Extension Backend")

# CORS for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "http://localhost:*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session storage (use Redis in production)
sessions: dict[str, AgentState] = {}


def get_session(session_id: str) -> AgentState:
    """Get or create session state."""
    if session_id not in sessions:
        sessions[session_id] = {"messages": [], "page_content": "", "page_details": {}}
    return sessions[session_id]


def save_session(session_id: str, state: AgentState) -> None:
    """Save session state."""
    sessions[session_id] = state


# Request/Response Models
class ChatRequest(BaseModel):
    message: str
    page_content: Optional[str] = None
    page_details: Optional[dict] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    tool_calls: Optional[list] = None


class PageContext(BaseModel):
    title: str
    url: str
    text: str
    forms: Optional[list] = None


# REST Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "0.1.0"}


@app.post("/chat/{session_id}", response_model=ChatResponse)
async def chat(session_id: str, request: ChatRequest):
    """Process chat message and return response."""
    try:
        state = get_session(session_id)

        # Update page context
        if request.page_content:
            state["page_content"] = request.page_content
        if request.page_details:
            state["page_details"] = request.page_details

        # Add user message
        state["messages"].append({"role": "user", "content": request.message})

        # Run agent
        result = await run_agent(state)
        save_session(session_id, result)

        # Extract response
        assistant_msg = result["messages"][-1]
        response_text = (
            assistant_msg.content
            if hasattr(assistant_msg, "content")
            else assistant_msg.get("content", "")
        )

        return ChatResponse(
            response=response_text,
            session_id=session_id,
            tool_calls=result.get("tool_calls"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/context/{session_id}")
async def update_context(session_id: str, context: PageContext):
    """Update page context without sending a message."""
    state = get_session(session_id)
    state["page_content"] = f"Page: {context.title}\nURL: {context.url}\n\n{context.text}"
    state["page_details"] = context.model_dump()
    save_session(session_id, state)
    return {"status": "updated"}


@app.get("/session/{session_id}")
async def get_session_info(session_id: str):
    """Get session info (for debugging)."""
    state = get_session(session_id)
    return {
        "session_id": session_id,
        "message_count": len(state.get("messages", [])),
        "has_context": bool(state.get("page_content")),
    }


@app.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """Clear session state."""
    if session_id in sessions:
        del sessions[session_id]
    return {"status": "cleared"}


# WebSocket Endpoint
@app.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for streaming chat responses."""
    await websocket.accept()

    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            request = json.loads(data)

            # Get session state
            state = get_session(session_id)

            # Update context
            if "page_content" in request:
                state["page_content"] = request["page_content"]
            if "page_details" in request:
                state["page_details"] = request["page_details"]

            # Add user message
            state["messages"].append({"role": "user", "content": request["message"]})

            # Send thinking status
            await websocket.send_json({"type": "status", "status": "thinking"})

            # Stream response tokens
            full_response = ""
            async for token in run_agent_streaming(state):
                full_response += token
                await websocket.send_json({"type": "token", "content": token})

            # Add assistant message to state
            state["messages"].append({"role": "assistant", "content": full_response})
            save_session(session_id, state)

            # Send done
            await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
