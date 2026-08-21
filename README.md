# 火花配置台

纯静态的 `config.json` / `DOUYIN_CONFIG` 可视化生成器。现代 SaaS 风格的在线工具页面,所有处理都在浏览器本地完成 —— 不连接后端、不上传配置、不保存 Cookie 或登录凭证。

## 功能

- 现代工具站 UI:居中卡片布局、抖音青粉渐变点缀、浅色背景、响应式适配桌面与手机
- 基础模式:多位好友共用一个消息队列
- 高级模式:每位好友拥有独立消息队列
- 文字、抖音原生表情和随机消息编辑
- 原生表情映射与备用序号配置
- 消息添加 / 删除动画,生成按钮加载状态,生成成功提示
- 导入现有配置(拖放或粘贴 JSON)
- 一键生成并下载 `config.json`,可直接用于仓库 Secret 的 `DOUYIN_CONFIG`
- 自动跟随系统明暗主题,也支持手动切换

> 表情网格里的符号只用于帮助识别。生成的配置会使用 `sticker` / `douyin_sticker` 消息和 `stickers` 映射,由现有 Python 程序打开抖音原生表情面板进行发送。

## 本地使用

直接打开 `index.html` 即可使用。部分浏览器会限制 `file://` 页面读取 ES 模块,此时在本目录运行:

```bash
python -m http.server 4173
```

然后访问 `http://localhost:4173/`。

## 测试

不需要安装依赖:

```bash
npm test
```

测试使用 Node.js 内置的 `node:test`,覆盖配置生成、导入保真、未使用表情映射保留、混合格式拒绝、别名兼容、随机消息、精确校验路径和解析器默认值。

还可以从仓库根目录运行 Python 兼容性检查:

```bash
python config-generator/tests/python_compat.py
```

## GitHub Pages

部署工作流位于仓库根目录的 `.github/workflows/config-generator-pages.yml`。在仓库 **Settings > Pages** 中将 **Source** 设置为 **GitHub Actions**,随后可在 Actions 页手动运行该工作流,或修改配置生成器的核心文件并推送到 `main`。

工作流会先运行核心测试,再构建一个只含以下文件的静态站点:

- `index.html`
- `styles.css`
- `app.js`
- `config-core.js`

测试、文档、截图和自动续火程序不会被发布到 Pages。项目站点地址通常为 `https://unmev.github.io/douyin-auto-fire/`。

## 配置安全

- 不要粘贴 `DOUYIN_COOKIE`、storage state、Webhook 或任何密钥。
- 页面会拒绝检测到的疑似凭证内容。
- 导出的 JSON 只包含发送任务配置,不包含登录信息。
- 图片消息可通过原始 JSON 编辑器保留;当前版本不提供可视化图片选择器。