# Markdown Parser

一个现代化的 **Markdown 在线解析器**，支持实时预览、语法高亮、主题切换和多种导出方式。

##功能特性

- **实时预览** — 输入 Markdown 即时渲染，无需刷新页面
- **三种视图模式** — 分屏 / 编辑 / 预览，随心切换
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
| 前端框架 | 原生 JavaScript（ES Module）|
| Markdown 解析 | Marked.js |
| 代码高亮 | Highlight.js |
| 图表渲染 | Mermaid.js |
| XSS 防护 | DOMPurify |

## 快速开始

```bash
# 直接用浏览器打开 index.html 即可使用
open index.html

# 或使用本地服务器
npx serve .
```

## 项目结构

```
├── index.html     # 主页面入口
├── app.js         # 主逻辑
├── style.css      # 样式文件
├── modules/       # 模块化代码
│   ├── dom.js     # DOM 操作封装
│   ├── editor.js  # 编辑器核心
│   ├── render.js  # Markdown 渲染
│   ├── state.js   # 状态管理
│   ├── theme.js   # 主题切换
│   ├── toc.js     # 目录生成
│   ├── search.js  # 搜索功能
│   └── files.js   # 文件读写
├── CLAUDE.md      # 项目开发笔记
└── 一键启动.bat   # Windows 快捷启动
```

## 许可证

MIT