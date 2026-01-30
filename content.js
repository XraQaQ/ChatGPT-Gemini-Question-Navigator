(() => {
  const PANEL_ID = "cqn-panel";
  const HANDLE_ID = "cqn-handle";

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    });
    children.forEach(c => node.appendChild(c));
    return node;
  }

  function createUI() {
    if (document.getElementById(PANEL_ID)) return;

    const handle = el("div", { id: HANDLE_ID, text: "问题目录" });
    handle.addEventListener("click", () => {
      const panel = document.getElementById(PANEL_ID);
      panel.classList.remove("cqn-hidden");
      handle.classList.add("cqn-hidden");
    });
    document.body.appendChild(handle);

    const panel = el("div", { id: PANEL_ID, class: "cqn-hidden" });

    const header = el("div", { id: "cqn-header" }, [
      el("div", { id: "cqn-title", text: "问题目录（你的提问）" }),
      el("button", { id: "cqn-toggle", type: "button", text: "隐藏" })
    ]);

    const search = el("input", {
      id: "cqn-search",
      type: "text",
      placeholder: "搜索问题关键词…"
    });

    const list = el("div", { id: "cqn-list" });

    panel.appendChild(header);
    panel.appendChild(search);
    panel.appendChild(list);
    document.body.appendChild(panel);

    header.querySelector("#cqn-toggle").addEventListener("click", () => {
      panel.classList.add("cqn-hidden");
      handle.classList.remove("cqn-hidden");
    });

    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll(".cqn-item").forEach(item => {
        const txt = item.getAttribute("data-text") || "";
        item.style.display = txt.includes(q) ? "" : "none";
      });
    });
  }

  // ---------- Site detection ----------
  function site() {
    const h = location.hostname;
    if (h === "chatgpt.com") return "chatgpt";
    if (h === "gemini.google.com") return "gemini";
    return "unknown";
  }

  // ---------- Find user messages (ChatGPT) ----------
  function findUserMessageNodesChatGPT() {
    const nodes = [];
    document.querySelectorAll('[data-message-author-role="user"]').forEach(n => nodes.push(n));
    return Array.from(new Set(nodes)).filter(n => n.innerText && n.innerText.trim().length > 0);
  }

  // ---------- Find user messages (Gemini) ----------
  // Gemini 的 DOM 结构会变，下面用“多策略兜底”：
  // 1) 优先找带明显 “You/你” 的消息容器（aria/label）
  // 2) 再找看起来像“对话气泡”的块，过滤掉模型输出
  function findUserMessageNodesGemini() {
  // 1) 找到输入框（Gemini 页面最稳定的锚点之一）
  const composer =
    document.querySelector('textarea') ||
    document.querySelector('input[type="text"]');

  // 2) 以输入框为基准，向上找到“对话主区域”
  //    main 通常包含对话内容；再过滤掉导航/侧栏区域
  const main = composer ? composer.closest("main") : document.querySelector("main");
  if (!main) return [];

  // 3) 排除明显不是对话的区域（历史列表/导航）
  const isInNonChatArea = (node) => {
    return Boolean(
      node.closest("nav, aside, header, footer, [role='navigation'], [aria-label*='History'], [aria-label*='history']")
    );
  };

  // 4) 在 main 内找“像消息块”的容器：优先 role=listitem/article
  //    Gemini 的 DOM 会变，这里做多 selector 兜底
  const selectors = [
    "[role='listitem']",
    "[role='article']",
    "article",
    "section"
  ];

  let blocks = [];
  for (const sel of selectors) {
    blocks = blocks.concat(Array.from(main.querySelectorAll(sel)));
  }
  blocks = Array.from(new Set(blocks));

  // 5) 过滤：去掉历史列表、按钮区、空内容、过短/过长、包含大量链接的块
  const cleaned = blocks.filter((n) => {
    if (!(n instanceof HTMLElement)) return false;
    if (isInNonChatArea(n)) return false;

    const t = (n.innerText || "").trim();
    if (!t) return false;

    // 排除“聊天标题列表”常见特征：通常是单行短文本 + 很多链接/按钮
    const links = n.querySelectorAll("a[href]").length;
    const buttons = n.querySelectorAll("button").length;
    if (links >= 2 && t.length < 200) return false;
    if (buttons >= 3 && t.length < 200) return false;

    // 排除明显是 UI 文案/控件附近文本
    const badHints = ["New chat", "History", "设置", "Settings", "Help", "Feedback", "Share", "复制", "Copy"];
    if (badHints.some((h) => t.includes(h))) return false;

    // 长度阈值：避免把整页正文/菜单抓进来
    if (t.length < 6) return false;
    if (t.length > 2000) return false;

    return true;
  });

  // 6) 去重：去掉被父节点完全覆盖的重复项
  const finalList = cleaned.filter((n) => {
    const p = n.parentElement;
    if (!p) return true;
    const t = (n.innerText || "").trim();
    const pt = (p.innerText || "").trim();
    return pt !== t;
  });

  return finalList;
}


  function findUserMessageNodes() {
    const s = site();
    if (s === "chatgpt") return findUserMessageNodesChatGPT();
    if (s === "gemini") return findUserMessageNodesGemini();
    return [];
  }

  // ---------- Anchors + rendering ----------
  function ensureAnchors(nodes) {
    nodes.forEach((node, idx) => {
      if (!node.dataset.cqnId) {
        node.dataset.cqnId = `cqn-user-${Date.now()}-${idx}`;
      }
    });
  }

  function getQuestionTextFromNode(node) {
    const raw = (node.innerText || "").trim().replace(/\s+\n/g, "\n");
    if (!raw) return "";
    const firstLine = raw.split("\n").map(s => s.trim()).filter(Boolean)[0] || raw;
    const short = firstLine.length > 120 ? firstLine.slice(0, 120) + "…" : firstLine;
    return short;
  }

  function renderList() {
    const list = document.getElementById("cqn-list");
    if (!list) return;

    const nodes = findUserMessageNodes();
    ensureAnchors(nodes);

    const items = nodes
      .map((node, i) => ({
        id: node.dataset.cqnId,
        node,
        text: getQuestionTextFromNode(node),
        index: i + 1
      }))
      .filter(x => x.text);

    list.innerHTML = "";

    items.forEach(item => {
      const div = el("div", { class: "cqn-item" });
      div.setAttribute("data-id", item.id);
      div.setAttribute("data-text", item.text.toLowerCase());
      div.appendChild(el("div", { text: item.text }));
      div.appendChild(el("div", { class: "cqn-meta", text: `#${item.index}` }));

      div.addEventListener("click", () => {
        document.querySelectorAll(".cqn-highlight").forEach(n => n.classList.remove("cqn-highlight"));
        item.node.scrollIntoView({ behavior: "smooth", block: "center" });
        item.node.classList.add("cqn-highlight");
        setTimeout(() => item.node.classList.remove("cqn-highlight"), 1800);
      });

      list.appendChild(div);
    });
  }

  function observeConversation() {
    const obs = new MutationObserver(() => {
      window.clearTimeout(window.__cqnT);
      window.__cqnT = window.setTimeout(renderList, 250);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    createUI();

    // 默认：不挡文字，先隐藏面板，只显示小按钮（你如果想默认展开就互换两行）
    document.getElementById(PANEL_ID).classList.add("cqn-hidden");
    document.getElementById(HANDLE_ID).classList.remove("cqn-hidden");

    renderList();
    observeConversation();
  }

  const start = () => init();
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(start, 500);
  } else {
    window.addEventListener("DOMContentLoaded", () => setTimeout(start, 500));
  }
})();
