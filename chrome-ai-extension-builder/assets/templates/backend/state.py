"""
LangGraph Agent State Definition

Keep state minimal, explicit, and typed.
"""

from typing import Annotated, TypedDict, Optional, Any
from langgraph.graph.message import add_messages


class AgentState(TypedDict, total=False):
    """
    Agent state with message accumulator.

    Fields:
        messages: Conversation history (uses add_messages reducer)
        page_content: Flattened page context string
        page_details: Structured page data (title, url, text, forms)
        current_step: Current processing step for routing
        error_count: Number of errors encountered
        max_steps: Maximum retry attempts
        result: Tool/processing results
        last_error: Most recent error details
    """

    # Message accumulator (automatically merges new messages)
    messages: Annotated[list, add_messages]

    # Page context from extension
    page_content: str
    page_details: dict

    # Flow control
    current_step: str
    error_count: int
    max_steps: int

    # Results
    result: dict[str, Any]
    tool_calls: list
    tool_results: list
    response: str

    # Error tracking
    last_error: Optional[dict[str, Any]]


def create_initial_state() -> AgentState:
    """Create a fresh agent state."""
    return {
        "messages": [],
        "page_content": "",
        "page_details": {},
        "current_step": "start",
        "error_count": 0,
        "max_steps": 3,
    }
