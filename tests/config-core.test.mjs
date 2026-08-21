import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIG_DEFAULTS,
  buildConfig,
  createInitialState,
  getPreviewMessages,
  importConfig,
  validateConfig,
} from "../config-core.js";

test("creates a valid basic configuration", () => {
  const state = createInitialState();
  state.friends = ["好友A", "好友B"];
  state.messages = [
    { type: "text", value: "今天也要开心" },
    { type: "sticker", value: "比心" },
  ];

  const config = buildConfig(state);

  assert.deepEqual(config.friends, ["好友A", "好友B"]);
  assert.deepEqual(config.messages, [
    { type: "text", value: "今天也要开心" },
    { type: "sticker", value: "比心" },
  ]);
  assert.deepEqual(config.stickers["比心"], {
    label: "比心",
    category: "常用",
    fallback_index: 3,
  });
  assert.equal(validateConfig(config).errors.length, 0);
});

test("imports advanced targets and preserves unknown fields", () => {
  const source = {
    task_id: "nightly",
    timezone: "Asia/Shanghai",
    targets: [
      {
        name: "好友A",
        note: "keep-target-field",
        messages: [{ type: "text", content: "晚安", tone: "warm" }],
      },
    ],
    custom_top_level: { enabled: true },
  };

  const result = importConfig(source);
  const rebuilt = buildConfig(result.state);

  assert.equal(result.state.mode, "advanced");
  assert.deepEqual(rebuilt.custom_top_level, { enabled: true });
  assert.equal(rebuilt.targets[0].note, "keep-target-field");
  assert.equal(rebuilt.targets[0].messages[0].tone, "warm");
  assert.equal(rebuilt.targets[0].messages[0].content, "晚安");
});

test("validates nested random messages with precise paths", () => {
  const config = {
    targets: [
      {
        name: "好友A",
        messages: [
          {
            type: "random",
            choices: [{ type: "random", choices: [] }],
          },
        ],
      },
    ],
  };

  const { errors } = validateConfig(config);

  assert.ok(errors.some((item) => item.path === "targets[0].messages[0].choices[0]"));
  assert.ok(errors.some((item) => item.message.includes("嵌套 random")));
});

test("rejects missing sticker mappings and invalid settings", () => {
  const config = {
    friends: ["好友A"],
    messages: [{ type: "sticker", value: "未知表情" }],
    send_interval_seconds: { min: 8, max: 3 },
    prevent_duplicates: "false",
  };

  const { errors } = validateConfig(config);

  assert.ok(errors.some((item) => item.path === "messages[0].value"));
  assert.ok(errors.some((item) => item.path === "send_interval_seconds"));
  assert.ok(errors.some((item) => item.path === "prevent_duplicates"));
});

test("normalizes aliases accepted by the Python parser", () => {
  const source = {
    friends: ["好友A"],
    messages: [
      { type: "text", content: "你好" },
      { type: "douyin_sticker", sticker: "开心" },
    ],
    stickers: {
      开心: { accessible_name: "开心", category: "常用", fallback_index: 5 },
    },
  };

  const { state } = importConfig(source);
  const config = buildConfig(state);

  assert.deepEqual(config.messages, [
    { type: "text", content: "你好" },
    { type: "douyin_sticker", sticker: "开心" },
  ]);
  assert.equal(config.stickers["开心"].accessible_name, "开心");
});

test("resolves deterministic preview choices without mutating config", () => {
  const messages = [
    { type: "text", value: "固定消息" },
    {
      type: "random",
      choices: [
        { type: "text", value: "选项一" },
        { type: "sticker", value: "比心" },
      ],
    },
  ];

  const preview = getPreviewMessages(messages, 1);

  assert.equal(preview[1].type, "sticker");
  assert.equal(preview[1].value, "比心");
  assert.equal(preview[1].fromRandom, true);
  assert.equal(messages[1].type, "random");
});

test("preserves unused imported sticker mappings", () => {
  const source = {
    friends: ["好友A"],
    messages: [{ type: "text", value: "你好" }],
    stickers: {
      备用表情: { label: "备用表情", category: "收藏", fallback_index: 17 },
    },
  };

  const { state } = importConfig(source);
  const config = buildConfig(state);

  assert.deepEqual(config.stickers["备用表情"], source.stickers["备用表情"]);
});

test("rejects ambiguous mixed basic and advanced schemas", () => {
  assert.throws(
    () => importConfig({
      friends: ["好友A"],
      messages: [{ type: "text", value: "基础消息" }],
      targets: [{ name: "好友B", messages: [{ type: "text", value: "高级消息" }] }],
    }),
    /不能同时包含 targets 和 friends\/messages/,
  );
});

test("uses parser-compatible defaults", () => {
  assert.deepEqual(CONFIG_DEFAULTS.send_interval_seconds, { min: 3, max: 8 });
  assert.equal(CONFIG_DEFAULTS.task_id, "daily-streak");
  assert.equal(CONFIG_DEFAULTS.timezone, "Asia/Shanghai");
  assert.equal(CONFIG_DEFAULTS.continue_on_error, true);
  assert.equal(CONFIG_DEFAULTS.prevent_duplicates, false);
  assert.equal(CONFIG_DEFAULTS.target_open_retries, 1);
  assert.equal(CONFIG_DEFAULTS.target_open_timeout_seconds, 15);
});
