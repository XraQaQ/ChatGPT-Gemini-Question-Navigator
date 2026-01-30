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
  // 1) 更可靠地找输入框（Gemini 可能是 textarea 或 contenteditable）
  const composer =
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('div[role="textbox"]');

  // 2) 找“对话根容器”：从输入框往上找最近的可滚动大容器
  //    如果找不到输入框，则退化为 document.body
  const start = composer || document.body;

  function isScrollable(el) {
    if (!(el instanceof HTMLElement)) return false;
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    const canScroll = (overflowY === "auto" || overflowY === "scroll");
    return canScroll && el.scrollHeight > el.clientHeight + 50;
  }

  let chatRoot = null;
  let p = start;
  for (let i = 0; i < 10 && p; i++) {
    if (isScrollable(p)) { chatRoot = p; break; }
    p = p.parentElement;
  }
  // 兜底：Gemini 常见会有 main；但没有也不致命
  if (!chatRoot) chatRoot = document.querySelector("main") || document.body;

  // 3) 排除明显的非对话区域（侧栏/导航/顶部栏）
  const inNonChatArea = (node) =>
    Boolean(node.closest("nav, aside, header, footer, [role='navigation']"));

  // 4) 在对话根容器里抓“文本块候选”
  //    注意：不要只依赖 role=listitem，Gemini 经常没有
  const all = Array.from(chatRoot.querySelectorAll("article, section, div"));

  // 5) 过滤出“像消息”的块
  const candidates = all.filter((n) => {
    if (!(n instanceof HTMLElement)) return false;
    if (inNonChatArea(n)) return false;

    const t = (n.innerText || "").trim();
    if (!t) return false;

    // 长度：太短像按钮/菜单；太长像整页容器
    if (t.length < 8) return false;
    if (t.length > 1500) return false;

    // 排除明显 UI 文案区域（比之前更少、更保守，避免误杀）
    const bad = ["Settings", "Help", "Feedback", "New chat", "历史记录", "设置"];
    if (bad.some((h) => t === h)) return false;

    // 排除“历史列表”特征：短文本 + 大量链接/按钮
    const links = n.querySelectorAll("a[href]").length;
    const buttons = n.querySelectorAll("button").length;
    if (t.length < 200 && (links >= 2 || buttons >= 4)) return false;

    return true;
  });

  // 6) 去重：只保留“最小可用块”（避免父容器把子块都包进去）
  //    规则：如果一个节点包含另一个节点且文本几乎相同，保留更小的那个
  const uniq = Array.from(new Set(candidates));

  const finalList = uniq.filter((n) => {
    const t = n.innerText.trim();
    // 如果存在子节点文本也差不多，说明它太大，丢掉
    for (const child of uniq) {
      if (child === n) continue;
      if (n.contains(child)) {
        const ct = child.innerText.trim();
        if (ct && ct.length >= 8 && Math.abs(ct.length - t.length) < 20) {
          return false;
        }
      }
    }
    return true;
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
