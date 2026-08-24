export const CONFIG_DEFAULTS = Object.freeze({
  task_id: "daily-streak",
  timezone: "Asia/Shanghai",
  send_interval_seconds: Object.freeze({ min: 3, max: 8 }),
  continue_on_error: true,
  prevent_duplicates: false,
  target_open_retries: 1,
  target_open_timeout_seconds: 15,
});

export const BUILTIN_STICKERS = Object.freeze([
  { name: "嗨", label: "嗨", image: "src/image/stickers/嗨.png" },
  { name: "爱心", label: "爱心", image: "src/image/stickers/爱心.png" },
  { name: "比心", label: "比心", image: "src/image/stickers/比心.png", fallback_index: 1 },
  { name: "晚上好", label: "晚上好", image: "src/image/stickers/晚上好.png" },
  { name: "笑死", label: "笑死", image: "src/image/stickers/笑死.png" },
  { name: "续火花", label: "续火花", image: "src/image/stickers/续火花.png", fallback_index: 0 },
  { name: "在干嘛", label: "在干嘛", image: "src/image/stickers/在干嘛.png" },
  { name: "早上好", label: "早上好", image: "src/image/stickers/早上好.png" },
  { name: "早点睡", label: "早点睡", image: "src/image/stickers/早点睡.png" },
  { name: "躺平", label: "躺平", image: "src/image/stickers/躺平.png" },
]);

const ROOT_FIELDS = new Set([
  "friends",
  "messages",
  "targets",
  "stickers",
  "task_id",
  "timezone",
  "send_interval_seconds",
  "continue_on_error",
  "prevent_duplicates",
  "target_open_retries",
  "target_open_timeout_seconds",
]);

const MESSAGE_FIELDS = new Set(["type", "value", "content", "path", "sticker", "choices"]);
const TARGET_FIELDS = new Set(["name", "messages"]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);

const SECRET_KEYS = new Set([
  "authorization",
  "cookie",
  "dingtalksecret",
  "dingtalkwebhook",
  "douyincookie",
  "douyinstoragestate",
  "password",
  "secret",
  "storagestate",
  "token",
]);

function pickUnknown(source, known) {
  if (!isObject(source)) return {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => !known.has(key)).map(([key, value]) => [key, clone(value)]));
}

function defaultStickerMap() {
  return Object.fromEntries(BUILTIN_STICKERS.map((sticker) => [
    sticker.name,
    builtinStickerMapping(sticker),
  ]));
}

function builtinStickerMapping(sticker) {
  return {
    label: sticker.label,
    ...(Number.isInteger(sticker.fallback_index) ? { fallback_index: sticker.fallback_index } : {}),
  };
}

function normalizeStickerMap(raw) {
  if (!isObject(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, isObject(value) ? clone(value) : value]));
}

function normalizeMessage(raw) {
  const source = isObject(raw) ? raw : {};
  const type = source.type === "douyin_sticker" ? "douyin_sticker" : source.type;
  const extras = pickUnknown(source, MESSAGE_FIELDS);
  if (type === "text") {
    const key = own(source, "content") ? "content" : "value";
    return { type: "text", value: source[key] ?? "", sourceKey: key, extras };
  }
  if (type === "sticker" || type === "douyin_sticker") {
    const key = own(source, "sticker") ? "sticker" : "value";
    return { type, value: source[key] ?? "", sourceKey: key, extras };
  }
  if (type === "image") {
    const key = own(source, "path") ? "path" : "value";
    return { type: "image", value: source[key] ?? "", sourceKey: key, extras };
  }
  if (type === "random") {
    return {
      type: "random",
      choices: Array.isArray(source.choices) ? source.choices.map(normalizeMessage) : [],
      extras,
    };
  }
  return { type: source.type ?? "text", value: source.value ?? "", sourceKey: "value", extras };
}

function serializeMessage(message) {
  const extras = isObject(message.extras) ? clone(message.extras) : {};
  if (message.type === "random") {
    return { ...extras, type: "random", choices: (message.choices || []).map(serializeMessage) };
  }
  const key = message.sourceKey || (message.type === "text" ? "value" : message.type === "image" ? "path" : "value");
  return { ...extras, type: message.type, [key]: message.value };
}

function createDefaultMessages() {
  return [];
}

export function createInitialState() {
  return {
    mode: "basic",
    friends: [],
    messages: createDefaultMessages(),
    targets: [],
    stickers: defaultStickerMap(),
    preservedStickerNames: [],
    settings: clone(CONFIG_DEFAULTS),
    rootExtras: {},
  };
}

export function importConfig(input) {
  const source = typeof input === "string" ? JSON.parse(input) : clone(input);
  if (!isObject(source)) throw new TypeError("配置必须是 JSON 对象");

  const hasTargets = own(source, "targets") && source.targets !== null;
  if (hasTargets && (own(source, "friends") || own(source, "messages"))) {
    throw new TypeError("配置不能同时包含 targets 和 friends/messages，请保留一种格式");
  }
  const mode = hasTargets ? "advanced" : "basic";
  const state = createInitialState();
  state.mode = mode;
  state.rootExtras = pickUnknown(source, ROOT_FIELDS);
  state.settings = {
    task_id: source.task_id ?? CONFIG_DEFAULTS.task_id,
    timezone: source.timezone ?? CONFIG_DEFAULTS.timezone,
    send_interval_seconds: isObject(source.send_interval_seconds)
      ? {
          min: source.send_interval_seconds.min ?? CONFIG_DEFAULTS.send_interval_seconds.min,
          max: source.send_interval_seconds.max ?? CONFIG_DEFAULTS.send_interval_seconds.max,
        }
      : clone(CONFIG_DEFAULTS.send_interval_seconds),
    continue_on_error: source.continue_on_error ?? CONFIG_DEFAULTS.continue_on_error,
    prevent_duplicates: source.prevent_duplicates ?? CONFIG_DEFAULTS.prevent_duplicates,
    target_open_retries: source.target_open_retries ?? CONFIG_DEFAULTS.target_open_retries,
    target_open_timeout_seconds: source.target_open_timeout_seconds ?? CONFIG_DEFAULTS.target_open_timeout_seconds,
  };
  state.stickers = normalizeStickerMap(source.stickers);
  state.preservedStickerNames = Object.keys(state.stickers);

  if (mode === "advanced") {
    state.targets = (Array.isArray(source.targets) ? source.targets : []).map((target) => ({
      name: target?.name ?? "",
      messages: Array.isArray(target?.messages) ? target.messages.map(normalizeMessage) : [],
      extras: pickUnknown(target, TARGET_FIELDS),
    }));
    state.friends = state.targets.map((target) => target.name);
    state.messages = state.targets[0]?.messages || [];
  } else {
    state.friends = Array.isArray(source.friends) ? source.friends.map((friend) => typeof friend === "string" ? friend : friend) : [];
    state.messages = Array.isArray(source.messages) ? source.messages.map(normalizeMessage) : [];
    state.targets = [];
  }

  return { state, validation: validateConfig(source) };
}

export function buildConfig(state) {
  const settings = state.settings || CONFIG_DEFAULTS;
  const result = {
    ...(isObject(state.rootExtras) ? clone(state.rootExtras) : {}),
    task_id: settings.task_id,
    timezone: settings.timezone,
  };

  if (state.mode === "advanced") {
    result.targets = (state.targets || []).map((target) => ({
      ...(isObject(target.extras) ? clone(target.extras) : {}),
      name: target.name,
      messages: (target.messages || []).map(serializeMessage),
    }));
  } else {
    result.friends = (state.friends || []).map((friend) => typeof friend === "string" ? friend.trim() : friend);
    result.messages = (state.messages || []).map(serializeMessage);
  }

  const referenced = collectStickerNames(result);
  const preserved = new Set(state.preservedStickerNames || []);
  const stickerNames = [...new Set([...referenced, ...preserved])];
  if (stickerNames.length) {
    result.stickers = Object.fromEntries(stickerNames.map((name) => {
      const builtIn = BUILTIN_STICKERS.find((item) => item.name === name);
      const mapping = builtIn ? builtinStickerMapping(builtIn) : state.stickers?.[name] || {};
      return [name, clone(mapping)];
    }));
  }

  result.send_interval_seconds = {
    min: Number(settings.send_interval_seconds?.min),
    max: Number(settings.send_interval_seconds?.max),
  };
  result.continue_on_error = settings.continue_on_error;
  result.prevent_duplicates = settings.prevent_duplicates;
  result.target_open_retries = Number(settings.target_open_retries);
  result.target_open_timeout_seconds = Number(settings.target_open_timeout_seconds);
  return result;
}

function messageType(raw) {
  return raw?.type;
}

function messageValue(raw, type) {
  if (type === "text") return own(raw, "content") ? raw.content : raw.value;
  if (type === "image") return own(raw, "path") ? raw.path : raw.value;
  return own(raw, "sticker") ? raw.sticker : raw.value;
}

function validateMessages(messages, path, stickers, errors, nested = false) {
  if (!Array.isArray(messages) || messages.length === 0) {
    errors.push({ path, message: "必须是非空数组" });
    return;
  }
  messages.forEach((raw, index) => {
    const current = `${path}[${index}]`;
    if (!isObject(raw)) {
      errors.push({ path: current, message: "必须是对象" });
      return;
    }
    const type = messageType(raw);
    if (type === "text") {
      if (!nonEmpty(messageValue(raw, type))) errors.push({ path: `${current}.value`, message: "文字内容不能为空" });
      return;
    }
    if (type === "image") {
      const value = messageValue(raw, type);
      if (!nonEmpty(value)) errors.push({ path: `${current}.path`, message: "图片路径不能为空" });
      else if (!/\.(?:png|jpe?g|gif|webp)$/i.test(value.trim())) errors.push({ path: `${current}.path`, message: "仅支持 PNG、JPG、GIF、WEBP 图片" });
      return;
    }
    if (type === "sticker" || type === "douyin_sticker") {
      const value = messageValue(raw, type);
      if (!nonEmpty(value)) errors.push({ path: `${current}.value`, message: "原生表情名称不能为空" });
      else if (!isObject(stickers) || !isObject(stickers[value])) errors.push({ path: `${current}.value`, message: `原生表情“${value}”缺少 stickers 映射` });
      return;
    }
    if (type === "random") {
      if (nested) {
        errors.push({ path: current, message: "不支持嵌套 random 消息" });
        return;
      }
      validateMessages(raw.choices, `${current}.choices`, stickers, errors, true);
      return;
    }
    errors.push({ path: `${current}.type`, message: `不支持的消息类型：${String(type)}` });
  });
}

function collectStickerNames(config) {
  const names = new Set();
  const visit = (messages) => {
    if (!Array.isArray(messages)) return;
    messages.forEach((message) => {
      if (!isObject(message)) return;
      if (message.type === "sticker" || message.type === "douyin_sticker") {
        const value = messageValue(message, message.type);
        if (nonEmpty(value)) names.add(value.trim());
      }
      if (message.type === "random") visit(message.choices);
    });
  };
  if (Array.isArray(config.targets)) config.targets.forEach((target) => visit(target?.messages));
  else visit(config.messages);
  return names;
}

export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  if (!isObject(config)) return { errors: [{ path: "$", message: "配置必须是 JSON 对象" }], warnings };

  const stickers = config.stickers ?? {};
  if (!isObject(stickers)) errors.push({ path: "stickers", message: "必须是对象" });
  else {
    Object.entries(stickers).forEach(([name, item]) => {
      if (!nonEmpty(name) || !isObject(item)) {
        errors.push({ path: `stickers.${name}`, message: "名称必须非空，映射必须是对象" });
        return;
      }
      if (own(item, "fallback_index") && (!Number.isInteger(item.fallback_index) || item.fallback_index < 0)) {
        errors.push({ path: `stickers.${name}.fallback_index`, message: "必须是非负整数" });
      }
    });
  }

  const hasTargets = own(config, "targets") && config.targets !== null;
  if (hasTargets && !Array.isArray(config.targets)) {
    errors.push({ path: "targets", message: "必须是非空数组" });
  } else if (hasTargets) {
    if (config.targets.length === 0) errors.push({ path: "targets", message: "必须是非空数组" });
    const names = [];
    config.targets.forEach((target, index) => {
      const path = `targets[${index}]`;
      if (!isObject(target)) {
        errors.push({ path, message: "必须是对象" });
        return;
      }
      if (!nonEmpty(target.name)) errors.push({ path: `${path}.name`, message: "好友昵称不能为空" });
      else names.push(target.name.trim());
      validateMessages(target.messages, `${path}.messages`, stickers, errors);
    });
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    [...new Set(duplicates)].forEach((name) => warnings.push({ path: "targets", message: `好友“${name}”重复出现` }));
  } else {
    if (!Array.isArray(config.friends) || config.friends.length === 0) errors.push({ path: "friends", message: "必须是非空数组" });
    else {
      const names = [];
      config.friends.forEach((friend, index) => {
        if (!nonEmpty(friend)) errors.push({ path: `friends[${index}]`, message: "好友昵称不能为空" });
        else names.push(friend.trim());
      });
      const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
      [...new Set(duplicates)].forEach((name) => warnings.push({ path: "friends", message: `好友“${name}”重复出现` }));
    }
    validateMessages(config.messages, "messages", stickers, errors);
  }

  if (own(config, "task_id") && !nonEmpty(config.task_id)) errors.push({ path: "task_id", message: "必须是非空字符串" });
  if (own(config, "timezone") && !nonEmpty(config.timezone)) errors.push({ path: "timezone", message: "必须是非空字符串" });
  if (own(config, "send_interval_seconds")) {
    const interval = config.send_interval_seconds;
    if (!isObject(interval) || !finiteNumber(interval.min) || !finiteNumber(interval.max) || interval.min < 0 || interval.max < interval.min) {
      errors.push({ path: "send_interval_seconds", message: "发送间隔必须满足 0 <= min <= max" });
    }
  }
  ["continue_on_error", "prevent_duplicates"].forEach((key) => {
    if (own(config, key) && typeof config[key] !== "boolean") errors.push({ path: key, message: "必须是布尔值" });
  });
  if (own(config, "target_open_retries") && (!Number.isInteger(config.target_open_retries) || config.target_open_retries < 0)) {
    errors.push({ path: "target_open_retries", message: "必须是非负整数" });
  }
  if (own(config, "target_open_timeout_seconds") && (!finiteNumber(config.target_open_timeout_seconds) || config.target_open_timeout_seconds <= 0)) {
    errors.push({ path: "target_open_timeout_seconds", message: "必须大于 0" });
  }

  const secretPath = findSecretPath(config);
  if (secretPath) errors.push({ path: secretPath, message: "检测到疑似登录凭证。此页面只生成 DOUYIN_CONFIG，请移除 Cookie 或密钥。" });
  return { errors, warnings };
}

function findSecretPath(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = findSecretPath(value[index], `${path}[${index}]`);
      if (result) return result;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const childPath = path === "$" ? key : `${path}.${key}`;
    if (SECRET_KEYS.has(normalized)) return childPath;
    const result = findSecretPath(child, childPath);
    if (result) return result;
  }
  return null;
}

export function convertToAdvanced(state) {
  if (state.mode === "advanced") return clone(state);
  return {
    ...clone(state),
    mode: "advanced",
    targets: (state.friends || []).map((name) => ({ name, messages: clone(state.messages), extras: {} })),
  };
}

export function canConvertToBasic(state) {
  if (state.mode === "basic") return true;
  if (!state.targets?.length) return true;
  const first = JSON.stringify(state.targets[0].messages || []);
  return state.targets.every((target) => JSON.stringify(target.messages || []) === first && Object.keys(target.extras || {}).length === 0);
}

export function convertToBasic(state) {
  if (state.mode === "basic") return clone(state);
  if (!canConvertToBasic(state)) throw new Error("只有所有好友消息完全一致时才能转为基础模式");
  return {
    ...clone(state),
    mode: "basic",
    friends: (state.targets || []).map((target) => target.name),
    messages: clone(state.targets?.[0]?.messages || []),
    targets: [],
  };
}

export function getPreviewMessages(messages, randomChoiceIndex = 0) {
  return (messages || []).map((message) => {
    if (message.type !== "random") return clone(message);
    const choices = message.choices || [];
    if (!choices.length) return { type: "text", value: "随机消息尚未添加选项", fromRandom: true };
    const index = Math.abs(Number(randomChoiceIndex) || 0) % choices.length;
    return { ...clone(choices[index]), fromRandom: true };
  });
}

export function formatConfig(config) {
  return JSON.stringify(config, null, 2);
}
