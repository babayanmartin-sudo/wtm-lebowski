"""Provider-agnostic tool-use loop for the Chat Q&A widget (#43). Both
Anthropic and OpenAI are supported since the user has paid access to both;
the loop hands the model a fixed set of read-only aggregation tools
(`insights_tools.TOOLS`) instead of dumping transaction history into the
prompt, so each question only pulls the data it actually needs."""

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from .insights_tools import TOOL_SCHEMAS, TOOLS

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 5

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-5",
    "openai": "gpt-5",
}


class InsightsError(Exception):
    """Wraps any provider SDK failure (auth, rate limit, network) into one
    type the router can turn into a clean 502."""


def _run_tool(db: Session, name: str, arguments: dict) -> dict:
    fn = TOOLS.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return fn(db, **arguments)
    except Exception as e:  # noqa: BLE001 — surface the failure to the model, not a 500
        return {"error": str(e)}


def test_connection(provider: str, api_key: str, model: str | None) -> tuple[bool, str]:
    """Minimal round-trip to the provider — validates the API key and model
    name without going through the tool-use loop. Used by Profile's 'Test
    connection' button, mirroring the Mashreq IMAP test."""
    resolved_model = model or DEFAULT_MODELS.get(provider)
    if not resolved_model:
        return False, f"Unknown provider: {provider}"
    try:
        if provider == "anthropic":
            from anthropic import Anthropic

            client = Anthropic(api_key=api_key)
            client.messages.create(
                model=resolved_model, max_tokens=1, messages=[{"role": "user", "content": "ping"}]
            )
        elif provider == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=api_key)
            client.chat.completions.create(
                model=resolved_model,
                # reasoning models (gpt-5, o-series) spend part of this
                # budget on hidden reasoning tokens before any visible
                # output — 1 starves them out and OpenAI errors instead
                # of just returning empty content, so give it headroom
                max_completion_tokens=16,
                messages=[{"role": "user", "content": "ping"}],
            )
        else:
            return False, f"Unknown provider: {provider}"
    except ImportError as e:
        return False, f"{provider} package not installed ({e})"
    except Exception as e:  # noqa: BLE001 — surface the SDK's own message to the user
        return False, str(e)
    return True, f"Connected ({resolved_model})"


def run_chat(
    db: Session,
    provider: str,
    api_key: str,
    model: str | None,
    system_prompt: str,
    messages: list[dict[str, str]],
    max_tokens: int = 1024,
) -> str:
    resolved_model = model or DEFAULT_MODELS.get(provider)
    if provider == "anthropic":
        return _run_anthropic(db, api_key, resolved_model, system_prompt, messages, max_tokens)
    if provider == "openai":
        return _run_openai(db, api_key, resolved_model, system_prompt, messages)
    raise InsightsError(f"Unknown provider: {provider}")


def _run_anthropic(
    db: Session, api_key: str, model: str, system_prompt: str, messages: list[dict], max_tokens: int = 1024
) -> str:
    try:
        from anthropic import Anthropic
    except ImportError as e:
        raise InsightsError("anthropic package not installed") from e

    client = Anthropic(api_key=api_key)
    convo: list[dict[str, Any]] = [{"role": m["role"], "content": m["content"]} for m in messages]
    tools = [{"name": s["name"], "description": s["description"], "input_schema": s["parameters"]} for s in TOOL_SCHEMAS]

    for _ in range(MAX_TOOL_ITERATIONS):
        try:
            resp = client.messages.create(
                model=model, max_tokens=max_tokens, system=system_prompt, messages=convo, tools=tools
            )
        except Exception as e:  # noqa: BLE001 — collapse SDK-specific errors to one type
            raise InsightsError(str(e)) from e

        if resp.stop_reason != "tool_use":
            text = "".join(b.text for b in resp.content if b.type == "text").strip()
            if not text:
                logger.warning(
                    "anthropic empty reply: stop_reason=%r content_types=%r model=%r",
                    resp.stop_reason,
                    [b.type for b in resp.content],
                    model,
                )
            return text or "No response."

        convo.append({"role": "assistant", "content": resp.content})
        tool_results = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            result = _run_tool(db, block.name, block.input or {})
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": json.dumps(result)}
            )
        convo.append({"role": "user", "content": tool_results})

    logger.warning("anthropic max tool iterations (%d) exhausted, model=%r", MAX_TOOL_ITERATIONS, model)
    return "I wasn't able to finish looking that up — try a narrower question."


def _run_openai(db: Session, api_key: str, model: str, system_prompt: str, messages: list[dict]) -> str:
    try:
        from openai import OpenAI
    except ImportError as e:
        raise InsightsError("openai package not installed") from e

    client = OpenAI(api_key=api_key)
    convo: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}] + [
        {"role": m["role"], "content": m["content"]} for m in messages
    ]
    tools = [{"type": "function", "function": s} for s in TOOL_SCHEMAS]

    for _ in range(MAX_TOOL_ITERATIONS):
        try:
            resp = client.chat.completions.create(model=model, messages=convo, tools=tools)
        except Exception as e:  # noqa: BLE001
            raise InsightsError(str(e)) from e

        choice = resp.choices[0]
        if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
            content = (choice.message.content or "").strip()
            if not content:
                logger.warning(
                    "openai empty reply: finish_reason=%r tool_calls=%r model=%r",
                    choice.finish_reason,
                    choice.message.tool_calls,
                    model,
                )
            return content or "No response."

        convo.append(choice.message.model_dump())
        for call in choice.message.tool_calls:
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except ValueError:
                arguments = {}
            result = _run_tool(db, call.function.name, arguments)
            convo.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})

    logger.warning("openai max tool iterations (%d) exhausted, model=%r", MAX_TOOL_ITERATIONS, model)
    return "I wasn't able to finish looking that up — try a narrower question."
