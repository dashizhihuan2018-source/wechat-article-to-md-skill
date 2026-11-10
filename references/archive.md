# 输入公众号名称，免费下载与归类

```sh
sh scripts/run.sh --archive --name '公众号名称' --output-dir ./account-archive
```

Windows 将启动命令替换为 `& .\scripts\run.ps1`。启动器自动准备 Node.js，不依赖 npm、小程序、Obsidian插件或自建服务器。

默认来源是 ByDrug 免费公开作者索引，适用于其已收录的公众号；无需 API Key 或微信登录。脚本按名称定位作者页，核验原微信链接，再直接下载微信正文并归类。不能承诺覆盖任意公众号或全部历史。首次只试10篇：

```sh
sh scripts/run.sh --archive --name 'Best in Class' --trial 10 --rules references/medicine-rules.json --output-dir ./best-in-class-trial
```

`--trial N` 只限制本次试跑。技能不设10篇上限；ByDrug 未登录只开放3页，默认处理全部可见内容时也遵守该限制，不访问第4页。达到上游范围后保存现有结果并报告 `partial_history_archived`。页面显示收录62条，不代表可以免费取得全部62条，更不代表公众号所有历史。

## 来源与身份

详见 [免费发现实战](free-discovery.md)。来源链为公开作者索引 → 同名作者详情页 → “查看原文”微信链接 → 微信正文。核验作者名称、同一公众号 `__biz` 和实际正文提取的公众号名称，不把其他账号的相似标题计入目标。公开HTML只读解析，不执行脚本、不加载远程资源。

独立执行各阶段：

```sh
sh scripts/run.sh --free-discover --name 'Best in Class' --limit 10 --output-dir ./free-links
sh scripts/run.sh --batch --links ./free-links/discovered-links.json --account 'Best in Class' --output-dir ./articles
sh scripts/run.sh --classify --batch-dir ./articles --rules references/medicine-rules.json --output-dir ./classified
```

输出均使用新目录，不覆盖原件。遇验证页、403/429、缺正文或账号不符即停止，不自动换代理、重复请求或切换付费服务。

## 状态与输出

`archive.json` 记录阶段、数量和停止原因：

- `trial_archived`：本次指定样本已保存并归类。
- `trial_shortfall`：取得数量不足试跑要求，`trial_shortfall` 记录缺额。
- `partial_history_archived`：来源达到未登录访问范围，现有结果已保存并归类，尚非完整历史。
- `available_history_archived`：本次来源可见结果已穷尽并处理，仍不证明公众号全历史完整。
- `stopped`：网络、验证、来源身份、正文或分类校验失败。
- `no_articles_returned`：来源没有返回文章，不能解释为公众号从未发布内容。

原始发现位于 `discovery/discovery.json`，达到公开3页限制时状态为 `public_access_limit`。链接表位于 `discovery/discovered-links.json`；编号原文位于 `articles/`；分类副本、`catalog.json` 与 `INDEX.md` 位于 `classified/`。`complete_history_verified:false` 保留覆盖边界。

停止后核对 `articles/remaining-links.json`，用 `--batch` 在新目录续接，再调用 `--classify`；该表包含失败、待处理及试跑未选中的链接。来源访问受限时不继续探测受限页面；索引未列出的文章需要其他可核验公开来源或用户提供的真实链接。

## 正文归类

分类前验证成功项的 SHA256、源链接与账号，跳过未成功项。移除元数据与文章标题，只按正文关键词生成主分类、多标签及命中片段。默认通用规则覆盖医药健康、旅行地理、科技数码、财经商业、教育文化、社会生活；无证据归为未分类。

医药细分规则 `references/medicine-rules.json` 覆盖临床研究、监管审批、商业合作与渠道、企业财报与专利、AI与药物发现。分类为可解释的规则判断，智能体可读正文继续语义复核。自定义规则示例：

```json
{
  "categories": [
    {"name":"临床研究","keywords":["临床","试验","疗效"],"minMatches":2},
    {"name":"商业合作","keywords":["授权","收购","合作","融资"],"minMatches":1}
  ],
  "defaultCategory":"未分类"
}
```

分类副本保留原始 Markdown，图片仍为远程URL；不是离线图片归档。规则不执行文章内容或JSON代码。

## 显式可选的服务商

旧 DataXAPI 适配器仅在显式选择 `--provider dataxapi` 时调用；需本机 `DATAXAPI_API_KEY` 并可能计费。配置、搜索预算和游标见 [服务商教程](discovery.md)。免费来源未收录或失败时不会自动调用它。

## 真实验证

2026-11-11，免费公开索引可见顺序的前10条，微信原文10/10直接下载成功，未复用旧种子；正文10/10完成归类：临床研究6篇、商业合作与渠道2篇、AI与药物发现1篇、企业财报与专利1篇。此结论只覆盖本次10篇，不证明“最新10篇”或全历史完整性。全文与私人报告留在本机，不随公开技能发布。
