from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import tomllib


_ENV_PATH = Path(__file__).parent / "env.toml"
_CONFIG_PATH = Path(__file__).parent / "config.toml"
_PROJECT_ROOT = Path(__file__).parent.parent


# ── env.toml (infrastructure) ────────────────────────────────────────


@dataclass(frozen=True)
class ServerConfig:
    title: str = "Research Writing Council"
    version: str = "0.1.0"
    host: str = "127.0.0.1"
    port: int = 8080


@dataclass(frozen=True)
class CORSConfig:
    allow_origins: list[str] = field(default_factory=lambda: ["*"])
    allow_credentials: bool = True
    allow_methods: list[str] = field(default_factory=lambda: ["*"])
    allow_headers: list[str] = field(default_factory=lambda: ["*"])


@dataclass(frozen=True)
class OpenCodeConfig:
    port: int = 4096
    password: str | None = None
    launch_timeout: int = 30
    health_timeout: int = 30
    shutdown_wait: int = 10
    models_timeout: int = 15
    models_cache_ttl: int = 60
    auth_username: str = "opencode"

    @property
    def base_url(self) -> str:
        return f"http://localhost:{self.port}"


@dataclass(frozen=True)
class BridgeClientConfig:
    timeout_total: float = 600.0
    timeout_read: float = 600.0
    timeout_connect: float = 30.0
    retries: int = 1
    retry_backoff_factor: float = 2.0


@dataclass(frozen=True)
class PipelinePromptsConfig:
    critique_system: str = (
        "You are a peer reviewer evaluating other reviewers. "
        "Be critical and specific. Output ONLY valid JSON."
    )
    critique_retry_system: str = (
        "You are a peer reviewer. Output ONLY valid JSON. "
        "No markdown, no code fences."
    )
    chair_system: str = (
        "You are the Chair of a scientific writing council. "
        "Synthesize, do not average."
    )
    revision_system_suffix: str = (
        "You are participating in a multi-round debate. "
        "Revise your analysis based on peer feedback."
    )


@dataclass(frozen=True)
class PipelineConfig:
    chain_of_thought_kicker: str = (
        "\n\nFirst, re-read the user's text carefully. "
        "Then work through your analysis step by step "
        "before writing your final response."
    )
    default_confidence: float = 0.5
    quorum_min_members: int = 2
    critique_retry: int = 1
    stream_delay_seconds: float = 0.05
    prompts: PipelinePromptsConfig = field(default_factory=PipelinePromptsConfig)


@dataclass(frozen=True)
class StorageConfig:
    session_dir: str = "data/sessions"


@dataclass(frozen=True)
class DebugConfig:
    debug_dir: str = "data/debug"


@dataclass(frozen=True)
class EnvConfig:
    server: ServerConfig = field(default_factory=ServerConfig)
    cors: CORSConfig = field(default_factory=CORSConfig)
    opencode: OpenCodeConfig = field(default_factory=OpenCodeConfig)
    bridge: BridgeClientConfig = field(default_factory=BridgeClientConfig)
    pipeline: PipelineConfig = field(default_factory=PipelineConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    debug: DebugConfig = field(default_factory=DebugConfig)

    def project_root(self) -> Path:
        return _PROJECT_ROOT

    def resolve_storage_dir(self) -> Path:
        return _PROJECT_ROOT / self.storage.session_dir

    def resolve_debug_dir(self) -> Path:
        return _PROJECT_ROOT / self.debug.debug_dir


# ── config.toml (council defaults) ────────────────────────────────────


@dataclass(frozen=True)
class CouncilConfig:
    mode: Literal["council", "debate"] = "council"
    model_overrides: dict[str, dict[str, str]] = field(default_factory=dict)
    contract_overrides: dict[str, str] = field(default_factory=dict)


# ── helpers ────────────────────────────────────────────────────────────


def _merge(table: dict[str, Any], section: str, target: Any) -> Any:
    overrides = table.get(section, {})
    if not overrides:
        return target
    kwargs = {}
    for f in target.__dataclass_fields__:
        if f in overrides:
            kwargs[f] = overrides[f]
    return type(target)(**kwargs)


def load_env() -> EnvConfig:
    raw: dict[str, Any] = {}
    if _ENV_PATH.exists():
        raw = tomllib.loads(_ENV_PATH.read_text())

    cfg = EnvConfig()

    cfg = EnvConfig(
        server=_merge(raw, "server", cfg.server),
        cors=_merge(raw, "cors", cfg.cors),
        opencode=_merge(raw, "opencode", cfg.opencode),
        bridge=_merge(raw, "bridge", cfg.bridge),
        pipeline=_merge(
            raw, "pipeline",
            PipelineConfig(
                prompts=_merge(
                    raw.get("pipeline", {}), "prompts",
                    cfg.pipeline.prompts,
                ),
            ),
        ),
        storage=_merge(raw, "storage", cfg.storage),
        debug=_merge(raw, "debug", cfg.debug),
    )

    pw = os.environ.get("OPENCODE_SERVER_PASSWORD")
    if pw is not None:
        cfg = EnvConfig(
            server=cfg.server,
            cors=cfg.cors,
            opencode=OpenCodeConfig(
                port=cfg.opencode.port,
                password=pw,
                launch_timeout=cfg.opencode.launch_timeout,
                health_timeout=cfg.opencode.health_timeout,
                shutdown_wait=cfg.opencode.shutdown_wait,
                models_timeout=cfg.opencode.models_timeout,
                models_cache_ttl=cfg.opencode.models_cache_ttl,
                auth_username=cfg.opencode.auth_username,
            ),
            bridge=cfg.bridge,
            pipeline=cfg.pipeline,
            storage=cfg.storage,
            debug=cfg.debug,
        )

    env_port = os.environ.get("OPENCODE_PORT")
    if env_port is not None:
        cfg = EnvConfig(
            server=cfg.server,
            cors=cfg.cors,
            opencode=OpenCodeConfig(
                port=int(env_port),
                password=cfg.opencode.password,
                launch_timeout=cfg.opencode.launch_timeout,
                health_timeout=cfg.opencode.health_timeout,
                shutdown_wait=cfg.opencode.shutdown_wait,
                models_timeout=cfg.opencode.models_timeout,
                models_cache_ttl=cfg.opencode.models_cache_ttl,
                auth_username=cfg.opencode.auth_username,
            ),
            bridge=cfg.bridge,
            pipeline=cfg.pipeline,
            storage=cfg.storage,
            debug=cfg.debug,
        )

    return cfg


def load_council() -> CouncilConfig:
    raw: dict[str, Any] = {}
    if _CONFIG_PATH.exists():
        raw = tomllib.loads(_CONFIG_PATH.read_text())
    return _merge(raw, "council", CouncilConfig())


env = load_env()
council = load_council()
