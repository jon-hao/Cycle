/** 轻量 Markdown → 安全 HTML（给 AI 输出用） */
window.CycleMD = (function () {
  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render(raw) {
    let s = escapeHtml(raw);
    // **bold** / __bold__
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // *italic* / _italic_（避免吃掉已处理的 **）
    s = s.replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
    // `code`
    s = s.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
    // 简单标题
    s = s.replace(/^###\s+(.+)$/gm, '<div class="md-h3">$1</div>');
    s = s.replace(/^##\s+(.+)$/gm, '<div class="md-h2">$1</div>');
    // 换行
    s = s.replace(/\n/g, "<br>");
    return s;
  }

  return { escapeHtml, render };
})();
