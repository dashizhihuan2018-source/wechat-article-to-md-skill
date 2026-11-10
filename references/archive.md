# 输入公众号名称，下载与归类

```sh
sh scripts/run.sh --archive --name '公众号名称' --output-dir ./account-archive
```

Windows 将启动命令替换为 `& .\scripts\run.ps1`。两平台均自动准备 Node.js；不依赖 npm、小程序、Obsidian插件或自建服务器。

名称搜索默认最多请求3页，找不到唯一精确匹配或搜索未穷尽时保存候选并停止；可通过 `--search-pages all` 显式遍历全部搜索结果。账号确定后默认遍历全部可见历史页，逐篇下载并归类，无固定文章篇数上限。第一次只试10篇：

```sh
sh scripts/run.sh --archive --name '公众号名称' --trial 10 --output-dir ./account-trial
```

## 前置配置与费用

需在本机环境配置 `DATAXAPI_API_KEY`，来源与教程见 [免登录链接发现](discovery.md)。微信不需要登录；第三方服务的 Key 仍然必需。账号搜索和历史分页会产生服务商请求费用；搜索受 `--search-pages` 限制，账号确定后的历史分页按实际页数计费。脚本每次请求设置 `X-Max-Price: 0.0200`，当前接口单次超过该美元金额应由服务商拒绝执行；这不是整个任务的总价上限。首次可用 `--trial 10` 缩小下载范围并检查数据。

## 账号选择与状态

名称搜索使用服务商 [wechat.accounts.search](https://dataxapi.com/zh/apis/wechat/accounts/search/)，在搜索已穷尽且只有一个完整名称匹配项时自动选择。忽略大小写、全半角和连续空白差异，保留原始显示名做正文核验。两个同名账号或搜索预算耗尽时停止并生成 `accounts.json`；结合公众号微信号、介绍或一篇已知文章辨认，再在新输出目录加 `--id <真实账号ID>` 可直接跳过搜索。提供ID时必须已核验映射，实际下载仍核验公众号名称。不能默认选择排名第一的近似名称。

原始ID传入 [wechat_mp.accounts.articles.list](https://dataxapi.com/zh/apis/wechat_mp/accounts/articles/list/)；服务商不只支持 gh_ 开头ID，脚本也接受其返回的其他字母数字ID。每条文章的 author.id 须与目标一致，实际正文仍须匹配目标名称。

`archive.json` 记录搜索、发现、下载、分类的阶段、计数和停止原因：

- `available_history_archived`：本次服务商可见页已遍历，取得链接均已保存并归类。
- `trial_archived`：本次指定样本已保存并归类。
- `trial_shortfall`：服务商返回的文章少于试跑所需数量，`trial_shortfall`记录缺额，已保存与分类的结果仍保留。
- `search_budget_reached`：搜索仍有下一页，候选匹配尚未确定；可增加 `--search-pages` 或核验ID后直接运行。
- `account_selection_required` / `account_not_found`：需要辨认同名账号或搜索未匹配。
- `stopped`：错误、验证、账号不符或分类校验失败，检查已保留的进度。
- `no_articles_returned`：服务商未返回文章，不能解释为公众号从未发布过内容。

状态与 `complete_history_verified:false` 同时保留。服务商覆盖可能缺失已删除、付费或未收录文章；搜索和分页跑通不能证明真正全历史完整性。用户要求的“全部历史”仍须与可核验历史目录对账；未完成该对账时不得宣称完整。

## 输出与续接

账号候选位于 `accounts.json`；分页证据和链接位于 `discovery/`；编号原文位于 `articles/`；分类副本、索引和证据位于 `classified/`。所有运行使用新目录，不覆盖原件。

下载停止后，从 `articles/remaining-links.json` 用 `--batch` 在新目录续接；它包含失败项、待处理项以及因试跑未选中的链接。再对续接批次调用 `--classify`。若尚有未发现的页，从 `discovery/discovery.json` 取 `next_cursor` 原样传给 `--discover --cursor ... --pages all`，再下载新清单。游标过期时需重新查询并与原清单去重，不自动重复整批请求。

## 正文归类

分类前验证每篇成功项的 SHA256、源链接与账号，跳过失败或未下载项。移除元数据与首个文章标题，只依据实际正文关键词归类。默认主题覆盖医药健康、旅行地理、科技数码、财经商业、教育文化、社会生活；无证据归为未分类。命中类别可有多个标签，得分最高者为主目录，同分按规则顺序选取。分类是可解释的规则结果，智能体可以读正文做进一步语义复核。

自定义规则示例（另存本机 JSON，用 `--rules` 传入）：

```json
{
  "categories": [
    {"name":"临床研究","keywords":["临床","试验","疗效"],"minMatches":2},
    {"name":"商业合作","keywords":["授权","收购","合作","融资"],"minMatches":1}
  ],
  "defaultCategory":"未分类"
}
```

分类目录保留原始 Markdown 内容和远程图片链接；`catalog.json` 包含多标签、命中词、正文证据及哈希。规则不执行文章内容，也不执行用户JSON中的代码。

## 当前验证

2026-11-10完成离线全流程和真实3篇分类。2026-11-11持有效Key执行了名称搜索：5页结果未精确匹配Best in Class，随后余额不足；指定原始ID的历史接口也返回402，未进入下载。已据此加入搜索页预算和已核验ID跳过搜索。首轮真实10篇和全历史完整性仍未完成。源代码、合成测试与公开教程可同步Git，文章全文和私人研究结果留本机。
