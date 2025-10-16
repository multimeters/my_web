# 机器人 / 自动驾驶 / 具身智能 · 每日聚合

一个无需本地后端的静态网页：通过 GitHub Actions 定时抓取 arXiv、RSS、YouTube RSS 等数据，生成 `data/items.json`，前端直接读取并展示，提供搜索与筛选、简要摘要和时尚观感。

## 功能

- 聚合来源：
  - arXiv（cs.RO / robotics / autonomous driving / embodied ai 查询）
  - YouTube 搜索 RSS（autonomous driving / embodied ai / robotics）
  - The Robot Report / TechCrunch Robotics / IEEE Spectrum Robotics / NVIDIA Blog / Waymo Blog
- 简要摘要：提取首段核心句，自动打标签（Autonomous Driving、Robotics、Embodied AI、LLM、RL、Vision、Planning）
- 筛选与搜索：按类型、标签筛选，关键词搜索
- 轻量部署：静态站点（GitHub Pages 即可），数据文件由定时任务生成

## 使用方法（推荐 GitHub Pages）

1. 将本仓库推送到 GitHub。
2. 在 GitHub 仓库中：
   - Settings → Pages → Build and deployment → Source 选择 `Deploy from a branch`，Branch 选择 `main`（或默认分支）根目录，保存。
   - Actions → 允许 workflow 运行。`Fetch Robotics Daily` 工作流默认每 3 小时执行一次，也可以手动触发。
3. 首次运行工作流后，`data/items.json` 会被写入并提交。前端页面即可展示数据。

> 注意：如果你不使用 GitHub Pages，也可以用任意静态服务器来托管本仓库根目录（确保能访问 `index.html` 与 `data/items.json`）。

## 本地预览（可选）

如果本地没有 `node`/`npm`，可直接用任意静态服务器（如 VSCode 的 Live Server）打开仓库根目录。

若你有 Node.js ≥ 18：

```bash
npm i
npm run fetch   # 生成 data/items.json
# 然后用任意静态服务器开本目录
```

## 自定义数据源

编辑 `scripts/fetch.mjs` 中的 `SOURCES` 数组：

- 添加 / 删除 RSS 源（新闻、博客、YouTube 搜索 RSS）
- 调整 arXiv 查询（`search_query`）

代码使用 `fast-xml-parser` 解析 RSS/Atom。摘要策略为“去 HTML → 取前几句”。

## 目录结构

- `index.html`：前端页面
- `assets/`：样式、脚本、图标
- `data/items.json`：数据产物（自动生成）
- `scripts/fetch.mjs`：抓取与生成逻辑（供 GitHub Actions/本地使用）
- `.github/workflows/fetch.yml`：定时任务，每 3 小时运行一次

## 常见问题

- CORS：前端不跨域抓取源站，所有数据通过 Actions 在服务端生成，避免浏览器 CORS 限制。
- 更新频率：默认 3 小时；可在 `.github/workflows/fetch.yml` 的 `cron` 调整。
- 更多来源：欢迎在 `SOURCES` 中加入其它 RSS（如学术/厂商博客）。

