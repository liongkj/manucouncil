import json
from pathlib import Path
from backend.models import PresetConfig


PRESETS_DIR = Path(__file__).parent


def load_presets() -> dict[str, PresetConfig]:
    presets: dict[str, PresetConfig] = {}
    for f in sorted(PRESETS_DIR.glob("*.json")):
        data = json.loads(f.read_text())
        cfg = PresetConfig(**data)
        presets[cfg.id] = cfg
    return presets


def get_preset(preset_id: str) -> PresetConfig:
    presets = load_presets()
    if preset_id not in presets:
        msg = f"Unknown preset: {preset_id}. Available: {list(presets.keys())}"
        raise ValueError(msg)
    return presets[preset_id]


def list_presets() -> list[PresetConfig]:
    presets = load_presets()
    return sorted(presets.values(), key=lambda p: p.id)
