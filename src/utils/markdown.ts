/**
 * ============================================
 * Markdown 渲染工具
 * ============================================
 * 使用 marked 库将 markdown 文本渲染为 HTML
 * 供 ChatMessageBubble 等组件使用
 */

import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

// 创建 marked 实例
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (_) {
          // fallback
        }
      }
      // 没有指定语言或语言不支持，自动检测
      try {
        return hljs.highlightAuto(code).value;
      } catch (_) {
        return code;
      }
    },
  }),
);

// 配置 marked 选项
marked.setOptions({
  gfm: true,        // GitHub Flavored Markdown
  breaks: true,     // 将换行符转换为 <br>
});

/**
 * 将 markdown 文本转换为 HTML
 * @param mdText - markdown 原始文本
 * @returns HTML 字符串，用 markdown-body 类包裹便于样式隔离
 */
export function renderMarkdown(mdText: string): string {
  if (!mdText) return '';

  try {
    const html = marked.parse(mdText) as string;
    // 用 markdown-body div 包裹，便于全局样式作用
    return `<div class="markdown-body">${html}</div>`;
  } catch (e) {
    console.warn('[Markdown] 解析失败:', e);
    // 解析失败时做基本的转义后返回
    return `<div class="markdown-body">${escapeHtml(mdText)}</div>`;
  }
}

/**
 * 简单的 HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default { renderMarkdown };