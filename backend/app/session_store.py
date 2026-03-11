from threading import Lock

from app.state import AgentState, create_initial_state


class SessionStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._sessions: dict[str, AgentState] = {}

    def get_or_create(self, session_id: str) -> AgentState:
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = create_initial_state()
            return self._sessions[session_id]

    def save(self, session_id: str, state: AgentState) -> None:
        with self._lock:
            self._sessions[session_id] = state

    def clear(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None
