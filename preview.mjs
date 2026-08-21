import { chromium } from "playwright-core";

const browser = await chromium.launch({
  headless: false, // 有头模式,弹出窗口给用户看
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
console.log("opened, title:", await page.title());
// 保持窗口打开,等待用户查看
console.log("browser window stays open - press Ctrl+C in the task or close the window to exit");
await new Promise(() => {});