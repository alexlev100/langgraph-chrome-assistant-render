"""
LLM Tool Definitions

Define tools that the LLM can call to perform actions.
"""

from langchain_core.tools import tool
import requests
import os
from typing import Optional


@tool
def web_search(query: str) -> str:
    """
    Search the web for information using EXA API.

    Args:
        query: The search query

    Returns:
        Search results as formatted text
    """
    api_key = os.getenv("EXA_API_KEY")
    if not api_key:
        return "Web search unavailable: EXA_API_KEY not configured"

    try:
        response = requests.post(
            "https://api.exa.ai/search",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "num_results": 5,
                "use_autoprompt": True,
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()

        results = []
        for r in data.get("results", []):
            title = r.get("title", "No title")
            url = r.get("url", "")
            text = r.get("text", "")[:200]
            results.append(f"**{title}**\n{url}\n{text}...")

        return "\n\n".join(results) if results else "No results found"

    except requests.RequestException as e:
        return f"Search failed: {str(e)}"


@tool
def get_answer(query: str, context: Optional[str] = None) -> str:
    """
    Get a direct answer to a question using EXA Answer API.

    Args:
        query: The question to answer
        context: Optional context to help answer the question

    Returns:
        Direct answer to the question
    """
    api_key = os.getenv("EXA_API_KEY")
    if not api_key:
        return "Answer service unavailable: EXA_API_KEY not configured"

    try:
        payload = {"query": query}
        if context:
            payload["text"] = context[:4000]  # Limit context size

        response = requests.post(
            "https://api.exa.ai/answer",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()

        return data.get("answer", "Could not generate an answer")

    except requests.RequestException as e:
        return f"Answer generation failed: {str(e)}"


@tool
def summarize_page(text: str) -> str:
    """
    Summarize the current page content.

    Args:
        text: The page text to summarize

    Returns:
        A concise summary of the page
    """
    # This is a placeholder - in practice, you'd call the LLM
    # or use a summarization service
    if len(text) < 200:
        return text

    # Simple extractive summary (first few sentences)
    sentences = text.split(". ")[:5]
    return ". ".join(sentences) + "..."


@tool
def extract_links(html: str) -> str:
    """
    Extract all links from page content.

    Args:
        html: The page HTML or text content

    Returns:
        List of links found on the page
    """
    import re

    # Simple URL extraction regex
    url_pattern = r'https?://[^\s<>"\']+|www\.[^\s<>"\']+'
    urls = re.findall(url_pattern, html)

    # Deduplicate and limit
    unique_urls = list(dict.fromkeys(urls))[:20]

    if not unique_urls:
        return "No links found on this page"

    return "\n".join(f"- {url}" for url in unique_urls)


def get_tools() -> list:
    """Get list of available tools."""
    return [
        web_search,
        get_answer,
        summarize_page,
        extract_links,
    ]
