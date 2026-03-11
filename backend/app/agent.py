from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.state import AgentState
from app.tools import summarize_forms

TOOLING_KEYWORDS = ("form", "forms", "field", "fields", "extract")


def build_page_context_summary(page_details: dict[str, Any]) -> str:
    title = page_details.get("title") or ""
    url = page_details.get("url") or ""
    text = page_details.get("text") or ""
    forms = page_details.get("forms") or []

    summary = [f"Title: {title}", f"URL: {url}", "", text[:4000], "", f"Forms: {len(forms)}"]
    return "\n".join(summary).strip()


def should_use_tooling(message: str) -> bool:
    lowered = message.lower()
    return any(keyword in lowered for keyword in TOOLING_KEYWORDS)


def ingest_context_node(state: AgentState) -> AgentState:
    details = state.get("page_details", {})
    page_content = state.get("page_content") or ""
    context_summary = page_content.strip() or build_page_context_summary(details)
    return {
        "context_summary": context_summary,
        "current_step": "receiving_context",
    }


def reason_node(state: AgentState) -> AgentState:
    messages = state.get("messages", [])
    user_message = messages[-1]["content"] if messages else ""
    return {
        "should_use_tooling": should_use_tooling(user_message),
        "current_step": "planning",
    }


def tooling_node(state: AgentState) -> AgentState:
    details = state.get("page_details", {})
    return {
        "tool_output": summarize_forms(details),
        "current_step": "tooling",
    }


def respond_node(state: AgentState) -> AgentState:
    system_prompt = (
        "You are a browser assistant in a Chrome side panel. "
        "Always answer in Russian. "
        "Respond in clean Markdown with short sections, bold headers, and readable spacing. "
        "Use page context when relevant. If information is missing, state that clearly."
    )
    context_summary = state.get("context_summary", "")
    tool_output = state.get("tool_output", "")

    llm_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    if context_summary:
        llm_messages.append(
            {
                "role": "system",
                "content": f"Current page context:\n{context_summary}",
            }
        )

    if tool_output:
        llm_messages.append(
            {
                "role": "system",
                "content": f"Tool output:\n{tool_output}",
            }
        )

    for message in state.get("messages", []):
        llm_messages.append({"role": message["role"], "content": message["content"]})

    return {
        "llm_messages": llm_messages,
        "current_step": "drafting",
    }


def error_handler_node(state: AgentState) -> AgentState:
    return {"current_step": "error"}


def _route_after_reason(state: AgentState) -> str:
    if state.get("current_step") == "error":
        return "error_handler"
    if state.get("should_use_tooling"):
        return "tooling"
    return "respond"


def create_agent_graph():
    graph_builder = StateGraph(AgentState)
    graph_builder.add_node("ingest_context", ingest_context_node)
    graph_builder.add_node("reason", reason_node)
    graph_builder.add_node("tooling", tooling_node)
    graph_builder.add_node("respond", respond_node)
    graph_builder.add_node("error_handler", error_handler_node)

    graph_builder.add_edge(START, "ingest_context")
    graph_builder.add_edge("ingest_context", "reason")
    graph_builder.add_conditional_edges(
        "reason",
        _route_after_reason,
        {
            "tooling": "tooling",
            "respond": "respond",
            "error_handler": "error_handler",
        },
    )
    graph_builder.add_edge("tooling", "respond")
    graph_builder.add_edge("respond", END)
    graph_builder.add_edge("error_handler", END)

    return graph_builder.compile()


def prepare_state(
    state: AgentState,
    on_stage: Callable[[str], None] | None = None,
) -> AgentState:
    graph = create_agent_graph()
    next_state = dict(state)

    for update in graph.stream(state, stream_mode="updates"):
        for _node_name, node_update in update.items():
            next_state.update(node_update)
            stage = node_update.get("current_step")
            if on_stage and stage:
                on_stage(stage)

    if "llm_messages" not in next_state:
        raise RuntimeError("Agent preparation failed before drafting stage")

    return next_state


def complete_once(state: AgentState, llm_client: Any) -> tuple[AgentState, str, dict[str, Any]]:
    prepared = prepare_state(state)
    completion = llm_client.complete(prepared["llm_messages"])

    content = str(completion.get("content", ""))
    token_count = completion.get("token_count")

    prepared_messages = list(prepared.get("messages", []))
    prepared_messages.append({"role": "assistant", "content": content})
    prepared["messages"] = prepared_messages
    prepared["current_step"] = "done"

    meta = {
        "token_count": token_count,
        "stage": "done",
    }

    return prepared, content, meta


def stream_completion(
    state: AgentState,
    llm_client: Any,
    on_stage: Callable[[str], None] | None = None,
) -> tuple[AgentState, Iterator[str]]:
    prepared = prepare_state(state, on_stage=on_stage)

    if on_stage:
        on_stage("streaming")

    def _token_gen() -> Iterator[str]:
        for token in llm_client.stream(prepared["llm_messages"]):
            yield token

    return prepared, _token_gen()
