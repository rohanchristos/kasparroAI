"""
Kasparro AI Agent — LLM Service (Grok / OpenAI switcher).

Uses LangChain's ChatOpenAI for both providers since Grok
exposes an OpenAI-compatible API at https://api.x.ai/v1.
"""

from __future__ import annotations

import structlog
from langchain_openai import ChatOpenAI

from src.config.settings import settings

logger = structlog.get_logger(__name__)

# ── Provider configs ─────────────────────────────────────────

_LLM_CONFIGS: dict[str, dict] = {
    "grok": {
        "base_url": "https://api.x.ai/v1",
        "api_key": settings.GROK_API_KEY,
        "model": "grok-3-mini",
        "temperature": 0.3,
        "max_tokens": 2048,
    },
    "openai": {
        "api_key": settings.OPENAI_API_KEY,
        "model": "gpt-4o",
        "temperature": 0.3,
        "max_tokens": 2048,
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "api_key": settings.OPENROUTER_API_KEY,
        "model": "anthropic/claude-3.5-sonnet",
        "temperature": 0.3,
        "max_tokens": 2048,
    },
}


def get_llm(provider: str = "grok") -> ChatOpenAI:
    """
    Return a LangChain ChatOpenAI instance for the given provider.

    Args:
        provider: ``"grok"`` or ``"openai"``

    Returns:
        A configured ``ChatOpenAI`` instance.

    Raises:
        ValueError: If the provider is unknown.
        RuntimeError: If the API key for the provider is not configured.
    """
    provider = provider.lower().strip()

    if provider not in _LLM_CONFIGS:
        raise ValueError(
            f"Unknown LLM provider '{provider}'. "
            f"Supported: {', '.join(_LLM_CONFIGS.keys())}"
        )

    config = _LLM_CONFIGS[provider]

    if not config["api_key"]:
        raise RuntimeError(
            f"API key for '{provider}' is not configured. "
            f"Set the corresponding environment variable in .env"
        )

    logger.info(
        "llm_initialised",
        provider=provider,
        model=config["model"],
    )

    # Build kwargs — only include base_url for Grok
    kwargs: dict = {
        "api_key": config["api_key"],
        "model": config["model"],
        "temperature": config["temperature"],
        "max_tokens": config["max_tokens"],
    }

    if "base_url" in config:
        kwargs["base_url"] = config["base_url"]

    return ChatOpenAI(**kwargs)


def check_provider_status(provider: str) -> bool:
    """
    Quick check whether a provider's API key is configured.

    Does NOT make a live API call — just validates the key is present.
    """
    config = _LLM_CONFIGS.get(provider.lower())
    if not config:
        return False
    return bool(config.get("api_key"))


def get_provider_model(provider: str) -> str:
    """Return the model name used by a provider."""
    config = _LLM_CONFIGS.get(provider.lower(), {})
    return config.get("model", "unknown")


# ── Provider metadata ────────────────────────────────────────

_PROVIDER_INFO: dict[str, dict] = {
    "grok": {
        "id": "grok",
        "name": "Grok 3 Mini",
        "description": "Fast and free — powered by xAI",
        "is_free": True,
    },
    "openai": {
        "id": "openai",
        "name": "GPT-4o",
        "description": "Most capable — powered by OpenAI",
        "is_free": False,
    },
    "openrouter": {
        "id": "openrouter",
        "name": "Claude 3.5 Sonnet",
        "description": "Flexible and powerful — via OpenRouter",
        "is_free": False,
    },
}


def get_llm_info(provider: str) -> dict:
    """
    Get metadata about a provider.

    Returns: { id, name, model, description, is_free, status }
    """
    provider = provider.lower().strip()
    info = _PROVIDER_INFO.get(provider, {}).copy()
    if not info:
        return {"id": provider, "name": provider, "model": "unknown",
                "description": "Unknown provider", "is_free": False,
                "status": "error"}

    info["model"] = get_provider_model(provider)
    info["status"] = "connected" if check_provider_status(provider) else "error"
    return info


async def check_provider_health(provider: str) -> dict:
    """
    Make a minimal live API call to verify the provider is working.

    Returns: { provider, healthy, model, error? }
    """
    try:
        llm = get_llm(provider)
        # Minimal test — single token generation
        response = await llm.ainvoke("Reply with OK")
        return {
            "provider": provider,
            "healthy": True,
            "model": get_provider_model(provider),
            "response_preview": response.content[:50],
        }
    except Exception as exc:
        logger.error("llm_health_check_failed", provider=provider, error=str(exc))
        return {
            "provider": provider,
            "healthy": False,
            "model": get_provider_model(provider),
            "error": str(exc),
        }
