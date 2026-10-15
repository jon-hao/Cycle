/** 统一按使用者本机时区显示与订阅 */
window.CycleTZ = (function () {
  function locale() {
    const lang = (window.CycleState && window.CycleState.lang) || "zh";
    if (lang === "zh-TW") return "zh-TW";
    if (lang === "en") return "en-US";
    return "zh-CN";
  }

  function asDate(input) {
    if (input instanceof Date) return input;
    if (input == null || input === "") return null;
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(input, opts) {
    const d = asDate(input);
    if (!d) return "—";
    return d.toLocaleString(locale(), Object.assign({ hour12: false }, opts || {}));
  }

  function formatTime(input) {
    const d = asDate(input);
    if (!d) return "—";
    return d.toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatYMD(input) {
    const d = asDate(input);
    if (!d) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  }

  function formatNewsStamp(input) {
    const d = asDate(input);
    if (!d) return "—";
    return `${formatYMD(d)} ${formatTime(d)}`;
  }

  /** ICS 使用本地浮点时间（按使用者时区） */
  function icsLocalStamp(d) {
    const x = asDate(d) || new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
      x.getFullYear() +
      p(x.getMonth() + 1) +
      p(x.getDate()) +
      "T" +
      p(x.getHours()) +
      p(x.getMinutes()) +
      p(x.getSeconds())
    );
  }

  function icsUtcStamp(d) {
    const x = asDate(d) || new Date();
    return x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  return {
    locale,
    asDate,
    formatDateTime,
    formatTime,
    formatYMD,
    formatNewsStamp,
    icsLocalStamp,
    icsUtcStamp,
  };
})();
