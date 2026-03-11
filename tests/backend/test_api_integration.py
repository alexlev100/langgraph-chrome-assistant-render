from typing import Iterator

from fastapi.testclient import TestClient

from app.main import create_app


class FakeLLM:
    def complete(self, messages: list[dict]) -> dict:
        return {
            "content": "## Summary\\n\\n**Done.**",
            "token_count": 5,
        }

    def stream(self, messages: list[dict]) -> Iterator[str]:
        for token in ["##", " Summary", "\\n\\n", "**Done.**"]:
            yield token


def test_chat_endpoint_happy_path():
    app = create_app(llm_client=FakeLLM())
    client = TestClient(app)

    response = client.post(
        "/chat/test-session",
        json={
            "message": "Summarize",
            "page_content": "A page about testing",
            "page_details": {"title": "T", "url": "https://e.com", "text": "A page"},
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "test-session"
    assert "Summary" in data["response"]
    assert "meta" in data


def test_websocket_streaming_status_sequence():
    app = create_app(llm_client=FakeLLM())
    client = TestClient(app)

    with client.websocket_connect("/ws/test-session") as ws:
        ws.send_json(
            {
                "message": "Summarize page",
                "page_content": "Text",
                "page_details": {"title": "T", "url": "https://e.com", "text": "Text"},
            }
        )

        events = []
        while True:
            event = ws.receive_json()
            events.append(event)
            if event.get("type") == "done":
                break

    assert events[0]["type"] == "status"
    assert events[0]["stage"] == "receiving_context"

    event_types = [e["type"] for e in events]
    assert "token" in event_types
    assert events[-1]["type"] == "done"


def test_chat_endpoint_error_path():
    class BrokenLLM:
        def complete(self, messages: list[dict]) -> dict:
            raise RuntimeError("boom")

        def stream(self, messages: list[dict]):
            raise RuntimeError("boom")

    app = create_app(llm_client=BrokenLLM())
    client = TestClient(app)

    response = client.post(
        "/chat/test-session",
        json={"message": "x", "page_content": "", "page_details": {}},
    )

    assert response.status_code == 500
    assert "boom" in response.text
