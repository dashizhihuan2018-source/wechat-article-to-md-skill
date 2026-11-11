# 输入公众号名称，免费下载与归类

```sh
sh scripts/run.sh --archive --name '公众号名称' --output-dir ./account-archive
```

Windows 将启动命令替换为 `& .\scripts\run.ps1`。启动器自动准备 Node.js，不依赖 npm、小程序、Obsidian插件或自建服务器。

默认来源是 ByDrug 免费公开作者索引，适用于其已收录的公众号；无需 API Key 或微信登录。脚本按名称定位作者页，核验原微信链接，再直接下载微信正文并归类。不能承诺覆盖任意公众号或全部历史。首次只试10篇：

```sh
sh scripts/run.sh --archive --name 'Best in Class' --trial 10 --rules references/medicine-rules.json --output-dir ./best-in-class-trial
```

`--trial N` 只限制本次试跑。技能不设篇数上限，也不设页数上限：发现阶段一直翻到上游返回空页为止。ByDrug 匿名访问在第3页之后通常就给空页，程序照实记录——空页时仍声称有更多收录，判为上游截断，状态 `public_access_limit`、归档 `partial_history_archived`；空页且已取满声称的收录数，才是 `provider_exhausted`。这是上游访问条件，不是技能的产品上限。页面显示收录62条，不代表可以免费取得全部62条，更不代表公众号所有历史。

## 下载要求：篇数、天数、起止日期

三种要求可以组合，覆盖用户口语里的「近十天」「上个月」「11月1日到11月9日，取6篇」：

| 要求 | 参数 | 语义 |
|---|---|---|
| 篇数 | `--trial N` | 本次样本上限；不是产品上限 |
| 天数 | `--days N` | 含今天在内的 N 个自然日 |
| 起止日期 | `--since YYYY-MM-DD [--until YYYY-MM-DD]` | 两端都含；`--until` 缺省为今天 |

```sh
sh scripts/run.sh --archive --name '公众号名称' --days 10 --output-dir ./last-10-days
sh scripts/run.sh --archive --name '公众号名称' --since 2026-10-31 --until 2026-11-09 --trial 6 --output-dir ./window-sample
```

`--days` 与 `--since/--until` 互斥；`--since` 晚于 `--until`、非真实日期（如 `2026-02-30`）、非 `YYYY-MM-DD` 写法都按预检失败处理，在建目录之前就退出，不留半成品。

执行顺序是「发现 → 窗口过滤 → 下载 → 归类」，因此在窗口外的原文一次都不会被请求，也不会产生下载等待：

- `archive.json` 的 `date_window` 记录 `requested`／`since`／`until`／`days`／`computed_at`／`label`，`--days` 依赖运行日期，故保留 `computed_at` 以备复核。
- `date_filter.counts` 记录 `input`／`kept`／`before`／`after`／`undated`／`selected`；`date_filter.undated_urls` 全量列出日期缺失的链接，不截断。
- 通过窗口的链接另存为 `in-window-links.json`，`discovery/discovered-links.json` 原样保留作证据。
- 一条都不命中时状态为 `no_articles_in_window`，不生成 `in-window-links.json`，也不创建 `articles/`。
- 同时给出 `--trial N` 时，发现阶段按 `3N` 过采样，`discovery_limit_reason` 说明原因，否则窗口会把样本吃光；过采样量随 `--trial` 线性增长，不另设绝对上限。

日期只取原文详情页核实的值，按 `YYYY-MM-DD` 比较，不做时区换算。归档使用 `undated: exclude`：日期无法核实的链接不计入窗口，只列入 `undated_urls` 交人工复核，绝不用文件名或 `mid` 规律猜补。

窗口不改变来源覆盖范围。发现阶段能翻多远由上游决定（匿名访问通常止于第3页后），要覆盖更长时间跨度需 `--provider dataxapi`（显式选择、需要 Key），或由用户在正常授权下提供已核验清单（`--batch`/`--import`）再加同样的日期参数。

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

原始发现位于 `discovery/discovery.json`，上游截断时状态为 `public_access_limit`；`discovery.json` 的 `index_pages`／`reported_total` 说明翻了几页、上游声称多少条。链接表位于 `discovery/discovered-links.json`；编号原文位于 `articles/`；分类副本、`catalog.json` 与 `INDEX.md` 位于 `classified/`。`complete_history_verified:false` 保留覆盖边界。

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
