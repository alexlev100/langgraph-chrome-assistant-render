import pytest

from app.agent import build_page_context_summary, respond_node, should_use_tooling


def test_build_page_context_summary_includes_core_fields():
    summary = build_page_context_summary(
        {
            "title": "Test page",
            "url": "https://example.com",
            "text": "Hello world",
            "forms": [{"id": "f1", "fields": [{"name": "email"}]}],
        }
    )

    assert "Test page" in summary
    assert "https://example.com" in summary
    assert "Hello world" in summary
    assert "forms: 1" in summary.lower()


@pytest.mark.parametrize(
    "message, expected",
    [
        ("summarize this page", False),
        ("what forms are on this page?", True),
        ("extract form fields", True),
    ],
)
def test_should_use_tooling(message: str, expected: bool):
    assert should_use_tooling(message) is expected


def test_respond_node_enforces_russian_output_language():
    state = {
        "messages": [{"role": "user", "content": "Summarize this page"}],
        "context_summary": "Some page context",
    }

    result = respond_node(state)
    system_prompt = result["llm_messages"][0]["content"]
    assert "Always answer in Russian" in system_prompt
