/**
 * Markdown → 安全 HTML（AI 分析 / Agent 回复）
 * 支持：标题、加粗/斜体、行内代码、代码块、列表、引用、链接、分隔线、段落
 */
window.CycleMD = (function () {
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inline(raw) {
    let s = String(raw || "");
    // 先保护行内代码
    const codes = [];
    s = s.replace(/`([^`\n]+?)`/g, (_, c) => {
      codes.push(c);
      return `\u0000C${codes.length - 1}\u0000`;
    });
    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => {
      const safe = escapeHtml(u);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${t}</a>`;
    });
    // **bold** / __bold__
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // *italic* / _italic_
    s = s.replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_])_(?!_)([^_\n]+?)_(?!_)/g, "$1<em>$2</em>");
    // 还原 code
    s = s.replace(/\u0000C(\d+)\u0000/g, (_, i) => {
      return `<code>${escapeHtml(codes[Number(i)])}</code>`;
    });
    return s;
  }

  function render(raw) {
    const src = String(raw || "").replace(/\r\n/g, "\n").trim();
    if (!src) return "";

    // 抽出 fenced code，整块不参与其它解析
    const fences = [];
    let text = escapeHtml(src).replace(
      /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g,
      (_, lang, body) => {
        fences.push({ lang: lang || "", body: body.replace(/\n$/, "") });
        return `\n\u0000F${fences.length - 1}\u0000\n`;
      }
    );

    const lines = text.split("\n");
    const out = [];
    let i = 0;
    let para = [];

    function flushPara() {
      if (!para.length) return;
      const html = inline(para.join(" ").trim());
      if (html) out.push(`<p class="md-p">${html}</p>`);
      para = [];
    }

    function flushList(items, ordered) {
      if (!items.length) return;
      const tag = ordered ? "ol" : "ul";
      out.push(
        `<${tag} class="md-list">${items
          .map((it) => `<li>${inline(it)}</li>`)
          .join("")}</${tag}>`
      );
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // fence placeholder
      const fenceMatch = trimmed.match(/^\u0000F(\d+)\u0000$/);
      if (fenceMatch) {
        flushPara();
        const f = fences[Number(fenceMatch[1])];
        const langClass = f.lang ? ` class="language-${escapeHtml(f.lang)}"` : "";
        out.push(
          `<pre class="md-pre"><code${langClass}>${f.body}</code></pre>`
        );
        i += 1;
        continue;
      }

      if (!trimmed) {
        flushPara();
        i += 1;
        continue;
      }

      if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
        flushPara();
        out.push('<hr class="md-hr" />');
        i += 1;
        continue;
      }

      const h = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (h) {
        flushPara();
        const level = h[1].length;
        out.push(`<h${level} class="md-h${level}">${inline(h[2])}</h${level}>`);
        i += 1;
        continue;
      }

      // escapeHtml 后 '>' 变成 '&gt;'
      if (/^(&gt;|>)\s?/.test(trimmed)) {
        flushPara();
        const quote = [];
        while (i < lines.length && /^(&gt;|>)\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^(&gt;|>)\s?/, ""));
          i += 1;
        }
        out.push(`<blockquote class="md-quote">${inline(quote.join(" "))}</blockquote>`);
        continue;
      }

      if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        flushPara();
        const ordered = /^\d+\.\s+/.test(trimmed);
        const items = [];
        while (i < lines.length) {
          const t = lines[i].trim();
          if (ordered) {
            const m = t.match(/^\d+\.\s+(.+)$/);
            if (!m) break;
            items.push(m[1]);
          } else {
            const m = t.match(/^[-*+]\s+(.+)$/);
            if (!m) break;
            items.push(m[1]);
          }
          i += 1;
        }
        flushList(items, ordered);
        continue;
      }

      para.push(trimmed);
      i += 1;
    }
    flushPara();

    return out.join("");
  }

  return { escapeHtml, render, inline };
})();
