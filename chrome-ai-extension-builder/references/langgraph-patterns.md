# LangGraph Patterns Reference

Production patterns for building AI agents with LangGraph.

## Table of Contents

- [State Design](#state-design)
- [Graph Construction](#graph-construction)
- [Conditional Routing](#conditional-routing)
- [Tool Integration](#tool-integration)
- [Error Handling & Resilience](#error-handling--resilience)
- [Streaming](#streaming)
- [Memory & Persistence](#memory--persistence)
- [Multi-Agent Patterns](#multi-agent-patterns)
- [Testing](#testing)

---

## State Design

### Minimal Typed State

```python
from typing import Annotated, TypedDict, Optional, Any
from langgraph.graph.message import add_messages

class AgentState(TypedDict, total=False):
    """Keep state minimal, explicit, and typed."""
    # Message accumulator (uses reducer)
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
    last_error: Optional[dict[str, Any]]
```

### State Validation

```python
from pydantic import BaseModel, ValidationError

class ResultModel(BaseModel):
    intent: str
    confidence: float

def validate_result_node(state: AgentState) -> dict:
    """Validate state at boundaries."""
    try:
        ResultModel(**state.get("result", {}))
        return {"current_step": "validated"}
    except ValidationError as e:
        return {
            "current_step": "error",
            "last_error": {"type": "validation", "detail": str(e)}
        }
```

### Immutability Pattern

```python
def process_node(state: AgentState) -> dict:
    """Return partial updates, never mutate input."""
    user_msg = state["messages"][-1]["content"]
    intent = classify_intent(user_msg)

    # Return only changed fields
    return {
        "current_step": "classified",
        "result": {"intent": intent}
    }
```

---

## Graph Construction

### Basic Graph Structure

```python
from langgraph.graph import StateGraph, END

def create_agent():
    builder = StateGraph(AgentState)

    # Add nodes
    builder.add_node("process", process_node)
    builder.add_node("tools", tools_node)
    builder.add_node("respond", respond_node)
    builder.add_node("error_handler", error_handler_node)

    # Set entry point
    builder.set_entry_point("process")

    # Add edges
    builder.add_conditional_edges("process", route_after_process)
    builder.add_edge("tools", "respond")
    builder.add_edge("respond", END)
    builder.add_edge("error_handler", "respond")

    return builder.compile()
```

### Node Functions

```python
from langchain_google_genai import ChatGoogleGenerativeAI

llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")

def process_node(state: AgentState) -> dict:
    """Main processing node."""
    messages = state.get("messages", [])
    page_content = state.get("page_content", "")

    # Build context-aware system message
    system_msg = f"""You are a helpful assistant.
Current page context:
{page_content[:3000]}"""

    response = llm.invoke([
        {"role": "system", "content": system_msg},
        *messages
    ])

    # Check for tool calls
    if hasattr(response, 'tool_calls') and response.tool_calls:
        return {
            "current_step": "tools",
            "tool_calls": response.tool_calls
        }

    return {
        "current_step": "respond",
        "response": response.content
    }

def respond_node(state: AgentState) -> dict:
    """Format final response."""
    response = state.get("response", "I couldn't process that.")
    return {
        "messages": [{"role": "assistant", "content": response}]
    }
```

---

## Conditional Routing

### Simple Router

```python
def route_after_process(state: AgentState) -> str:
    """Route based on current_step."""
    step = state.get("current_step", "respond")

    if step == "error":
        return "error_handler"
    elif step == "tools":
        return "tools"
    else:
        return "respond"

builder.add_conditional_edges(
    "process",
    route_after_process,
    {
        "error_handler": "error_handler",
        "tools": "tools",
        "respond": "respond",
    }
)
```

### Intent-Based Routing

```python
SPECIALISTS = {
    "search": "search_agent",
    "summarize": "summarize_agent",
    "chat": "chat_agent",
}

def classify_and_route(state: AgentState) -> str:
    """Classify intent and route to specialist."""
    user_msg = state["messages"][-1]["content"]

    # Simple keyword-based (replace with LLM classification)
    if "search" in user_msg.lower() or "find" in user_msg.lower():
        return "search_agent"
    elif "summarize" in user_msg.lower():
        return "summarize_agent"
    return "chat_agent"

# Add specialist nodes
for name in SPECIALISTS.values():
    builder.add_node(name, create_specialist_node(name))

builder.add_conditional_edges(
    "supervisor",
    classify_and_route,
    SPECIALISTS
)
```

### Cycle Control

```python
def should_continue(state: AgentState) -> str:
    """Bound cycles with hard stops."""
    error_count = state.get("error_count", 0)
    max_steps = state.get("max_steps", 3)

    if error_count >= max_steps:
        return "halt"
    return "retry"

builder.add_node("halt", lambda s: {
    "current_step": "halted",
    "response": "I encountered too many errors. Please try again."
})

builder.add_conditional_edges(
    "error_handler",
    should_continue,
    {"halt": "halt", "retry": "process"}
)
```

---

## Tool Integration

### Defining Tools

```python
from langchain_core.tools import tool
import requests

@tool
def web_search(query: str) -> str:
    """Search the web for information."""
    response = requests.post(
        "https://api.exa.ai/search",
        headers={"Authorization": f"Bearer {EXA_API_KEY}"},
        json={"query": query, "num_results": 5}
    )
    results = response.json()
    return "\n".join([r["text"] for r in results["results"]])

@tool
def get_page_info(state: AgentState) -> str:
    """Get information about the current page."""
    return state.get("page_content", "No page context available.")

tools = [web_search, get_page_info]
```

### Tool Execution Node

```python
def tools_node(state: AgentState) -> dict:
    """Execute tool calls."""
    tool_calls = state.get("tool_calls", [])
    tool_results = []

    for call in tool_calls:
        tool_name = call["name"]
        tool_args = call["args"]

        # Find and execute tool
        for tool in tools:
            if tool.name == tool_name:
                try:
                    result = tool.invoke(tool_args)
                    tool_results.append({
                        "tool": tool_name,
                        "result": result
                    })
                except Exception as e:
                    tool_results.append({
                        "tool": tool_name,
                        "error": str(e)
                    })
                break

    return {
        "tool_results": tool_results,
        "current_step": "respond"
    }
```

### Binding Tools to LLM

```python
from langchain_google_genai import ChatGoogleGenerativeAI

llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")
llm_with_tools = llm.bind_tools(tools)

def process_with_tools(state: AgentState) -> dict:
    messages = state.get("messages", [])
    response = llm_with_tools.invoke(messages)

    if response.tool_calls:
        return {
            "current_step": "tools",
            "tool_calls": response.tool_calls
        }

    return {
        "current_step": "respond",
        "response": response.content
    }
```

---

## Error Handling & Resilience

### Multi-Level Error Handling

```python
MAX_RETRIES = 2

def risky_node(state: AgentState) -> dict:
    """Node with error handling."""
    try:
        # Risky operation
        result = call_external_api()
        return {"result": result, "current_step": "next"}

    except Exception as e:
        return {
            "current_step": "error",
            "last_error": {
                "type": type(e).__name__,
                "detail": str(e)
            },
            "error_count": state.get("error_count", 0) + 1
        }

def error_handler_node(state: AgentState) -> dict:
    """Central error handler."""
    error = state.get("last_error", {})
    error_count = state.get("error_count", 0)

    if error_count > MAX_RETRIES:
        return {
            "response": f"I encountered an error: {error.get('detail', 'Unknown')}",
            "current_step": "respond"
        }

    # Retry with backoff
    return {"current_step": "retry"}
```

### Graceful Degradation

```python
def process_with_fallback(state: AgentState) -> dict:
    """Try primary, fall back to simpler approach."""
    try:
        # Try advanced model
        response = advanced_llm.invoke(state["messages"])
        return {"response": response.content}

    except Exception:
        try:
            # Fall back to simpler model
            response = simple_llm.invoke(state["messages"])
            return {"response": response.content}

        except Exception:
            # Final fallback
            return {
                "response": "I'm having trouble processing. Please try again.",
                "current_step": "respond"
            }
```

---

## Streaming

### Token Streaming

```python
async def run_agent_streaming(state: AgentState):
    """Stream tokens for real-time UI updates."""
    agent = create_agent()

    async for event in agent.astream(state, stream_mode="messages"):
        if hasattr(event, 'content') and event.content:
            yield event.content
```

### State Update Streaming

```python
async def run_agent_with_updates(state: AgentState):
    """Stream state updates (more efficient for dashboards)."""
    agent = create_agent()

    async for delta in agent.astream(state, stream_mode="updates"):
        yield delta  # Partial state changes only
```

### Custom Streaming

```python
async def run_agent_custom_stream(state: AgentState):
    """Stream custom payloads."""
    agent = create_agent()

    async for event in agent.astream(state, stream_mode="custom"):
        # Format for specific UI needs
        yield {
            "type": event.get("type"),
            "node": event.get("node"),
            "content": event.get("content"),
        }
```

---

## Memory & Persistence

### Postgres Checkpointer (Production)

```python
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

DB_URI = "postgresql://user:pass@host:5432/langgraph"

pool = ConnectionPool(conninfo=DB_URI, max_size=10)

with pool.connection() as conn:
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()  # Creates tables

agent = builder.compile(checkpointer=checkpointer)
```

### Thread-Based Sessions

```python
def run_with_session(session_id: str, user_id: str, state: AgentState):
    """Run agent with proper thread scoping."""
    config = {
        "configurable": {
            "thread_id": f"user-{user_id}:session-{session_id}",
            "checkpoint_ns": f"user-{user_id}",
        }
    }

    return agent.invoke(state, config=config)
```

### Long-Term Memory Store

```python
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

def save_user_preference(user_id: str, key: str, value: dict):
    """Store cross-session user preferences."""
    namespace = ("users", user_id, "preferences")
    store.put(namespace, key, value)

def get_user_preference(user_id: str, key: str) -> dict:
    return store.get(("users", user_id, "preferences"), key)
```

---

## Multi-Agent Patterns

### Supervisor Pattern

```python
from langgraph.graph import Send

def supervisor_node(state: AgentState) -> dict:
    """Classify and delegate to specialists."""
    intent = classify_intent(state["messages"][-1]["content"])
    return {"intent": intent}

def route_to_specialist(state: AgentState) -> str:
    intent = state.get("intent", "chat")
    return f"{intent}_agent"

# Build graph
builder.add_node("supervisor", supervisor_node)
builder.add_node("search_agent", search_node)
builder.add_node("summarize_agent", summarize_node)
builder.add_node("chat_agent", chat_node)
builder.add_node("aggregator", aggregate_results)

builder.add_conditional_edges("supervisor", route_to_specialist)
```

### Fan-Out with Send API

```python
from langgraph.graph import Send

def fanout_node(state: AgentState):
    """Dispatch parallel tasks."""
    tasks = state.get("pending_tasks", [])
    return [Send("worker", {"task": t}) for t in tasks]

def worker_node(state: AgentState) -> dict:
    """Process individual task."""
    task = state["task"]
    result = process_task(task)
    return {"result": {task: result}}

def aggregate_node(state: AgentState) -> dict:
    """Merge results from workers."""
    results = state.get("result", {})
    return {"final_result": summarize_results(results)}
```

---

## Testing

### Unit Testing Nodes

```python
import pytest

def test_process_node():
    state = AgentState(
        messages=[{"role": "user", "content": "Hello"}],
        page_content="Test page",
    )

    result = process_node(state)

    assert "current_step" in result
    assert result["current_step"] in ["respond", "tools"]
```

### Integration Testing

```python
@pytest.mark.asyncio
async def test_full_graph():
    agent = create_agent()

    initial_state = AgentState(
        messages=[{"role": "user", "content": "What is 2+2?"}],
        max_steps=3,
    )

    result = await agent.ainvoke(initial_state)

    assert len(result["messages"]) > 1
    assert result["messages"][-1]["role"] == "assistant"
```

### Mock LLM for Testing

```python
class MockLLM:
    def __init__(self, responses: dict):
        self.responses = responses

    def invoke(self, messages):
        last_msg = messages[-1]["content"]
        for trigger, response in self.responses.items():
            if trigger in last_msg:
                return MockResponse(response)
        return MockResponse("Default response")

@pytest.fixture
def mock_llm():
    return MockLLM({
        "hello": "Hi there!",
        "search": "Here are the results...",
    })
```

---

## Best Practices Summary

1. **State**: Keep minimal, typed, validated at boundaries
2. **Nodes**: Pure functions returning partial updates
3. **Edges**: Simple where possible, conditional only for real branches
4. **Cycles**: Always bound with max_steps counter
5. **Errors**: Handle at node, graph, and app levels
6. **Streaming**: Choose mode based on UI needs
7. **Memory**: Use Postgres checkpointer in production
8. **Testing**: Test nodes, graphs, and mock external calls
