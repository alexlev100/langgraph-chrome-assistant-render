from typing import Any, Literal, TypedDict


class AgentState(TypedDict, total=False):
    messages: list[dict[str, str]]

    page_content: str
    page_details: dict[str, Any]
    context_summary: str

    current_step: Literal[
        "receiving_context",
        "planning",
        "tooling",
        "drafting",
        "streaming",
        "done",
        "error",
    ]
    should_use_tooling: bool
    tool_output: str
    llm_messages: list[dict[str, str]]

    last_error: dict[str, Any]


def create_initial_state() -> AgentState:
    return {
        "messages": [],
        "page_content": "",
        "page_details": {},
        "current_step": "receiving_context",
    }
