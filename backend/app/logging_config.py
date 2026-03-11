import json
import logging
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra_fields = [
            "request_id",
            "session_id",
            "tab_url",
            "stage",
            "latency_ms",
            "token_count",
            "error_type",
        ]
        for field in extra_fields:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        return json.dumps(payload, ensure_ascii=True)


def setup_logging(level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger("langgraph_chrome_backend")
    logger.setLevel(level.upper())
    logger.handlers = []

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.propagate = False
    return logger
