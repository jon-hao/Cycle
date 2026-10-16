/**
 * 联网搜索：供浏览器端模型作金融市场对话的事实补充。
 * GET/POST ?flow=search&q=...
 */

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml, limit) {
  const out = [];
  const chunks = String(xml || "").split(/<item[\s>]/i).slice(1);
  for (const chunk of chunks) {
    if (out.length >= limit) break;
    const title = stripHtml((chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const link = stripHtml((chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const desc = stripHtml(
      (chunk.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || ""
    );
    const pub = stripHtml(
      (chunk.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || ""
    );
    if (!title) continue;
    out.push({
      title,
      url: link || null,
      snippet: desc.slice(0, 280),
      published: pub || null,
      source: "google-news",
    });
  }
  return out;
}

async function duckDuckGo(q) {
  const url =
    "https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "HApi/1.0" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  if (data.AbstractText) {
    out.push({
      title: data.Heading || q,
      url: data.AbstractURL || null,
      snippet: String(data.AbstractText).slice(0, 400),
      published: null,
      source: "duckduckgo",
    });
  }
  for (const t of data.RelatedTopics || []) {
    if (out.length >= 6) break;
    if (t.Text && t.FirstURL) {
      out.push({
        title: String(t.Text).slice(0, 120),
        url: t.FirstURL,
        snippet: String(t.Text).slice(0, 280),
        published: null,
        source: "duckduckgo",
      });
    }
  }
  return out;
}

async function googleNews(q) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(q) +
    "&hl=zh-CN&gl=US&ceid=US:zh-Hans";
  const res = await fetch(url, {
    headers: { "user-agent": "HApi/1.0", accept: "application/rss+xml,application/xml,text/xml,*/*" },
  });
  if (!res.ok) return [];
  return parseRssItems(await res.text(), 8);
}

export async function handleSearch(payload) {
  const q = String(
    (payload && (payload.q || payload.query || payload.text)) || ""
  ).trim();
  if (!q) {
    return { flow: "search", query: "", results: [], error: "missing q" };
  }
  const [ddg, news] = await Promise.all([
    duckDuckGo(q).catch(() => []),
    googleNews(q).catch(() => []),
  ]);
  const seen = new Set();
  const results = [];
  for (const item of [...news, ...ddg]) {
    const key = (item.url || item.title || "").slice(0, 160);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
    if (results.length >= 10) break;
  }
  return { flow: "search", query: q, results };
}
