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

  // 尝试在 ChatGPT 页面里找到“用户消息”节点
  // 由于 ChatGPT 前端会更新，这里做多选择器兜底
  function findUserMessageNodes() {
    const candidates = [];

    // 方案 A：常见结构（role=user）
    document.querySelectorAll('[data-message-author-role="user"]').forEach(n => candidates.push(n));

    // 方案 B：一些页面会把 role 放在 aria/属性里
    document.querySelectorAll('[data-testid*="user"], [class*="user"]').forEach(n => {
      // 过滤掉明显不是消息的
      if (n.innerText && n.innerText.trim().length > 0) candidates.push(n);
    });

    // 去重（同一节点可能重复进来）
    return Array.from(new Set(candidates));
  }

  // 给每条用户消息打一个锚点 id，供跳转
  function ensureAnchors(nodes) {
    nodes.forEach((node, idx) => {
      if (!node.dataset.cqnId) {
        node.dataset.cqnId = `cqn-user-${Date.now()}-${idx}`;
      }
    });
  }

  function getQuestionTextFromNode(node) {
    // 尽量提取更像“问题”的文本：取第一行或前 120 字
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

    // 按页面顺序：越早越上
    const items = nodes.map((node, i) => ({
      id: node.dataset.cqnId,
      node,
      text: getQuestionTextFromNode(node),
      index: i + 1
    })).filter(x => x.text);

    list.innerHTML = "";

    items.forEach(item => {
      const div = el("div", { class: "cqn-item" });
      div.setAttribute("data-id", item.id);
      div.setAttribute("data-text", item.text.toLowerCase());
      div.appendChild(el("div", { text: item.text }));
      div.appendChild(el("div", { class: "cqn-meta", text: `#${item.index}` }));

      div.addEventListener("click", () => {
        // 清除旧高亮
        document.querySelectorAll(".cqn-highlight").forEach(n => n.classList.remove("cqn-highlight"));

        // 滚动并高亮
        item.node.scrollIntoView({ behavior: "smooth", block: "center" });
        item.node.classList.add("cqn-highlight");
        setTimeout(() => item.node.classList.remove("cqn-highlight"), 1800);
      });

      list.appendChild(div);
    });
  }

  // 监听 DOM 变化：对话变长、加载更多消息时自动更新目录
  function observeConversation() {
    const obs = new MutationObserver(() => {
      // 防抖：减少频繁刷新
      window.clearTimeout(window.__cqnT);
      window.__cqnT = window.setTimeout(renderList, 250);
    });

    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    createUI();
    // 默认显示侧边栏（你也可以改成默认隐藏）
    document.getElementById(PANEL_ID).classList.remove("cqn-hidden");
    document.getElementById(HANDLE_ID).classList.add("cqn-hidden");

    renderList();
    observeConversation();
  }

  // 页面是 SPA，稍等主体渲染
  const start = () => init();
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(start, 500);
  } else {
    window.addEventListener("DOMContentLoaded", () => setTimeout(start, 500));
  }
})();
