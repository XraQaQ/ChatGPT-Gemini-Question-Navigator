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
  const main = document.querySelector("main") || document.body;

  // 1) 找输入框容器（用于排除 Tools/Fast 等输入区 UI 文本）
  const composer =
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('div[role="textbox"]');

  const composerContainer =
    (composer && (composer.closest("form") || composer.closest("footer") || composer.closest("div"))) || null;

  // 帮助函数：是否在输入区
  const inComposer = (node) => composerContainer && composerContainer.contains(node);

  // 2) 识别 assistant 回复块（你这套 Gemini UI 的按钮可能没 aria-label，所以加 Material icon 兜底）
  // 2.1 aria-label 版
  const feedbackBtns = Array.from(
    main.querySelectorAll(
      "button[aria-label*='Like'],button[aria-label*='Dislike'],button[aria-label*='赞'],button[aria-label*='踩'],button[aria-label*='Copy'],button[aria-label*='复制']"
    )
  );

  // 2.2 Material Icons 版（常见：<mat-icon>thumb_up</mat-icon>）
  const thumbIcons = Array.from(
    main.querySelectorAll("mat-icon, span, i")
  ).filter((n) => {
    const t = (n.textContent || "").trim();
    return t === "thumb_up" || t === "thumb_down" || t === "content_copy";
  });

  const assistantBlocks = new Set();

  function addAssistantBlockFromNode(n) {
    const block =
      n.closest("[role='listitem']") ||
      n.closest("article") ||
      n.closest("section") ||
      n.closest("div");
    if (block) assistantBlocks.add(block);
  }

  feedbackBtns.forEach(addAssistantBlockFromNode);
  thumbIcons.forEach(addAssistantBlockFromNode);

  // 3) 用户消息候选：限制在 main 内，且不在 nav/aside/header/footer，也不在 composer
  const inNonChatArea = (node) =>
    Boolean(node.closest("nav, aside, header, footer, [role='navigation']"));

  // 你截图里用户消息是右上角“短气泡”，所以先找短文本“叶子节点”
  const candidates = Array.from(main.querySelectorAll("div, p, span"))
    .filter((n) => n instanceof HTMLElement)
    .filter((n) => !inNonChatArea(n))
    .filter((n) => !inComposer(n));

  const userNodes = candidates.filter((n) => {
    const t = (n.innerText || "").trim();
    if (!t) return false;

    // 排除明显 UI 文本（你截图里就是 Tools / Fast）
    const uiBadExact = new Set(["Tools", "Fast", "PRO"]);
    if (uiBadExact.has(t)) return false;

    // 排除免责声明
    if (t.includes("Gemini can make mistakes") || t.includes("double-check it")) return false;

    // 长度：用户输入通常较短
    if (t.length < 2 || t.length > 300) return false;

    // 含过多按钮/链接的不是气泡
    if (n.querySelectorAll("button").length >= 2) return false;
    if (n.querySelectorAll("a[href]").length >= 1) return false;

    // 如果落在 assistant 回复块内，排除（把 Gemini 回复过滤掉）
    for (const ab of assistantBlocks) {
      if (ab && ab.contains(n)) return false;
    }

    // 去掉重复：如果父节点文本完全相同，优先父节点（或叶子），这里保留更叶子的
    const parent = n.parentElement;
    if (parent) {
      const pt = (parent.innerText || "").trim();
      if (pt === t && parent.querySelectorAll("div, p, span").length <= 4) {
        return false;
      }
    }

    return true;
  });

  return Array.from(new Set(userNodes));
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
