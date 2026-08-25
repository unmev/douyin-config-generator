import {
  BUILTIN_STICKERS,
  CONFIG_DEFAULTS,
  buildConfig,
  canConvertToBasic,
  convertToAdvanced,
  convertToBasic,
  createInitialState,
  formatConfig,
  importConfig,
  validateConfig,
} from "./config-core.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const STORAGE_KEY = "douyin-config-editor-draft-v1";

let state = createInitialState();
let selectedTargetIndex = 0;
let composingType = "text";
let importRequestId = 0;
let draggedMessageId = null;
let nextUiId = 1;
let isInitializing = true;
let hasUnsavedChanges = false;
let storageWarningShown = false;

const elements = {
  friendNameInput: $("#friendNameInput"),
  friendList: $("#friendList"),
  friendCount: $("#friendCount"),
  messageCount: $("#messageCount"),
  messageInput: $("#messageInput"),
  stickerGrid: $("#stickerGrid"),
  messageList: $("#messageList"),
  randomChoicesInput: $("#randomChoicesInput"),
  taskIdInput: $("#taskIdInput"),
  timezoneInput: $("#timezoneInput"),
  intervalMinInput: $("#intervalMinInput"),
  intervalMaxInput: $("#intervalMaxInput"),
  intervalMinValue: $("#intervalMinValue"),
  intervalMaxValue: $("#intervalMaxValue"),
  intervalRangeFill: $("#intervalRangeFill"),
  retryInput: $("#retryInput"),
  timeoutInput: $("#timeoutInput"),
  continueToggle: $("#continueToggle"),
  duplicateToggle: $("#duplicateToggle"),
  importText: $("#importText"),
  importError: $("#importError"),
  fileInput: $("#fileInput"),
  dropOverlay: $("#dropOverlay"),
  toastRegion: $("#toastRegion"),
  resetConfigButton: $("#resetConfigButton"),
  importFileButton: $("#importFileButton"),
  importClipboardButton: $("#importClipboardButton"),
  pasteImportPanel: $("#pasteImportPanel"),
  cronButton: $("#cronButton"),
  cronDialog: $("#cronDialog"),
  cronTimeInput: $("#cronTimeInput"),
  cronOutput: $("#cronOutput"),
  cronWarning: $("#cronWarning"),
  copyCronButton: $("#copyCronButton"),
  completeButton: $("#completeButton"),
  completeDialog: $("#completeDialog"),
  clearDialog: $("#clearDialog"),
  completeError: $("#completeError"),
  copyConfigButton: $("#copyConfigButton"),
  downloadConfigButton: $("#downloadConfigButton"),
  confirmClearButton: $("#confirmClearButton"),
  wizardError: $("#wizardError"),
  validationList: $("#validationList"),
  generateHint: $("#generateHint"),
  statusPanel: $(".panel-status"),
};

function icon(name, size = 17) {
  return `<svg aria-hidden="true" width="${size}" height="${size}"><use href="#icon-${name}"></use></svg>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function parseLines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function stripRuntimeFields(value) {
  if (Array.isArray(value)) return value.map(stripRuntimeFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "uiId")
      .map(([key, child]) => [key, stripRuntimeFields(child)]),
  );
}

function isStateDraft(value) {
  return Boolean(
    value
    && typeof value === "object"
    && ["basic", "advanced"].includes(value.mode)
    && Array.isArray(value.friends)
    && Array.isArray(value.messages)
    && Array.isArray(value.targets)
    && value.settings
    && typeof value.settings === "object"
    && value.settings.send_interval_seconds
    && typeof value.settings.send_interval_seconds === "object",
  );
}

function saveDraft() {
  if (isInitializing) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state: stripRuntimeFields(state),
      selectedTargetIndex,
      composingType,
    }));
  } catch {
    if (!storageWarningShown) {
      storageWarningShown = true;
      showToast("浏览器缓存写入失败", true);
    }
  }
}

function loadDraft() {
  try {
    const draft = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!draft || draft.version !== 1 || !isStateDraft(draft.state)) return false;
    state = draft.state;
    selectedTargetIndex = Number.isInteger(draft.selectedTargetIndex) ? Math.max(0, draft.selectedTargetIndex) : 0;
    composingType = ["text", "sticker", "random"].includes(draft.composingType) ? draft.composingType : "text";
    return true;
  } catch {
    return false;
  }
}

function markDirty() {
  if (!isInitializing) hasUnsavedChanges = true;
}

function markSaved() {
  hasUnsavedChanges = false;
}

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

function ensureUiId(message) {
  if (!message.uiId) {
    message.uiId = `m${nextUiId}`;
    nextUiId += 1;
  }
  return message.uiId;
}

function updateSettingsFromForm() {
  const min = Number(elements.intervalMinInput.value);
  const max = Number(elements.intervalMaxInput.value);
  state.settings = {
    task_id: elements.taskIdInput.value,
    timezone: elements.timezoneInput.value,
    send_interval_seconds: { min, max },
    continue_on_error: elements.continueToggle.checked,
    prevent_duplicates: elements.duplicateToggle.checked,
    target_open_retries: elements.retryInput.valueAsNumber,
    target_open_timeout_seconds: elements.timeoutInput.valueAsNumber,
  };
}

function renderIntervalSlider() {
  const min = Number(elements.intervalMinInput.value);
  const max = Number(elements.intervalMaxInput.value);
  elements.intervalMinValue.textContent = `${min}`;
  elements.intervalMaxValue.textContent = `${max}`;
  elements.intervalRangeFill.style.left = `${min * 10}%`;
  elements.intervalRangeFill.style.right = `${100 - max * 10}%`;
}

function renderSettings() {
  const settings = state.settings;
  elements.taskIdInput.value = settings.task_id;
  elements.timezoneInput.value = settings.timezone;
  elements.intervalMinInput.value = Math.max(0, Math.min(10, settings.send_interval_seconds.min));
  elements.intervalMaxInput.value = Math.max(0, Math.min(10, settings.send_interval_seconds.max));
  elements.retryInput.value = settings.target_open_retries;
  elements.timeoutInput.value = settings.target_open_timeout_seconds;
  elements.continueToggle.checked = settings.continue_on_error;
  elements.duplicateToggle.checked = settings.prevent_duplicates;
  renderIntervalSlider();
}

function renderMode() {
  $$("[data-switch-mode]").forEach((button) => {
    const active = button.dataset.switchMode === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderFriends() {
  renderMode();
  const friends = currentFriends();
  elements.friendCount.textContent = `${friends.filter((name) => String(name || "").trim()).length} 位好友`;
  if (state.mode === "advanced" && selectedTargetIndex >= state.targets.length) {
    selectedTargetIndex = Math.max(0, state.targets.length - 1);
  }
  elements.friendList.innerHTML = friends.length ? friends.map((name, index) => `
    <article class="friend-item ${state.mode === "advanced" && index === selectedTargetIndex ? "is-active" : ""}" data-friend-index="${index}">
      <button class="friend-select" type="button" data-friend-select="${index}" ${state.mode === "basic" ? "tabindex=\"-1\"" : ""}>
        <span>${escapeHtml(name)}</span>
      </button>
      <button class="mini-button danger" type="button" data-friend-remove="${index}" aria-label="删除好友 ${escapeHtml(name)}">${icon("trash")}</button>
    </article>
  `).join("") : `<div class="empty-state">还没有好友</div>`;
}

function renderStickerGrid() {
  elements.stickerGrid.innerHTML = BUILTIN_STICKERS.map((sticker) => `
    <button class="sticker-option" type="button" data-sticker="${escapeHtml(sticker.name)}" aria-label="添加原生表情 ${escapeHtml(sticker.name)}">
      <img src="${escapeHtml(encodeURI(sticker.image))}" alt="" loading="lazy">
      <strong>${escapeHtml(sticker.name)}</strong>
    </button>
  `).join("");
}

function messageSummary(message) {
  if (message.type === "text") return { typeLabel: "文字", content: message.value || "空文字消息" };
  if (message.type === "sticker" || message.type === "douyin_sticker") return { typeLabel: "原生表情", content: message.value || "未选择表情" };
  if (message.type === "random") return { typeLabel: "随机", content: `${message.choices?.length || 0} 个候选项` };
  if (message.type === "image") return { typeLabel: "图片", content: message.value || "图片路径" };
  return { typeLabel: "未知", content: `未知类型：${message.type}` };
}

function renderMessages({ animateIn = true } = {}) {
  const messages = currentMessages();
  elements.messageCount.textContent = `${messages.length} 条消息`;
  elements.messageList.innerHTML = messages.length ? messages.map((message) => {
    const summary = messageSummary(message);
    const uiId = ensureUiId(message);
    return `
      <article class="message-item" data-message-id="${uiId}" style="${animateIn ? "" : "animation: none"}">
        <button class="drag-handle" type="button" draggable="true" aria-label="拖动消息">${icon("grip", 18)}</button>
        <div class="message-copy">
          <strong>${escapeHtml(summary.typeLabel)}</strong>
          <p>${escapeHtml(summary.content)}</p>
        </div>
        <button class="mini-button danger" type="button" data-message-remove="${uiId}" aria-label="删除消息">${icon("trash")}</button>
      </article>`;
  }).join("") : `<div class="empty-state">发送队列为空</div>`;
}

function buildSafeConfig() {
  updateSettingsFromForm();
  return buildConfig(state);
}

function renderValidation(config) {
  const validation = validateConfig(config);
  const hasErrors = validation.errors.length > 0;
  const hasWarnings = !hasErrors && validation.warnings.length > 0;
  const iconEl = elements.generateHint.querySelector("svg use");
  const label = elements.generateHint.querySelector("span");
  elements.generateHint.classList.toggle("is-error", hasErrors);
  if (hasErrors) {
    if (iconEl) iconEl.setAttribute("href", "#icon-info");
    if (label) label.textContent = `${validation.errors.length} 个配置错误`;
  } else if (hasWarnings) {
    if (iconEl) iconEl.setAttribute("href", "#icon-info");
    if (label) label.textContent = `${validation.warnings.length} 条提醒`;
  } else {
    if (iconEl) iconEl.setAttribute("href", "#icon-shield");
    if (label) label.textContent = "配置有效";
  }
  const items = hasErrors ? validation.errors : validation.warnings;
  elements.validationList.innerHTML = items.length
    ? items.map((item) => `<div class="validation-item ${hasErrors ? "is-error" : ""}"><strong>${escapeHtml(item.path)}</strong><span>${escapeHtml(item.message)}</span></div>`).join("")
    : `<div class="validation-empty">没有发现阻塞问题</div>`;
  return validation;
}

function sync({ animateIn = true } = {}) {
  const config = buildSafeConfig();
  renderFriends();
  renderMessages({ animateIn });
  renderStickerGrid();
  renderValidation(config);
  saveDraft();
}

function showWizardError(message, field) {
  elements.wizardError.textContent = message;
  field?.focus();
  return false;
}

function emphasizeValidation() {
  const panel = elements.statusPanel;
  if (!panel) return;
  panel.classList.remove("is-validation-highlighted");
  void panel.offsetWidth;
  panel.classList.add("is-validation-highlighted");
  if (isSmallViewport()) {
    window.requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", block: "end" }));
  }
}

function showToast(message, error = false) {
  const toast = document.createElement("div");
  toast.className = `toast${error ? " is-error" : ""}`;
  toast.innerHTML = `${icon(error ? "info" : "shield", 18)}<span>${escapeHtml(message)}</span>`;
  elements.toastRegion.append(toast);
  window.setTimeout(() => {
    toast.classList.add("is-removing");
    window.setTimeout(() => toast.remove(), 220);
  }, 2400);
}

function addFriend(name) {
  const value = name.trim();
  if (!value) return showToast("请输入好友昵称", true);
  markDirty();
  if (state.mode === "advanced") {
    state.targets.push({ name: value, messages: clone(currentMessages()), extras: {} });
    selectedTargetIndex = state.targets.length - 1;
  } else {
    state.friends.push(value);
  }
  elements.friendNameInput.value = "";
  sync();
  elements.friendNameInput.focus();
}

function removeFriend(index) {
  markDirty();
  if (state.mode === "advanced") {
    state.targets.splice(index, 1);
    selectedTargetIndex = Math.min(selectedTargetIndex, Math.max(0, state.targets.length - 1));
  } else {
    state.friends.splice(index, 1);
  }
  sync({ animateIn: false });
}

function addMessage(message) {
  markDirty();
  ensureUiId(message);
  setCurrentMessages([...currentMessages(), message]);
  sync({ animateIn: true });
}

function moveItemTo(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return items;
  const result = [...items];
  const [item] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, item);
  return result;
}

function animateMessageReorder(mutator) {
  const firstRects = new Map($$(".message-item").map((item) => [item.dataset.messageId, item.getBoundingClientRect()]));
  mutator();
  renderMessages({ animateIn: false });
  $$(".message-item").forEach((item) => {
    const first = firstRects.get(item.dataset.messageId);
    if (!first) return;
    const last = item.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (!dx && !dy) return;
    item.style.transform = `translate(${dx}px, ${dy}px)`;
    item.style.transition = "transform 0s";
    requestAnimationFrame(() => {
      item.style.transition = "transform 180ms ease";
      item.style.transform = "";
    });
  });
}

function markDraggedMessage() {
  $$(".message-item").forEach((item) => {
    item.classList.toggle("is-dragging", item.dataset.messageId === draggedMessageId);
  });
}

function reorderDraggedMessageOver(target) {
  if (!target || !draggedMessageId || target.dataset.messageId === draggedMessageId) return;
  const messages = currentMessages();
  const from = messages.findIndex((message) => ensureUiId(message) === draggedMessageId);
  const to = messages.findIndex((message) => ensureUiId(message) === target.dataset.messageId);
  markDirty();
  animateMessageReorder(() => setCurrentMessages(moveItemTo(messages, from, to)));
  markDraggedMessage();
  saveDraft();
}

function setComposer(type) {
  composingType = type;
  $$(".tab").forEach((button) => {
    const active = button.dataset.compose === type;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $("#textComposer").hidden = type !== "text";
  $("#stickerComposer").hidden = type !== "sticker";
  $("#randomComposer").hidden = type !== "random";
  if (type === "text") elements.messageInput.focus();
  saveDraft();
}

function switchMode(mode) {
  if (mode === state.mode) return;
  markDirty();
  if (mode === "advanced") {
    state = convertToAdvanced(state);
  } else {
    if (!canConvertToBasic(state)) {
      showToast("每位好友的消息不同，无法无损切换到共享模式", true);
      return;
    }
    state = convertToBasic(state);
  }
  selectedTargetIndex = 0;
  sync({ animateIn: false });
}

function applyImportedConfig(raw) {
  const result = importConfig(raw);
  if (result.validation.errors.length) {
    const first = result.validation.errors[0];
    throw new TypeError(`${first.path}：${first.message}`);
  }
  state = result.state;
  markDirty();
  selectedTargetIndex = 0;
  renderSettings();
  sync({ animateIn: false });
  showToast("配置导入成功");
}

async function importFromClipboard() {
  elements.importError.textContent = "";
  try {
    if (!navigator.clipboard?.readText) throw new Error("当前浏览器不支持读取剪切板");
    const text = await navigator.clipboard.readText();
    if (!text.trim()) throw new Error("剪切板为空");
    applyImportedConfig(JSON.parse(text));
    elements.importText.value = "";
    elements.pasteImportPanel.hidden = true;
  } catch (error) {
    elements.importError.textContent = error.message;
    elements.pasteImportPanel.hidden = false;
    elements.importText.focus();
  }
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
  } catch (error) {
    showToast(`导入失败：${error.message}`, true);
  }
}

function downloadConfig(config) {
  const blob = new Blob([formatConfig(config)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "config.json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getValidConfig() {
  const config = buildSafeConfig();
  const validation = validateConfig(config);
  if (validation.errors.length) {
    const first = validation.errors[0];
    emphasizeValidation();
    showWizardError(`${first.path}：${first.message}`);
    return null;
  }
  elements.wizardError.textContent = "";
  return config;
}

function openCompleteDialog() {
  elements.completeError.textContent = "";
  if (!getValidConfig()) return;
  elements.completeDialog.showModal();
}

function isSmallViewport() {
  return window.matchMedia("(max-width: 720px)").matches;
}

function getCronExpression(time) {
  const [hour, minute] = String(time || "").split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${minute} ${(hour + 16) % 24} * * *`;
}

function updateCronOutput() {
  const time = elements.cronTimeInput.value;
  const cron = getCronExpression(time);
  if (!cron) {
    elements.cronOutput.textContent = "";
    elements.cronWarning.textContent = "请选择有效时间";
    return null;
  }
  elements.cronOutput.innerHTML = `<code>${escapeHtml(cron)}</code>`;
  const [hour, minute] = time.split(":").map(Number);
  const utc8 = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentMinutes = utc8.getUTCHours() * 60 + utc8.getUTCMinutes();
  const selectedMinutes = hour * 60 + minute;
  elements.cronWarning.textContent = selectedMinutes < currentMinutes
    ? "设置的时间早于当前，当天任务无法执行，请留意并手动续火花。"
    : "";
  return cron;
}

function openCronDialog() {
  updateCronOutput();
  elements.cronDialog.showModal();
}

async function copyCron() {
  const cron = updateCronOutput();
  if (!cron) return;
  try {
    await navigator.clipboard.writeText(cron);
    showToast("已复制 Cron 表达式");
  } catch (error) {
    elements.cronWarning.textContent = error.message || "复制失败";
  }
}

async function copyConfig() {
  const config = getValidConfig();
  if (!config) return;
  try {
    await navigator.clipboard.writeText(formatConfig(config));
    markSaved();
    showToast("已复制配置");
  } catch (error) {
    elements.completeError.textContent = error.message;
  }
}

function normalizeInterval(changed) {
  markDirty();
  let min = Number(elements.intervalMinInput.value);
  let max = Number(elements.intervalMaxInput.value);
  if (min > max) {
    if (changed === "min") max = min;
    else min = max;
  }
  elements.intervalMinInput.value = min;
  elements.intervalMaxInput.value = max;
  renderIntervalSlider();
  sync({ animateIn: false });
}

function isFileDrag(event) {
  return [...(event.dataTransfer?.types || [])].includes("Files");
}

function clearConfig() {
  state = createInitialState();
  selectedTargetIndex = 0;
  renderSettings();
  elements.pasteImportPanel.hidden = true;
  elements.importText.value = "";
  elements.importError.textContent = "";
  elements.wizardError.textContent = "";
  sync({ animateIn: false });
  markSaved();
  showToast("已清空配置");
}

function bindEvents() {
  elements.resetConfigButton.addEventListener("click", () => {
    elements.clearDialog.showModal();
  });
  elements.confirmClearButton.addEventListener("click", () => {
    elements.clearDialog.close();
    clearConfig();
  });
  elements.importFileButton.addEventListener("click", () => elements.fileInput.click());
  elements.importClipboardButton.addEventListener("click", importFromClipboard);
  elements.cronButton.addEventListener("click", openCronDialog);
  elements.cronTimeInput.addEventListener("input", updateCronOutput);
  elements.copyCronButton.addEventListener("click", copyCron);
  elements.completeButton.addEventListener("click", openCompleteDialog);
  elements.copyConfigButton.addEventListener("click", copyConfig);
  elements.downloadConfigButton.addEventListener("click", () => {
    const config = getValidConfig();
    if (!config) return;
    downloadConfig(config);
    markSaved();
    showToast("已下载 config.json");
  });

  $$("[data-switch-mode]").forEach((button) => button.addEventListener("click", () => switchMode(button.dataset.switchMode)));
  elements.addFriendButton = $("#addFriendButton");
  elements.addFriendButton.addEventListener("click", () => addFriend(elements.friendNameInput.value));
  elements.friendNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      elements.addFriendButton.click();
    }
  });
  elements.friendList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.friendSelect !== undefined && state.mode === "advanced") {
      selectedTargetIndex = Number(button.dataset.friendSelect);
      sync({ animateIn: false });
    }
    if (button.dataset.friendRemove !== undefined) removeFriend(Number(button.dataset.friendRemove));
  });

  elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#addTextButton").click();
    }
  });
  $("#addTextButton").addEventListener("click", () => {
    const value = elements.messageInput.value.trim();
    if (!value) return showToast("请先输入消息内容", true);
    addMessage({ type: "text", value, sourceKey: "value", extras: {} });
    elements.messageInput.value = "";
    elements.messageInput.focus();
  });
  $("#addRandomButton").addEventListener("click", () => {
    const choices = parseLines(elements.randomChoicesInput.value).map((value) => ({ type: "text", value, sourceKey: "value", extras: {} }));
    if (!choices.length) return showToast("至少添加一个随机候选项", true);
    addMessage({ type: "random", choices, extras: {} });
    elements.randomChoicesInput.value = "";
  });
  $$(".tab").forEach((button) => button.addEventListener("click", () => setComposer(button.dataset.compose)));
  elements.stickerGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sticker]");
    if (!button) return;
    addMessage({ type: "sticker", value: button.dataset.sticker, sourceKey: "value", extras: {} });
    showToast(`已添加原生表情“${button.dataset.sticker}”`);
  });

  elements.messageList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-message-remove]");
    if (!removeButton) return;
    const id = removeButton.dataset.messageRemove;
    markDirty();
    setCurrentMessages(currentMessages().filter((message) => ensureUiId(message) !== id));
    renderMessages({ animateIn: false });
    renderValidation(buildSafeConfig());
    saveDraft();
  });
  elements.messageList.addEventListener("dragstart", (event) => {
    const handle = event.target.closest(".drag-handle");
    if (!handle || isSmallViewport()) {
      event.preventDefault();
      return;
    }
    const item = event.target.closest(".message-item");
    if (!item) return;
    draggedMessageId = item.dataset.messageId;
    markDraggedMessage();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedMessageId);
  });
  elements.messageList.addEventListener("dragover", (event) => {
    if (!draggedMessageId || isSmallViewport()) return;
    event.preventDefault();
    const target = event.target.closest(".message-item");
    reorderDraggedMessageOver(target);
  });
  elements.messageList.addEventListener("dragend", () => {
    draggedMessageId = null;
    renderMessages({ animateIn: false });
  });
  elements.messageList.addEventListener("mousedown", (event) => {
    const handle = event.target.closest(".drag-handle");
    if (!handle || isSmallViewport()) return;
    const item = handle.closest(".message-item");
    if (!item) return;
    event.preventDefault();
    draggedMessageId = item.dataset.messageId;
    markDraggedMessage();
  });
  document.addEventListener("mousemove", (event) => {
    if (!draggedMessageId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".message-item");
    reorderDraggedMessageOver(target);
  });
  document.addEventListener("mouseup", () => {
    if (!draggedMessageId) return;
    draggedMessageId = null;
    renderMessages({ animateIn: false });
  });

  [elements.taskIdInput, elements.timezoneInput, elements.retryInput, elements.timeoutInput].forEach((input) => {
    input.addEventListener("input", () => {
      markDirty();
      sync({ animateIn: false });
    });
  });
  elements.intervalMinInput.addEventListener("input", () => normalizeInterval("min"));
  elements.intervalMaxInput.addEventListener("input", () => normalizeInterval("max"));
  [elements.continueToggle, elements.duplicateToggle].forEach((input) => input.addEventListener("change", () => {
    markDirty();
    sync({ animateIn: false });
  }));

  $("#confirmImportButton").addEventListener("click", () => {
    try {
      if (!elements.importText.value.trim()) throw new Error("请粘贴 JSON 或选择文件");
      applyImportedConfig(JSON.parse(elements.importText.value));
      elements.importText.value = "";
      elements.pasteImportPanel.hidden = true;
    } catch (error) {
      elements.importError.textContent = error.message;
    }
  });
  elements.fileInput.addEventListener("change", () => {
    const [file] = elements.fileInput.files;
    elements.fileInput.value = "";
    readFile(file);
  });

  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth += 1;
    elements.dropOverlay.hidden = false;
  });
  window.addEventListener("dragover", (event) => {
    if (isFileDrag(event)) event.preventDefault();
  });
  window.addEventListener("dragleave", (event) => {
    if (!isFileDrag(event)) return;
    dragDepth -= 1;
    if (dragDepth <= 0) {
      dragDepth = 0;
      elements.dropOverlay.hidden = true;
    }
  });
  window.addEventListener("drop", (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepth = 0;
    elements.dropOverlay.hidden = true;
    readFile(event.dataTransfer.files[0]);
  });

  const composerTabs = $$(".tab");
  composerTabs.forEach((button, index) => button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? composerTabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + composerTabs.length) % composerTabs.length;
    composerTabs[nextIndex].focus();
    setComposer(composerTabs[nextIndex].dataset.compose);
  }));

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = true;
  });
}

function initialize() {
  const restored = loadDraft();
  renderSettings();
  setComposer(composingType);
  bindEvents();
  sync({ animateIn: false });
  isInitializing = false;
  markSaved();
  if (restored) showToast("已恢复浏览器缓存配置");
}

initialize();
