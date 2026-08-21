from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import load_task
from app.models import Settings


def settings_for(path: Path) -> Settings:
    return Settings(
        task_config_path=path,
        storage_state='{"cookies": [], "origins": []}',
        cookie=None,
        headless=True,
        browser_path=None,
        artifacts_dir=path.parent / "artifacts",
        trace=False,
    )


def main() -> None:
    payloads = [
        {
            "task_id": "daily-streak",
            "timezone": "Asia/Shanghai",
            "friends": ["好友A", "好友B"],
            "messages": [
                {"type": "text", "value": "今天也要开心"},
                {"type": "sticker", "value": "比心"},
                {
                    "type": "random",
                    "choices": [
                        {"type": "text", "value": "早上好"},
                        {"type": "douyin_sticker", "sticker": "开心"},
                    ],
                },
            ],
            "stickers": {
                "比心": {"label": "比心", "category": "常用", "fallback_index": 3},
                "开心": {"label": "开心", "category": "常用", "fallback_index": 5},
            },
            "send_interval_seconds": {"min": 3, "max": 8},
            "continue_on_error": True,
            "prevent_duplicates": False,
            "target_open_retries": 1,
            "target_open_timeout_seconds": 15,
        },
        {
            "task_id": "advanced-preview",
            "timezone": "Asia/Shanghai",
            "targets": [
                {
                    "name": "好友A",
                    "messages": [
                        {"type": "text", "content": "专属消息"},
                        {"type": "douyin_sticker", "sticker": "点赞"},
                    ],
                },
                {"name": "好友B", "messages": [{"type": "text", "value": "另一条消息"}]},
            ],
            "stickers": {"点赞": {"accessible_name": "点赞", "fallback_index": 1}},
        },
    ]

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for index, payload in enumerate(payloads):
            path = root / f"config-{index}.json"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            task = load_task(settings_for(path))
            assert task.targets
            assert all(target.messages for target in task.targets)

    print(f"Python parser compatibility: {len(payloads)} generated configuration shapes passed")


if __name__ == "__main__":
    main()
