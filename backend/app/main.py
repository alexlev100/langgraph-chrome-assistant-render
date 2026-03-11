from __future__ import annotations

import time
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.agent import complete_once, stream_completion
from app.config import get_settings
from app.llm import GroqLLMClient, LLMClient
from app.logging_config import setup_logging
from app.models import ChatRequest, ChatResponse, WsChatRequest
from app.session_store import SessionStore
from app.state import AgentState

load_dotenv()


class AppContext:
    def __init__(self, llm_client: LLMClient, store: SessionStore):
        self.llm_client = llm_client
        self.store = store


def create_app(llm_client: LLMClient | None = None) -> FastAPI:
    settings = get_settings()
    logger = setup_logging(settings.log_level)

    app = FastAPI(title="Local LangGraph Chrome Assistant", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin for origin in settings.allowed_origins_list() if not origin.startswith("chrome-extension://")],
        allow_origin_regex=r"^chrome-extension://.*$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.ctx = AppContext(
        llm_client=llm_client or GroqLLMClient(api_key=settings.groq_api_key, model=settings.groq_model),
        store=SessionStore(),
    )
    app.state.logger = logger

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "healthy"}

    @app.post("/chat/{session_id}", response_model=ChatResponse)
    def chat(session_id: str, request: ChatRequest) -> ChatResponse:
        request_id = str(uuid.uuid4())
        started_at = time.perf_counter()

        store: SessionStore = app.state.ctx.store
        state = store.get_or_create(session_id)
        _ingest_request_into_state(state, request)

        try:
            next_state, content, meta = complete_once(state, app.state.ctx.llm_client)
            latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
            meta["latency_ms"] = latency_ms
            store.save(session_id, next_state)

            app.state.logger.info(
                "chat_completed",
                extra={
                    "request_id": request_id,
                    "session_id": session_id,
                    "tab_url": _safe_url_from_state(next_state),
                    "stage": "done",
                    "latency_ms": latency_ms,
                    "token_count": meta.get("token_count"),
                },
            )
            return ChatResponse(response=content, session_id=session_id, meta=meta)
        except Exception as exc:
            app.state.logger.exception(
                "chat_failed",
                extra={
                    "request_id": request_id,
                    "session_id": session_id,
                    "tab_url": _safe_url_from_state(state),
                    "stage": "error",
                    "error_type": type(exc).__name__,
                },
            )
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.websocket("/ws/{session_id}")
    async def ws_chat(websocket: WebSocket, session_id: str) -> None:
        await websocket.accept()

        store: SessionStore = app.state.ctx.store

        try:
            while True:
                payload = WsChatRequest.model_validate(await websocket.receive_json())
                started_at = time.perf_counter()
                state = store.get_or_create(session_id)
                _ingest_request_into_state(state, payload)

                stages_sent: list[str] = []

                await websocket.send_json({"type": "status", "stage": "receiving_context"})

                try:
                    prepared, token_stream = stream_completion(state, app.state.ctx.llm_client)

                    for stage in ["planning", "tooling", "drafting", "streaming"]:
                        if stage in stages_sent:
                            continue
                        if stage == "tooling" and not prepared.get("tool_output"):
                            continue
                        await websocket.send_json({"type": "status", "stage": stage})
                        stages_sent.append(stage)

                    full_response = ""
                    token_count = 0
                    for token in token_stream:
                        full_response += token
                        token_count += 1
                        await websocket.send_json({"type": "token", "content": token})

                    prepared_messages = list(prepared.get("messages", []))
                    prepared_messages.append({"role": "assistant", "content": full_response})
                    prepared["messages"] = prepared_messages
                    prepared["current_step"] = "done"
                    store.save(session_id, prepared)

                    latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
                    await websocket.send_json(
                        {
                            "type": "done",
                            "meta": {
                                "latency_ms": latency_ms,
                                "tokens": token_count,
                            },
                        }
                    )

                    app.state.logger.info(
                        "ws_chat_completed",
                        extra={
                            "session_id": session_id,
                            "tab_url": _safe_url_from_state(prepared),
                            "stage": "done",
                            "latency_ms": latency_ms,
                            "token_count": token_count,
                        },
                    )
                except Exception as exc:
                    await websocket.send_json({"type": "status", "stage": "error"})
                    await websocket.send_json({"type": "error", "message": str(exc)})
                    app.state.logger.exception(
                        "ws_chat_failed",
                        extra={
                            "session_id": session_id,
                            "tab_url": _safe_url_from_state(state),
                            "stage": "error",
                            "error_type": type(exc).__name__,
                        },
                    )
        except WebSocketDisconnect:
            return

    @app.delete("/session/{session_id}")
    def clear_session(session_id: str) -> dict[str, bool]:
        return {"cleared": app.state.ctx.store.clear(session_id)}

    @app.get("/session/{session_id}")
    def session_debug(session_id: str) -> dict[str, object]:
        state = app.state.ctx.store.get_or_create(session_id)
        return {
            "session_id": session_id,
            "message_count": len(state.get("messages", [])),
            "stage": state.get("current_step"),
            "has_context": bool(state.get("page_content") or state.get("page_details")),
        }

    return app


def _ingest_request_into_state(state: AgentState, request: ChatRequest | WsChatRequest) -> None:
    if request.page_content is not None:
        state["page_content"] = request.page_content
    if request.page_details is not None:
        state["page_details"] = request.page_details

    messages = list(state.get("messages", []))
    messages.append({"role": "user", "content": request.message})
    state["messages"] = messages


def _safe_url_from_state(state: AgentState) -> str:
    details = state.get("page_details") or {}
    return str(details.get("url") or "")


app = create_app()
