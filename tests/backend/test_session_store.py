from app.session_store import SessionStore


def test_session_store_creates_and_clears_session():
    store = SessionStore()
    sid = "session-1"

    state = store.get_or_create(sid)
    assert state["messages"] == []

    state["messages"].append({"role": "user", "content": "hi"})
    store.save(sid, state)

    saved = store.get_or_create(sid)
    assert len(saved["messages"]) == 1

    assert store.clear(sid) is True
    assert store.clear(sid) is False
