import {
  BUILTIN_STICKERS,
  CONFIG_DEFAULTS,
  buildConfig,
  canConvertToBasic,
  convertToAdvanced,
  convertToBasic,
  createInitialState,
  formatConfig,
  getPreviewMessages,
  importConfig,
  validateConfig,
} from "./config-core.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));

let state = createInitialState();
let selectedTargetIndex = 0;
let composingType = "text";
let randomPreviewIndex = 0;
let rawIsDirty = false;
let importRequestId = 0;
const replayTimers = new Set();

const elements = {
  friendsInput: $("#friendsInput"),
  friendCount: $("#friendCount"),
  messageCount: $("#messageCount"),
  basicFriendsEditor: $("#basicFriendsEditor"),
  advancedTargetsEditor: $("#advancedTargetsEditor"),
  messageInput: $("#messageInput"),
  characterCount: $("#characterCount"),
  stickerGrid: $("#stickerGrid"),
  stickerSearch: $("#stickerSearch"),
  messageList: $("#messageList"),
  randomChoicesInput: $("#randomChoicesInput"),
  taskIdInput: $("#taskIdInput"),
  timezoneInput: $("#timezoneInput"),
  intervalMinInput: $("#intervalMinInput"),
  intervalMaxInput: $("#intervalMaxInput"),
  retryInput: $("#retryInput"),
  timeoutInput: $("#timeoutInput"),
  continueToggle: $("#continueToggle"),
  duplicateToggle: $("#duplicateToggle"),
  rawEditor: $("#rawEditor"),
  rawStatus: $("#rawStatus"),
  chatStream: $("#chatStream"),
  previewFriendName: $("#previewFriendName"),
  previewFriendsCount: $("#previewFriendsCount"),
  previewMessagesCount: $("#previewMessagesCount"),
  previewDuration: $("#previewDuration"),
  validationPanel: $("#validationPanel"),
  validationTitle: $("#validationTitle"),
  validationSubtitle: $("#validationSubtitle"),
  validationDetails: $("#validationDetails"),
  importDialog: $("#importDialog"),
  importText: $("#importText"),
  importError: $("#importError"),
  stickerDialog: $("#stickerDialog"),
  stickerError: $("#stickerError"),
  fileInput: $("#fileInput"),
  dropOverlay: $("#dropOverlay"),
  toastRegion: $("#toastRegion"),
};

function currentMessages() {
  if (state.mode === "advanced") return state.targets[selectedTargetIndex]?.messages || [];
  return state.messages;
}

function setCurrentMessages(messages) {
  if (state.mode === "advanced") {
    if (state.targets[selectedTargetIndex]) state.targets[selectedTargetIndex].messages = messages;
  } else {
    state.messages = messages;
  }
}

function currentFriends() {
  return state.mode === "advanced" ? state.targets.map((target) => target.name) : state.friends;
}

function currentFriendName() {
  return currentFriends()[state.mode === "advanced" ? selectedTargetIndex : 0] || "好友昵称";
}

function stickerSymbol(name) {
  return BUILTIN_STICKERS.find((sticker) => sticker.name === name)?.symbol || "◇";
}

function icon(name, size = 17) {
  return `<svg aria-hidden="true" width="${size}" height="${size}"><use href="#icon-${name}"></use></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function parseFriends(value) {
  return value.split(/[\n,，]/).map((name) => name.trim()).filter(Boolean);
}

function parseLines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function updateSettingsFromForm() {
  state.settings = {
    task_id: elements.taskIdInput.value,
    timezone: elements.timezoneInput.value,
    send_interval_seconds: {
      min: elements.intervalMinInput.valueAsNumber,
      max: elements.intervalMaxInput.valueAsNumber,
    },
    continue_on_error: elements.continueToggle.checked,
    prevent_duplicates: elements.duplicateToggle.checked,
    target_open_retries: elements.retryInput.valueAsNumber,
    target_open_timeout_seconds: elements.timeoutInput.valueAsNumber,
  };
}

function renderSettings() {
  const settings = state.settings;
  elements.taskIdInput.value = settings.task_id;
  elements.timezoneInput.value = settings.timezone;
  elements.intervalMinInput.value = settings.send_interval_seconds.min;
  elements.intervalMaxInput.value = settings.send_interval_seconds.max;
  elements.retryInput.value = settings.target_open_retries;
  elements.timeoutInput.value = settings.target_open_timeout_seconds;
  elements.continueToggle.checked = settings.continue_on_error;
  elements.duplicateToggle.checked = settings.prevent_duplicates;
}

function renderTargets() {
  elements.basicFriendsEditor.hidden = state.mode !== "basic";
  elements.advancedTargetsEditor.hidden = state.mode !== "advanced";
  if (state.mode === "basic") {
    elements.friendsInput.value = state.friends.join("\n");
    return;
  }
  if (selectedTargetIndex >= state.targets.length) selectedTargetIndex = Math.max(0, state.targets.length - 1);
  const selected = state.targets[selectedTargetIndex];
  const tabs = state.targets.map((target, index) => `
    <button class="target-chip ${index === selectedTargetIndex ? "is-active" : ""}" type="button" data-target-select="${index}" aria-pressed="${index === selectedTargetIndex}">
      <span>${index + 1}</span>${escapeHtml(target.name || `好友 ${index + 1}`)}<small>${target.messages.length}</small>
    </button>
  `).join("");
  elements.advancedTargetsEditor.innerHTML = `
    <div class="target-toolbar">
      <div class="target-tabs" aria-label="高级模式好友">${tabs || '<span class="empty-inline">尚未添加好友</span>'}</div>
      <button class="button button-secondary" id="addTargetButton" type="button">${icon("plus")}添加好友</button>
    </div>
    ${selected ? `<div class="target-edit-box">
      <div>
        <label class="field-label" for="selectedTargetName">当前好友昵称</label>
        <input id="selectedTargetName" data-target-name="${selectedTargetIndex}" value="${escapeHtml(selected.name)}" placeholder="好友昵称">
        <div class="input-footer"><span>下方发送队列只属于当前好友</span><span>${selected.messages.length} 条消息</span></div>
      </div>
      <div class="target-actions">
        <button class="mini-button" type="button" data-target-move="up" data-target-index="${selectedTargetIndex}" title="上移好友" aria-label="上移好友" ${selectedTargetIndex === 0 ? "disabled" : ""}>${icon("up")}</button>
        <button class="mini-button" type="button" data-target-move="down" data-target-index="${selectedTargetIndex}" title="下移好友" aria-label="下移好友" ${selectedTargetIndex === state.targets.length - 1 ? "disabled" : ""}>${icon("down")}</button>
        <button class="mini-button danger" type="button" data-target-remove="${selectedTargetIndex}" title="删除好友" aria-label="删除当前好友">${icon("trash")}</button>
      </div>
    </div>` : '<div class="empty-state"><strong>还没有好友</strong><span>添加好友后即可编排专属消息</span></div>'}
  `;
}

function renderStickerGrid() {
  const query = elements.stickerSearch.value.trim().toLowerCase();
  const builtin = BUILTIN_STICKERS.filter((sticker) => sticker.name.toLowerCase().includes(query));
  const custom = Object.keys(state.stickers || {})
    .filter((name) => !BUILTIN_STICKERS.some((item) => item.name === name))
    .filter((name) => name.toLowerCase().includes(query))
    .map((name) => ({ name, label: state.stickers[name]?.label || state.stickers[name]?.accessible_name || name, symbol: "◇" }));
  const stickers = [...builtin, ...custom];
  elements.stickerGrid.innerHTML = stickers.length ? stickers.map((sticker) => {
    const mapping = state.stickers?.[sticker.name] || {};
    const category = mapping.category || sticker.category || "自定义";
    return `
      <button class="sticker-option" type="button" data-sticker="${escapeHtml(sticker.name)}" aria-label="添加原生表情 ${escapeHtml(sticker.name)}">
        <span class="sticker-symbol" aria-hidden="true">${sticker.symbol}</span>
        <strong>${escapeHtml(sticker.name)}</strong>
        <small>${escapeHtml(category)}</small>
      </button>
    `;
  }).join("") : `<div class="empty-state" style="grid-column:1/-1"><strong>没有匹配的表情</strong><span>可以添加自定义映射</span></div>`;
}

function messageSummary(message) {
  if (message.type === "text") return { typeLabel: "文字", content: message.value || "空文字消息", note: "按顺序发送" };
  if (message.type === "sticker" || message.type === "douyin_sticker") return { typeLabel: "原生表情", content: `${stickerSymbol(message.value)}  ${message.value || "未选择表情"}`, note: "运行时打开抖音表情面板" };
  if (message.type === "random") return { typeLabel: "随机", content: `${message.choices?.length || 0} 个候选项`, note: "运行时随机选择一条" };
  if (message.type === "image") return { typeLabel: "图片", content: message.value || "图片路径", note: "从配置路径读取图片" };
  return { typeLabel: "未知", content: `未知类型：${message.type}`, note: "请在原始 JSON 中修改" };
}

function renderMessages() {
  const messages = currentMessages();
  elements.messageList.innerHTML = messages.length ? messages.map((message, index) => {
    const summary = messageSummary(message);
    return `
      <article class="message-item" data-message-index="${index}">
        <span class="message-number" aria-label="第 ${index + 1} 条消息">${String(index + 1).padStart(2, "0")}</span>
        <div class="message-copy">
          <strong>${escapeHtml(summary.typeLabel)}</strong>
          <p>${escapeHtml(summary.content)}</p>
          <small>${escapeHtml(summary.note)}</small>
        </div>
        <div class="message-actions">
          <button class="mini-button" type="button" data-message-move="up" data-message-index="${index}" aria-label="上移消息" title="上移" ${index === 0 ? "disabled" : ""}>${icon("up")}</button>
          <button class="mini-button" type="button" data-message-move="down" data-message-index="${index}" aria-label="下移消息" title="下移" ${index === messages.length - 1 ? "disabled" : ""}>${icon("down")}</button>
          <button class="mini-button" type="button" data-message-duplicate="${index}" aria-label="复制消息" title="复制">${icon("copy")}</button>
          <button class="mini-button danger" type="button" data-message-remove="${index}" aria-label="删除消息" title="删除">${icon("trash")}</button>
        </div>
      </article>`;
  }).join("") : `<div class="empty-state"><strong>发送队列为空</strong><span>从上方添加文字、原生表情或随机消息</span></div>`;
}

function buildSafeConfig() {
  updateSettingsFromForm();
  return buildConfig(state);
}

function renderValidation(config) {
  const validation = validateConfig(config);
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = !hasErrors && validation.warnings.length > 0;
  elements.validationPanel.classList.toggle("has-errors", hasErrors);
  elements.validationPanel.classList.toggle("has-warnings", hasWarnings);
  elements.validationTitle.textContent = hasErrors ? `${validation.errors.length} 个配置错误` : hasWarnings ? `${validation.warnings.length} 条提醒` : "配置有效";
  elements.validationSubtitle.textContent = hasErrors ? "修正后才能复制配置" : hasWarnings ? "提醒不会阻止复制" : "可以复制配置";
  const items = [...validation.errors, ...validation.warnings];
  elements.validationDetails.innerHTML = items.length ? items.map((item) => `<p class="validation-item"><code>${escapeHtml(item.path)}</code>：${escapeHtml(item.message)}</p>`).join("") : `<p class="validation-item">没有发现问题，当前配置可直接使用。</p>`;
  $("#copyTopButton").disabled = hasErrors;
  return validation;
}

function renderRaw(config, force = false) {
  if (!rawIsDirty || force) {
    elements.rawEditor.value = formatConfig(config);
    rawIsDirty = false;
    elements.rawStatus.textContent = "与可视化表单同步";
  }
}

function renderPreview(config, animate = false) {
  replayTimers.forEach((timer) => window.clearTimeout(timer));
  replayTimers.clear();
  const messages = getPreviewMessages(currentMessages(), randomPreviewIndex);
  elements.previewFriendName.textContent = currentFriendName();
  elements.previewFriendsCount.textContent = currentFriends().length;
  elements.previewMessagesCount.textContent = messages.length;
  const interval = config.send_interval_seconds;
  elements.previewDuration.textContent = interval.min === interval.max ? `${interval.min} 秒` : `${interval.min}–${interval.max} 秒`;

  elements.chatStream.innerHTML = `<p class="chat-date">今天 09:41</p>`;
  const appendMessage = (message, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-row";
    wrapper.style.animationDelay = animate ? "0ms" : `${index * 55}ms`;
    const randomLabel = message.fromRandom ? `<span class="random-label">本次随机预览</span>` : "";
    if (message.type === "sticker" || message.type === "douyin_sticker") {
      wrapper.innerHTML = `<div class="chat-bubble is-sticker" title="实际发送抖音原生表情：${escapeHtml(message.value)}"><span class="preview-symbol">${escapeHtml(stickerSymbol(message.value))}</span><small>${escapeHtml(message.value)} · 原生表情</small>${randomLabel}</div>`;
    } else if (message.type === "image") {
      wrapper.innerHTML = `<div class="chat-bubble">${icon("file", 18)}<span>图片：${escapeHtml(message.value)}</span>${randomLabel}</div>`;
    } else {
      wrapper.innerHTML = `<div class="chat-bubble">${escapeHtml(message.value).replace(/\n/g, "<br>")}${randomLabel}</div>`;
    }
    elements.chatStream.append(wrapper);
  };
  if (animate) {
    messages.forEach((message, index) => {
      const timer = window.setTimeout(() => {
        replayTimers.delete(timer);
        appendMessage(message, index);
      }, index * 430);
      replayTimers.add(timer);
    });
  } else {
    messages.forEach(appendMessage);
  }
}

function renderCounts() {
  const friendCount = currentFriends().length;
  const messageCount = currentMessages().length;
  elements.friendCount.textContent = `${friendCount} 位好友`;
  elements.messageCount.textContent = `${messageCount} 条消息`;
}

function sync({ forceRaw = false, animate = false, renderTargetEditors = true } = {}) {
  const config = buildSafeConfig();
  renderCounts();
  renderMessages();
  if (renderTargetEditors) renderTargets();
  renderStickerGrid();
  renderValidation(config);
  renderRaw(config, forceRaw);
  renderPreview(config, animate);
}

function showToast(message, error = false) {
  const toast = document.createElement("div");
  toast.className = `toast${error ? " is-error" : ""}`;
  toast.innerHTML = `${icon(error ? "info" : "shield")}<span>${escapeHtml(message)}</span>`;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function addMessage(message) {
  const messages = [...currentMessages(), message];
  setCurrentMessages(messages);
  randomPreviewIndex += 1;
  sync({ animate: true });
}

function moveItem(items, index, direction) {
  const nextIndex = index + (direction === "up" ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const result = [...items];
  [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  return result;
}

function setComposer(type) {
  composingType = type;
  $$(".composer-tab").forEach((button) => {
    const active = button.dataset.compose === type;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#textComposer").hidden = type !== "text";
  $("#stickerComposer").hidden = type !== "sticker";
  $("#randomComposer").hidden = type !== "random";
  if (type === "text") elements.messageInput.focus();
  if (type === "sticker") elements.stickerSearch.focus();
}

function switchMode(mode) {
  if (mode === state.mode) return;
  if (mode === "advanced") {
    state = convertToAdvanced(state);
  } else {
    if (!canConvertToBasic(state)) {
      showToast("每位好友的消息不同，无法无损切换到基础模式", true);
      return;
    }
    state = convertToBasic(state);
  }
  selectedTargetIndex = 0;
  $$(".format-option").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.mode));
  sync();
}

function applyImportedConfig(raw) {
  const result = importConfig(raw);
  if (result.validation.errors.length) {
    const first = result.validation.errors[0];
    throw new TypeError(`${first.path}：${first.message}`);
  }
  state = result.state;
  selectedTargetIndex = 0;
  rawIsDirty = false;
  $$(".format-option").forEach((button) => button.classList.toggle("is-active", button.dataset.mode === state.mode));
  renderSettings();
  sync({ forceRaw: true, animate: true });
  showToast("配置导入成功");
}

async function readFile(file) {
  if (!file) return;
  const requestId = ++importRequestId;
  if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
    showToast("请选择 JSON 文件", true);
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast("JSON 文件不能超过 2 MB", true);
    return;
  }
  try {
    const text = await file.text();
    if (requestId !== importRequestId) return;
    applyImportedConfig(JSON.parse(text));
    elements.importDialog.close();
  } catch (error) {
    showToast(`导入失败：${error.message}`, true);
  }
}

async function copyConfig() {
  const config = buildSafeConfig();
  const validation = validateConfig(config);
  if (validation.errors.length) return showToast("请先修正配置错误", true);
  try {
    await navigator.clipboard.writeText(formatConfig(config));
    showToast("已复制，可直接粘贴到 DOUYIN_CONFIG");
  } catch {
    elements.rawEditor.select();
    document.execCommand("copy");
    showToast("已复制配置 JSON");
  }
}

function bindEvents() {
  elements.friendsInput.addEventListener("input", () => {
    state.friends = parseFriends(elements.friendsInput.value);
    sync({ renderTargetEditors: false });
  });
  $("#cleanFriendsButton").addEventListener("click", () => {
    state.friends = [...new Set(parseFriends(elements.friendsInput.value))];
    sync();
    showToast("好友列表已清理");
  });
  elements.messageInput.addEventListener("input", () => { elements.characterCount.textContent = `${elements.messageInput.value.length} / 500`; });
  elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("#addTextButton").click();
    }
  });
  $("#addTextButton").addEventListener("click", () => {
    const value = elements.messageInput.value.trim();
    if (!value) return showToast("请先输入消息内容", true);
    addMessage({ type: "text", value, sourceKey: "value", extras: {} });
    elements.messageInput.value = "";
    elements.characterCount.textContent = "0 / 500";
    elements.messageInput.focus();
  });
  $("#addRandomButton").addEventListener("click", () => {
    const choices = parseLines(elements.randomChoicesInput.value).map((value) => ({ type: "text", value, sourceKey: "value", extras: {} }));
    if (!choices.length) return showToast("至少添加一个随机候选项", true);
    addMessage({ type: "random", choices, extras: {} });
    elements.randomChoicesInput.value = "";
  });
  $$(".composer-tab").forEach((button) => button.addEventListener("click", () => setComposer(button.dataset.compose)));
  elements.stickerGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sticker]");
    if (!button) return;
    addMessage({ type: "sticker", value: button.dataset.sticker, sourceKey: "value", extras: {} });
    showToast(`已添加原生表情“${button.dataset.sticker}”`);
  });
  elements.stickerSearch.addEventListener("input", renderStickerGrid);
  elements.messageList.addEventListener("click", (event) => {
    const action = event.target.closest("button");
    if (!action) return;
    const messages = currentMessages();
    const index = Number(action.dataset.messageIndex ?? action.dataset.messageRemove ?? action.dataset.messageDuplicate);
    if (action.dataset.messageMove) setCurrentMessages(moveItem(messages, index, action.dataset.messageMove));
    if (action.dataset.messageRemove !== undefined) setCurrentMessages(messages.filter((_, itemIndex) => itemIndex !== index));
    if (action.dataset.messageDuplicate !== undefined) {
      const copy = clone(messages[index]);
      const next = [...messages];
      next.splice(index + 1, 0, copy);
      setCurrentMessages(next);
    }
    sync();
  });
  $$(".format-option").forEach((button) => button.addEventListener("click", () => switchMode(button.dataset.mode)));
  elements.advancedTargetsEditor.addEventListener("input", (event) => {
    if (event.target.dataset.targetName === undefined) return;
    state.targets[Number(event.target.dataset.targetName)].name = event.target.value;
    sync({ renderTargetEditors: false });
  });
  elements.advancedTargetsEditor.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.id === "addTargetButton") {
      state.targets.push({ name: `好友 ${state.targets.length + 1}`, messages: clone(currentMessages()), extras: {} });
      selectedTargetIndex = state.targets.length - 1;
    } else if (button.dataset.targetSelect !== undefined) {
      selectedTargetIndex = Number(button.dataset.targetSelect);
    } else if (button.dataset.targetRemove !== undefined) {
      state.targets.splice(Number(button.dataset.targetRemove), 1);
      selectedTargetIndex = Math.min(selectedTargetIndex, Math.max(0, state.targets.length - 1));
    } else if (button.dataset.targetMove) {
      const index = Number(button.dataset.targetIndex);
      state.targets = moveItem(state.targets, index, button.dataset.targetMove);
      selectedTargetIndex = index + (button.dataset.targetMove === "up" ? -1 : 1);
    }
    sync();
  });

  [elements.taskIdInput, elements.timezoneInput, elements.intervalMinInput, elements.intervalMaxInput, elements.retryInput, elements.timeoutInput].forEach((input) => input.addEventListener("input", () => sync()));
  [elements.continueToggle, elements.duplicateToggle].forEach((input) => input.addEventListener("change", () => sync()));
  $("#resetSettingsButton").addEventListener("click", () => {
    state.settings = clone(CONFIG_DEFAULTS);
    renderSettings();
    sync();
    showToast("已恢复默认运行设置");
  });
  elements.rawEditor.addEventListener("input", () => {
    rawIsDirty = true;
    elements.rawStatus.textContent = "有尚未应用的 JSON 修改";
  });
  $("#applyRawButton").addEventListener("click", () => {
    try {
      applyImportedConfig(JSON.parse(elements.rawEditor.value));
    } catch (error) {
      elements.rawStatus.textContent = `JSON 错误：${error.message}`;
      showToast("JSON 格式无效", true);
    }
  });
  $("#toggleValidationButton").addEventListener("click", () => {
    elements.validationDetails.hidden = !elements.validationDetails.hidden;
    $("#toggleValidationButton").setAttribute("aria-expanded", String(!elements.validationDetails.hidden));
  });
  $("#replayButton").addEventListener("click", () => {
    randomPreviewIndex += 1;
    renderPreview(buildSafeConfig(), true);
  });
  $("#copyTopButton").addEventListener("click", copyConfig);
  $("#importButton").addEventListener("click", () => {
    elements.importError.textContent = "";
    elements.importDialog.showModal();
  });
  $("#confirmImportButton").addEventListener("click", () => {
    try {
      if (!elements.importText.value.trim()) throw new Error("请粘贴 JSON 或选择文件");
      applyImportedConfig(JSON.parse(elements.importText.value));
      elements.importDialog.close();
      elements.importText.value = "";
    } catch (error) {
      elements.importError.textContent = error.message;
    }
  });
  $("#importDropzone").addEventListener("click", () => elements.fileInput.click());
  $("#importDropzone").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); elements.fileInput.click(); }
  });
  elements.fileInput.addEventListener("change", () => {
    const [file] = elements.fileInput.files;
    elements.fileInput.value = "";
    readFile(file);
  });

  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => { event.preventDefault(); dragDepth += 1; elements.dropOverlay.hidden = false; });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragleave", () => { dragDepth -= 1; if (dragDepth <= 0) { dragDepth = 0; elements.dropOverlay.hidden = true; } });
  window.addEventListener("drop", (event) => { event.preventDefault(); dragDepth = 0; elements.dropOverlay.hidden = true; readFile(event.dataTransfer.files[0]); });

  $("#customStickerButton").addEventListener("click", () => { elements.stickerError.textContent = ""; elements.stickerDialog.showModal(); });
  $("#saveStickerButton").addEventListener("click", () => {
    const name = $("#customStickerName").value.trim();
    const label = $("#customStickerLabel").value.trim() || name;
    const category = $("#customStickerCategory").value.trim();
    const fallbackIndex = $("#customStickerIndex").valueAsNumber;
    if (!name || !Number.isInteger(fallbackIndex) || fallbackIndex < 0) {
      elements.stickerError.textContent = "名称不能为空，备用序号必须是非负整数。";
      return;
    }
    state.stickers[name] = { label, ...(category ? { category } : {}), fallback_index: fallbackIndex };
    state.preservedStickerNames = [...new Set([...(state.preservedStickerNames || []), name])];
    addMessage({ type: "sticker", value: name, sourceKey: "value", extras: {} });
    elements.stickerDialog.close();
  });
  $("#themeButton").addEventListener("click", () => {
    const explicitTheme = document.documentElement.dataset.theme;
    const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = explicitTheme ? "system" : systemIsDark ? "light" : "dark";
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
    const label = next === "system"
      ? "当前跟随系统，点击手动切换主题"
      : `当前为${next === "dark" ? "深色" : "浅色"}主题，点击恢复跟随系统`;
    $("#themeButton").setAttribute("aria-label", label);
    $("#themeButton").title = label;
    try { localStorage.setItem("config-theme", next); } catch {}
  });
  $$(".step-tab").forEach((button) => button.addEventListener("click", () => {
    document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: "smooth", block: "start" });
    $$(".step-tab").forEach((item) => item.classList.toggle("is-active", item === button));
  }));
  const composerTabs = $$(".composer-tab");
  composerTabs.forEach((button, index) => button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? composerTabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + composerTabs.length) % composerTabs.length;
    composerTabs[nextIndex].focus();
    setComposer(composerTabs[nextIndex].dataset.compose);
  }));
}

function initialize() {
  try {
    const theme = localStorage.getItem("config-theme");
    if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  } catch {}
  renderSettings();
  bindEvents();
  sync({ forceRaw: true, animate: true });
}

initialize();
