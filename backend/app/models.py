from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Stage = Literal[
    "receiving_context",
    "planning",
    "tooling",
    "drafting",
    "streaming",
    "done",
    "error",
]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    page_content: Optional[str] = None
    page_details: Optional[dict[str, Any]] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    meta: dict[str, Any]


class WsChatRequest(BaseModel):
    message: str = Field(min_length=1)
    page_content: Optional[str] = None
    page_details: Optional[dict[str, Any]] = None
