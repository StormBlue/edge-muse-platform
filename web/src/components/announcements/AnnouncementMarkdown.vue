<script setup lang="ts">
/**
 * 公告 Markdown 渲染。
 *
 * 内容由 sysadmin 编写，但仍做前端白名单清洗；代码块使用 marked-highlight + highlight.js。
 */
import { computed } from "vue";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import "highlight.js/styles/github-dark.css";

const props = defineProps<{
  content: string;
}>();

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);

const markdownRenderer = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    }
  })
);
markdownRenderer.setOptions({
  breaks: true,
  gfm: true
});

const html = computed(() => sanitizeHtml(markdownRenderer.parse(props.content) as string));

function sanitizeHtml(input: string) {
  if (typeof DOMParser === "undefined") return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");
  const blockedTags = new Set([
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "base",
    "form",
    "input",
    "button",
    "textarea",
    "select"
  ]);
  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (blockedTags.has(tag)) {
      element.remove();
      continue;
    }
    cleanAttributes(element);
  }
  return doc.body.innerHTML;
}

function cleanAttributes(element: Element) {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    if (name.startsWith("on") || name === "style") {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === "href" || name === "src") {
      if (!isSafeUrl(value)) element.removeAttribute(attribute.name);
      continue;
    }
    if (name === "class") {
      cleanClassAttribute(element, value);
      continue;
    }
    if (!["alt", "title", "target", "rel"].includes(name)) {
      element.removeAttribute(attribute.name);
    }
  }
  if (element.tagName.toLowerCase() === "a") {
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noreferrer");
  }
}

function cleanClassAttribute(element: Element, value: string) {
  const tag = element.tagName.toLowerCase();
  if (!["code", "pre", "span"].includes(tag)) {
    element.removeAttribute("class");
    return;
  }
  const classes = value
    .split(/\s+/)
    .filter((item) => item.startsWith("hljs") || item.startsWith("language-"));
  if (classes.length) element.setAttribute("class", classes.join(" "));
  else element.removeAttribute("class");
}

function isSafeUrl(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:")
  );
}
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- Markdown is rendered only after sanitizeHtml() strips unsafe tags and attributes. -->
  <article class="announcement-markdown" v-html="html"></article>
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.announcement-markdown {
  color: var(--foreground);
  font-size: 0.875rem;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.announcement-markdown :deep(*) {
  max-width: 100%;
}

.announcement-markdown :deep(h1),
.announcement-markdown :deep(h2),
.announcement-markdown :deep(h3) {
  margin: 1.15em 0 0.45em;
  font-weight: 700;
  line-height: 1.25;
}

.announcement-markdown :deep(h1) {
  font-size: 1.35rem;
}

.announcement-markdown :deep(h2) {
  font-size: 1.15rem;
}

.announcement-markdown :deep(h3) {
  font-size: 1rem;
}

.announcement-markdown :deep(p),
.announcement-markdown :deep(ul),
.announcement-markdown :deep(ol),
.announcement-markdown :deep(blockquote),
.announcement-markdown :deep(pre),
.announcement-markdown :deep(table) {
  margin: 0.75em 0;
}

.announcement-markdown :deep(ul),
.announcement-markdown :deep(ol) {
  padding-left: 1.25rem;
}

.announcement-markdown :deep(ul) {
  list-style: disc;
}

.announcement-markdown :deep(ol) {
  list-style: decimal;
}

.announcement-markdown :deep(blockquote) {
  border-left: 3px solid var(--primary);
  background: color-mix(in oklch, var(--primary), transparent 92%);
  padding: 0.5rem 0.75rem;
  color: var(--muted-foreground);
}

.announcement-markdown :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.announcement-markdown :deep(code:not(pre code)) {
  border-radius: 0.375rem;
  background: var(--muted);
  padding: 0.1rem 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.85em;
}

.announcement-markdown :deep(pre) {
  overflow: auto;
  border-radius: 0.5rem;
  background: oklch(0.16 0.005 240);
  padding: 0.875rem;
}

.announcement-markdown :deep(pre code) {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.announcement-markdown :deep(table) {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
}

.announcement-markdown :deep(th),
.announcement-markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 0.4rem 0.55rem;
}

.announcement-markdown :deep(img) {
  height: auto;
  border-radius: 0.5rem;
}
</style>
