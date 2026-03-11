"""
LangGraph Agent Definition

Stateful AI agent with tool support and streaming.
"""

from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import os
from typing import AsyncGenerator

from state import AgentState
from tools import get_tools

# Initialize LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    temperature=0.7,
)

# Bind tools to LLM
tools = get_tools()
llm_with_tools = llm.bind_tools(tools) if tools else llm


def create_agent():
    """Create the LangGraph agent."""
    builder = StateGraph(AgentState)

    # Add nodes
    builder.add_node("process", process_node)
    builder.add_node("tools", tools_node)
    builder.add_node("respond", respond_node)
    builder.add_node("error_handler", error_handler_node)

    # Set entry point
    builder.set_entry_point("process")

    # Add conditional routing
    builder.add_conditional_edges(
        "process",
        route_after_process,
        {
            "tools": "tools",
            "respond": "respond",
            "error": "error_handler",
        },
    )

    builder.add_edge("tools", "respond")
    builder.add_edge("respond", END)

    # Error handler can retry or give up
    builder.add_conditional_edges(
        "error_handler",
        should_retry,
        {
            "retry": "process",
            "give_up": "respond",
        },
    )

    return builder.compile()


def process_node(state: AgentState) -> dict:
    """Main processing node - analyze message and decide action."""
    try:
        messages = state.get("messages", [])
        page_content = state.get("page_content", "")

        # Build context-aware system message
        system_content = "You are a helpful AI assistant integrated into a Chrome extension."
        if page_content:
            system_content += f"\n\nCurrent page context:\n{page_content[:3000]}"

        # Convert to LangChain messages
        lc_messages = [SystemMessage(content=system_content)]
        for msg in messages:
            if msg.get("role") == "user":
                lc_messages.append(HumanMessage(content=msg["content"]))
            elif msg.get("role") == "assistant":
                lc_messages.append(AIMessage(content=msg["content"]))

        # Invoke LLM
        response = llm_with_tools.invoke(lc_messages)

        # Check for tool calls
        if hasattr(response, "tool_calls") and response.tool_calls:
            return {
                "current_step": "tools",
                "tool_calls": response.tool_calls,
            }

        # Direct response
        return {
            "current_step": "respond",
            "response": response.content,
        }

    except Exception as e:
        return {
            "current_step": "error",
            "last_error": {"type": type(e).__name__, "detail": str(e)},
            "error_count": state.get("error_count", 0) + 1,
        }


def route_after_process(state: AgentState) -> str:
    """Route based on current_step."""
    step = state.get("current_step", "respond")
    if step == "error":
        return "error"
    elif step == "tools":
        return "tools"
    return "respond"


def tools_node(state: AgentState) -> dict:
    """Execute tool calls."""
    tool_calls = state.get("tool_calls", [])
    tool_results = []

    tool_map = {tool.name: tool for tool in tools}

    for call in tool_calls:
        tool_name = call.get("name") or call.get("function", {}).get("name")
        tool_args = call.get("args") or call.get("function", {}).get("arguments", {})

        if tool_name in tool_map:
            try:
                result = tool_map[tool_name].invoke(tool_args)
                tool_results.append({"tool": tool_name, "result": result})
            except Exception as e:
                tool_results.append({"tool": tool_name, "error": str(e)})

    # Generate response incorporating tool results
    tool_context = "\n".join(
        f"Tool '{r['tool']}': {r.get('result', r.get('error', 'No result'))}"
        for r in tool_results
    )

    messages = state.get("messages", [])
    lc_messages = [
        SystemMessage(content=f"You called tools. Results:\n{tool_context}\n\nNow respond to the user."),
    ]
    for msg in messages:
        if msg.get("role") == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))

    response = llm.invoke(lc_messages)

    return {
        "tool_results": tool_results,
        "response": response.content,
        "current_step": "respond",
    }


def respond_node(state: AgentState) -> dict:
    """Format final response as message."""
    response = state.get("response", "I couldn't process that request.")
    return {"messages": [{"role": "assistant", "content": response}]}


def error_handler_node(state: AgentState) -> dict:
    """Handle errors with potential retry."""
    error = state.get("last_error", {})
    error_count = state.get("error_count", 0)

    if error_count >= state.get("max_steps", 3):
        return {
            "response": f"I encountered an error: {error.get('detail', 'Unknown error')}. Please try again.",
            "current_step": "give_up",
        }

    return {"current_step": "retry"}


def should_retry(state: AgentState) -> str:
    """Decide whether to retry or give up."""
    return state.get("current_step", "give_up")


async def run_agent(state: AgentState) -> AgentState:
    """Run agent and return final state."""
    agent = create_agent()
    return await agent.ainvoke(state)


async def run_agent_streaming(state: AgentState) -> AsyncGenerator[str, None]:
    """Stream agent response tokens."""
    agent = create_agent()

    async for event in agent.astream(state, stream_mode="messages"):
        # Extract content from streaming events
        if hasattr(event, "content") and event.content:
            yield event.content
        elif isinstance(event, tuple) and len(event) > 1:
            msg = event[0]
            if hasattr(msg, "content") and msg.content:
                yield msg.content
