"""Exercise the real SDK against an in-memory HTTP transport; never use the network."""

import asyncio
import json
import logging

import httpx
import pytest
from openai import AsyncOpenAI

from pipelinelens import provider
from pipelinelens.config import Settings


MESSAGES = [{"role": "system", "content": "Return only the required JSON report."}]
REPORT = {
    "status": "needs_more_context",
    "summary": "The supplied output does not show the failure.",
    "likely_cause": None,
    "evidence": [],
    "suggested_changes": [],
    "verification_steps": [],
    "missing_information": ["The first failing command and its error output."],
}


def completion(content=None, *, finish_reason="stop", refusal=None):
    return {
        "id": "offline-completion",
        "object": "chat.completion",
        "created": 1,
        "model": "test-model",
        "choices": [{
            "index": 0,
            "finish_reason": finish_reason,
            "message": {
                "role": "assistant",
                "content": json.dumps(REPORT) if content is None else content,
                "refusal": refusal,
            },
        }],
    }


@pytest.fixture
def settings():
    return Settings(api_key="offline-api-key", model="test-model", base_url="https://provider.example/v1")


@pytest.fixture
def mock_provider(monkeypatch):
    requests = []
    clients = []
    options = []
    logger_states = {name: logging.getLogger(name).disabled for name in logging.root.manager.loggerDict}

    def install(handler):
        async def respond(request):
            requests.append(request)
            result = handler(request)
            return await result if asyncio.iscoroutine(result) else result

        def factory(**kwargs):
            options.append(kwargs)
            http_client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
            clients.append(http_client)
            return AsyncOpenAI(**kwargs, http_client=http_client)

        monkeypatch.setattr(provider, "AsyncOpenAI", factory)
        return requests, clients, options

    yield install
    for name, disabled in logger_states.items():
        logging.getLogger(name).disabled = disabled


def test_structured_output_request_and_client_cleanup(mock_provider, settings):
    requests, clients, options = mock_provider(lambda _: httpx.Response(200, json=completion()))
    result = asyncio.run(provider.generate_report(MESSAGES, settings=settings))
    assert json.loads(result) == REPORT
    assert str(requests[0].url) == "https://provider.example/v1/chat/completions"
    assert requests[0].headers["authorization"] == "Bearer offline-api-key"
    body = json.loads(requests[0].content)
    assert body["model"] == "test-model"
    assert body["messages"] == MESSAGES
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True
    schema = body["response_format"]["json_schema"]["schema"]
    assert set(schema["required"]) == set(REPORT)
    assert schema["additionalProperties"] is False
    assert options[0]["timeout"] == 30.0
    assert options[0]["max_retries"] == 1
    assert clients[0].is_closed


def test_explicit_json_mode(mock_provider, settings):
    requests, clients, _ = mock_provider(lambda _: httpx.Response(200, json=completion()))
    settings = Settings(api_key=settings.api_key, model=settings.model, response_format="json_object")
    result = asyncio.run(provider.generate_report(MESSAGES, settings=settings))
    assert json.loads(result) == REPORT
    assert json.loads(requests[0].content)["response_format"] == {"type": "json_object"}
    assert clients[0].is_closed


@pytest.mark.parametrize("settings", [
    Settings(),
    Settings(api_key="offline-key"),
    Settings(model="test-model"),
    Settings(api_key="offline-key", model="test-model", response_format="unsupported"),
    Settings(api_key="offline-key", model="test-model", base_url="not-a-url"),
])
def test_invalid_configuration_never_constructs_client(monkeypatch, settings):
    def forbidden(**kwargs):
        pytest.fail("No provider client should be created for invalid configuration")

    monkeypatch.setattr(provider, "AsyncOpenAI", forbidden)
    with pytest.raises(provider.ProviderConfigurationError):
        asyncio.run(provider.generate_report(MESSAGES, settings=settings))


@pytest.mark.parametrize("payload", [
    completion("not JSON"),
    completion('{"status": "unexpected"}'),
    completion(refusal="private upstream refusal"),
    completion(finish_reason="length"),
    completion(finish_reason="content_filter"),
    completion(content=""),
    {**completion(), "choices": []},
])
def test_invalid_provider_responses_are_sanitized(mock_provider, settings, payload):
    requests, clients, _ = mock_provider(lambda _: httpx.Response(200, json=payload))
    with pytest.raises(provider.InvalidProviderResponseError) as error:
        asyncio.run(provider.generate_report(MESSAGES, settings=settings))
    assert "private upstream" not in str(error.value)
    assert len(requests) == 1
    assert clients[0].is_closed


def test_retryable_failure_has_at_most_two_attempts(mock_provider, settings):
    requests, clients, _ = mock_provider(lambda _: httpx.Response(
        503, headers={"retry-after": "0.001"}, json={"error": {"message": "private upstream body"}}
    ))
    with pytest.raises(provider.ProviderFailureError) as error:
        asyncio.run(provider.generate_report(MESSAGES, settings=settings))
    assert "private upstream body" not in str(error.value)
    assert len(requests) == 2
    assert clients[0].is_closed


def test_nonretryable_failure_is_not_retried(mock_provider, settings):
    requests, clients, _ = mock_provider(lambda _: httpx.Response(
        401, json={"error": {"message": "private upstream body"}}
    ))
    with pytest.raises(provider.ProviderFailureError):
        asyncio.run(provider.generate_report(MESSAGES, settings=settings))
    assert len(requests) == 1
    assert clients[0].is_closed


def test_sdk_timeout_is_sanitized(mock_provider, settings):
    def timeout(request):
        raise httpx.ReadTimeout("private upstream timeout", request=request)

    requests, clients, _ = mock_provider(timeout)
    with pytest.raises(provider.ProviderTimeoutError) as error:
        asyncio.run(provider.generate_report(MESSAGES, settings=settings))
    assert "private upstream timeout" not in str(error.value)
    assert len(requests) == 2
    assert clients[0].is_closed


def test_overall_deadline_cancels_request_and_closes_client(mock_provider, monkeypatch, settings):
    async def slow_response(_):
        await asyncio.sleep(1)
        return httpx.Response(200, json=completion())

    _, clients, _ = mock_provider(slow_response)
    monkeypatch.setattr(provider, "TOTAL_TIMEOUT_SECONDS", 0.01)
    with pytest.raises(provider.ProviderTimeoutError):
        asyncio.run(provider.generate_report(MESSAGES, settings=settings))
    assert clients[0].is_closed


def test_debug_logging_does_not_emit_inputs_or_upstream_bodies(mock_provider, settings, caplog):
    mock_provider(lambda _: httpx.Response(
        400, json={"error": {"message": "private-provider-response"}}
    ))
    caplog.set_level(logging.DEBUG)
    with pytest.raises(provider.ProviderFailureError):
        asyncio.run(provider.generate_report(
            [{"role": "user", "content": "private-input-canary"}], settings=settings
        ))
    assert "private-input-canary" not in caplog.text
    assert "private-provider-response" not in caplog.text
    assert "offline-api-key" not in caplog.text
