"""The only boundary to the configured OpenAI-compatible provider."""

import asyncio
import logging
from urllib.parse import urlsplit

from openai import (
    APIError,
    APIResponseValidationError,
    APITimeoutError,
    AsyncOpenAI,
    ContentFilterFinishReasonError,
    LengthFinishReasonError,
)
from pydantic import ValidationError

from pipelinelens.config import Settings, get_settings
from pipelinelens.models import AnalysisResponse


REQUEST_TIMEOUT_SECONDS = 30.0
TOTAL_TIMEOUT_SECONDS = 65.0
MAX_RETRIES = 1
DEFAULT_BASE_URL = "https://api.openai.com/v1"


class ProviderConfigurationError(Exception):
    """Provider configuration is missing or unsupported."""


class ProviderTimeoutError(Exception):
    """The provider exceeded a request or overall timeout."""


class ProviderFailureError(Exception):
    """The upstream service or connection failed."""


class InvalidProviderResponseError(Exception):
    """The provider refused, truncated, or returned unusable output."""


def _validate_settings(settings: Settings) -> None:
    if not settings.api_key or not settings.model:
        raise ProviderConfigurationError("Set LLM_API_KEY and LLM_MODEL to enable analysis.")
    if settings.response_format not in {"json_schema", "json_object"}:
        raise ProviderConfigurationError(
            "LLM_RESPONSE_FORMAT must be json_schema or json_object."
        )
    if settings.base_url:
        try:
            url = urlsplit(settings.base_url)
            valid = url.scheme in {"http", "https"} and bool(url.hostname)
        except ValueError:
            valid = False
        if not valid:
            raise ProviderConfigurationError("LLM_BASE_URL must be an HTTP(S) API base URL.")


def _suppress_transport_logging() -> None:
    # SDK debug records include request bodies and exceptions can include upstream
    # response bodies. Suppress these libraries even when OPENAI_LOG=debug or the
    # application's root logger is set to DEBUG; our errors contain static text.
    prefixes = ("openai", "httpx", "httpcore")
    for name in list(logging.root.manager.loggerDict):
        if name in prefixes or name.startswith(tuple(f"{prefix}." for prefix in prefixes)):
            logging.getLogger(name).disabled = True


async def generate_report(
    messages: list[dict[str, str]], *, settings: Settings | None = None
) -> str:
    """Request structured JSON, with bounded retries and deterministic cleanup.

    JSON Schema is the default. JSON mode is an explicit compatibility choice;
    the caller must always validate the returned JSON and evidence citations.
    """
    settings = settings if settings is not None else get_settings()
    _validate_settings(settings)
    _suppress_transport_logging()

    try:
        # The outer deadline covers SDK backoff as well as both allowed attempts.
        async with asyncio.timeout(TOTAL_TIMEOUT_SECONDS):
            async with AsyncOpenAI(
                api_key=settings.api_key,
                base_url=settings.base_url or DEFAULT_BASE_URL,
                timeout=REQUEST_TIMEOUT_SECONDS,
                max_retries=MAX_RETRIES,
            ) as client:
                if settings.response_format == "json_schema":
                    completion = await client.chat.completions.parse(
                        model=settings.model,
                        messages=messages,
                        response_format=AnalysisResponse,
                        timeout=REQUEST_TIMEOUT_SECONDS,
                    )
                else:
                    completion = await client.chat.completions.create(
                        model=settings.model,
                        messages=messages,
                        response_format={"type": "json_object"},
                        timeout=REQUEST_TIMEOUT_SECONDS,
                    )
                if not completion.choices:
                    raise InvalidProviderResponseError("The provider returned no analysis.")
                choice = completion.choices[0]
                message = choice.message
                if choice.finish_reason != "stop" or message.refusal:
                    raise InvalidProviderResponseError(
                        "The provider did not return a complete analysis."
                    )
                if not isinstance(message.content, str) or not message.content.strip():
                    raise InvalidProviderResponseError("The provider returned no analysis.")
                return message.content
    except (TimeoutError, APITimeoutError):
        raise ProviderTimeoutError("The analysis provider timed out.") from None
    except (
        ValidationError,
        APIResponseValidationError,
        LengthFinishReasonError,
        ContentFilterFinishReasonError,
    ):
        raise InvalidProviderResponseError("The provider returned invalid analysis JSON.") from None
    except APIError:
        raise ProviderFailureError("The analysis provider request failed.") from None
