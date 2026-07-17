# Markdown Parser

一个现代化的 **Markdown 在线解析器**，支持实时预览、语法高亮、主题切换和多种导出方式。

## 功能特性

- **实时预览** — 输入 Markdown 即时渲染，无需刷新页面
- **三种视图模式** — 分屏 / 编辑 / 预览，随心切换
- **专业编辑器** — 基于 CodeMirror 6，支持语法高亮与快捷编辑
- **语法高亮** — 代码块自动识别语言并高亮（Atom One Dark 主题）
- **Mermaid 图表** — 支持在 Markdown 中绘制流程图、时序图等
- **主题切换** — 内置 8 套预设配色，支持自定义主/辅色调
- **目录导航** — 根据标题自动生成侧边栏目录，点击跳转
- **全局搜索** — 快速搜索文档内容，高亮匹配项
- **文件操作** — 打开本地 .md 文件 / 导出 HTML 或 Markdown
- **拖拽上传** — 直接拖拽文件到窗口即可打开
- **快捷键支持** — Ctrl+B 粗体、Ctrl+I 斜体、Ctrl+K 链接、Ctrl+S 保存等

## 技术栈

| 分类 | 技术 |
|------|------|
| 构建工具 | Vite |
| 前端框架 | 原生 JavaScript（ES Module）|
| 编辑器 | CodeMirror 6 |
| Markdown 解析 | Marked.js |
| 代码高亮 | Highlight.js |
| 图表渲染 | Mermaid.js |
| XSS 防护 | DOMPurify |
| 测试 | Vitest |
| 代码规范 | ESLint + Prettier |

## 快速开始

项目现在基于 Vite 构建，依赖通过 npm 管理，需先安装依赖再启动。

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:5173）
npm run dev
```

### 其他命令

```bash
npm run build      # 构建生产版本到 dist/
npm run preview    # 本地预览构建产物
npm test           # 运行测试（Vitest）
npm run lint       # 代码检查
npm run lint:fix   # 自动修复可修复的问题
npm run format     # 使用 Prettier 格式化代码
```

> 提示：项目使用了 npm 依赖的裸模块导入，必须通过 `npm run dev` 或先 `npm run build` 再 `npm run preview` 运行，直接用浏览器打开 `index.html` 已不再适用。

## 项目结构

```
├── index.html          # 主页面入口
├── app.js              # 主逻辑
├── style.css           # 样式文件
├── vite.config.js      # Vite / Vitest 配置
├── eslint.config.js    # ESLint 配置
├── modules/            # 模块化代码
│   ├── dom.js          # DOM 操作封装
│   ├── editor.js       # 编辑器核心
│   ├── editor-view.js  # CodeMirror 视图
│   ├── codeblock.js    # 代码块高亮
│   ├── images.js       # 图片处理
│   ├── render.js       # Markdown 渲染
│   ├── state.js        # 状态管理
│   ├── theme.js        # 主题切换
│   ├── toc.js          # 目录生成
│   ├── search.js       # 搜索功能
│   ├── files.js        # 文件读写
│   ├── pane-resize.js  # 面板拖拽调整
│   └── shortcuts.js    # 快捷键
├── tests/              # 单元测试（Vitest）
└── 一键启动.bat        # Windows 快捷启动
```

## 许可证

MIT
