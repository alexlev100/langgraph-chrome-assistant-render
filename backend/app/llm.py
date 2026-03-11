from __future__ import annotations

from collections.abc import Iterator
from typing import Protocol

from groq import Groq


class LLMClient(Protocol):
    def complete(self, messages: list[dict[str, str]]) -> dict[str, object]:
        ...

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        ...


class GroqLLMClient:
    def __init__(
        self,
        api_key: str,
        model: str = "openai/gpt-oss-20b",
        temperature: float = 0.3,
        top_p: float = 1,
        max_completion_tokens: int = 2048,
        reasoning_effort: str = "medium",
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._top_p = top_p
        self._max_completion_tokens = max_completion_tokens
        self._reasoning_effort = reasoning_effort

    def _client(self) -> Groq:
        if not self._api_key:
            raise RuntimeError("GROQ_API_KEY is not configured")
        return Groq(api_key=self._api_key)

    def complete(self, messages: list[dict[str, str]]) -> dict[str, object]:
        completion = self._client().chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=self._temperature,
            max_completion_tokens=self._max_completion_tokens,
            top_p=self._top_p,
            reasoning_effort=self._reasoning_effort,
            stream=False,
            stop=None,
        )
        content = completion.choices[0].message.content or ""
        usage = getattr(completion, "usage", None)
        token_count = getattr(usage, "completion_tokens", None)
        return {"content": content, "token_count": token_count}

    def stream(self, messages: list[dict[str, str]]) -> Iterator[str]:
        stream = self._client().chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=self._temperature,
            max_completion_tokens=self._max_completion_tokens,
            top_p=self._top_p,
            reasoning_effort=self._reasoning_effort,
            stream=True,
            stop=None,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield delta
