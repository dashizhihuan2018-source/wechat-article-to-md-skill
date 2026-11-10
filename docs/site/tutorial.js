'use strict';
(() => {
  const commands = {
    mac: "sh scripts/run.sh --archive --name 'Best in Class' --trial 10 --rules references/medicine-rules.json --output-dir './Best-in-Class-10'",
    windows: "& .\\scripts\\run.ps1 --archive --name 'Best in Class' --trial 10 --rules references/medicine-rules.json --output-dir './Best-in-Class-10'"
  };
  const command = document.getElementById('run-command');
  const feedback = document.getElementById('copy-feedback');
  for (const button of document.querySelectorAll('[data-platform]')) {
    button.addEventListener('click', () => {
      for (const peer of document.querySelectorAll('[data-platform]')) peer.setAttribute('aria-pressed', String(peer === button));
      command.textContent = commands[button.dataset.platform];
      feedback.textContent = '';
    });
  }
  document.getElementById('copy-command').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command.textContent);
      feedback.textContent = '已复制。请在解压后的 Skill 文件夹中运行。';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(command);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      feedback.textContent = '命令已选中，请按 Ctrl+C 或 ⌘C 复制。';
    }
  });

  const list = document.getElementById('article-list');
  const count = document.getElementById('visible-count');
  let articles = [];
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function meta(grid, label, value, code = false) {
    grid.append(element('dt', '', label));
    const dd = element('dd');
    if (code) dd.append(element('code', '', value));
    else dd.textContent = value;
    grid.append(dd);
  }
  function render(category = 'all') {
    list.replaceChildren();
    const selected = articles.filter(article => category === 'all' || article.category === category);
    count.textContent = `显示 ${selected.length} / ${articles.length} 篇 · 标题可展开核验信息`;
    for (const article of selected) {
      const details = element('details', 'article-item');
      const summary = element('summary');
      summary.append(element('span', 'article-number', String(article.number).padStart(2, '0')), element('span', 'article-title', article.title), element('span', 'article-category', article.category));
      const toggle = element('span', 'article-toggle', '+');toggle.setAttribute('aria-hidden', 'true');summary.append(toggle);
      const panel = element('div', 'article-meta');
      const grid = element('dl', 'meta-grid');
      meta(grid, '核验状态', '原文已转换 · 账号匹配 · SHA256 已校验');
      meta(grid, '列表日期', `${article.listed_published_at || '未提供'}（公开来源显示）`);
      meta(grid, '文件大小', `${article.bytes.toLocaleString('zh-CN')} B`);
      meta(grid, '正文标签', article.tags.join(' / '));
      meta(grid, 'SHA256', article.sha256, true);
      const original = element('a', 'original-link', '打开微信原文 ↗');
      const url = new URL(article.url);
      if (url.protocol !== 'https:' || url.hostname !== 'mp.weixin.qq.com' || url.username || url.password) throw new Error('Invalid original URL');
      original.href = url.href;original.target = '_blank';original.rel = 'noopener noreferrer';
      panel.append(grid, original);details.append(summary, panel);list.append(details);
    }
  }
  for (const button of document.querySelectorAll('[data-category]')) {
    button.addEventListener('click', () => {
      for (const peer of document.querySelectorAll('[data-category]')) peer.setAttribute('aria-pressed', String(peer === button));
      render(button.dataset.category);
    });
  }
  fetch('case-data.json').then(response => {
    if (!response.ok) throw new Error('Case data unavailable');
    return response.json();
  }).then(data => {
    if (!Array.isArray(data.articles) || data.articles.length !== 10) throw new Error('Unexpected case count');
    articles = data.articles;
    const active = document.querySelector('[data-category][aria-pressed="true"]');
    render(active?.dataset.category || 'all');
  }).catch(() => {
    count.textContent = '核验目录暂未载入';
    list.replaceChildren();
    const message = element('p', 'load-error', '请刷新页面，或直接查看 ');
    const link = element('a', '', '十篇核验元数据 JSON');link.href = 'case-data.json';message.append(link);list.append(message);
  });
})();
