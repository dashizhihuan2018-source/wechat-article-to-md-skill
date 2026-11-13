# 串行批次整理与正文研究

本工具接收已经核验的文章链接，按给定顺序串行整理。默认处理清单中的全部链接，不设固定篇数上限；`--limit` 只用于本次试跑少量样本。不提供“公众号名称→全历史”的后台枚举接口。中文产品名为“微信公众号文章整理skill”，英文技能标识保持 `wechat-article-to-md-skill`。

## 用日期要求裁剪清单

清单里已有日期时，可直接加时间窗口，避免为窗口外的链接付出串行下载时间：

```sh
sh scripts/run.sh --batch --links ./verified-links.json --days 10 --account '公众号名称' --output-dir ./articles
sh scripts/run.sh --batch --links ./verified-links.json --since 2026-10-31 --until 2026-11-09 --output-dir ./articles
```

`--days` 含今天共 N 个自然日，与 `--since/--until` 互斥；区间非法在建目录前退出。两种日期来源分开处理，这是本工具与归档流程唯一的策略差异：

- **清单已带 `published_at`**：落在窗口外的链接直接不下载，计入 `date_filter.counts.before/after`。
- **清单未带 `published_at`**：仍然下载，转换后从正文 frontmatter 取真实日期，逐篇写入 `within_date_window`（`true`／`false`／`null` 表示正文也没有日期），并汇总到 `counts.out_of_window` 与 `counts.undated`。**已下载的文件不因落在窗口外而删除**，由用户决定取舍。

`batch-index.json` 的 `date_window` 与 `date_filter` 记录判定依据；`remaining-links.json` 以窗口过滤后的序列续跑，不复用原始索引，避免补跑时错位。

## 先取得授权与链接

用户要求“前10篇”或某个数量时，先确认目标公众号、用户授权范围，以及“前”的顺序：例如正常可访问历史列表中按发布时间从新到旧。这属于本次范围，不是产品上限。通过用户正常可用的列表逐条确认链接与账号；记录列表来源、核验时间、可见排序、文章标题和显示日期。日期不可见就记录缺失，不猜补。

设备锁屏或页面验证不能绕过。保留已确认的种子 Markdown、链接与未完成数，等待用户正常解锁或验证后继续。公众号名、搜索摘要或一篇种子文章不能证明已获得指定范围的完整列表。

## 输入格式

最简文本：每行一条真实 `https://mp.weixin.qq.com/s/...` 文章链接，文件中的顺序就是执行顺序，空行忽略。也可用 JSON 数组；下面是字段示意，不可把合成链接当真实文章执行：

```json
{
  "ordering": "用户授权历史列表；已核对按可见发布时间从新到旧",
  "links": [
    {
      "url": "https://mp.weixin.qq.com/s/REPLACE_WITH_VERIFIED_ID",
      "title": "列表中可见标题，仅作输入提示",
      "published_at": "列表可见日期，未见则不填",
      "discovery": {
        "method": "正常授权历史列表",
        "rank": 1,
        "verified_at": "核验发生的真实ISO时间",
        "ordering_basis": "列表显示的时间顺序"
      }
    }
  ]
}
```

只接受 HTTPS 的 `mp.weixin.qq.com` `/s` 文章链接，拒绝外部域名、URL 用户名/密码、重复链接及空输入。链接清单不设固定1 MiB门槛，实际规模受本机内存与磁盘限制。默认处理全部链接；可选 `--limit` 必须是任意正整数，用于试跑前 N 项。批次程序不能独立证明列表的排序正确，排序核验仍由用户和智能体负责。

### 复用真实种子

已成功整理的文章无需为凑样本再次访问。在该项 JSON 中加入 `reuse_markdown`，指向已有文件；相对路径按**输入链接文件所在目录**解析。

```json
{
  "url": "https://mp.weixin.qq.com/s/REPLACE_WITH_VERIFIED_ID",
  "reuse_markdown": "existing/article.md",
  "discovery": {"method": "已核验的真实种子；未发起新请求"}
}
```

必须同时存在 `article.md.status.json`，其中 `ok: true`、`status: converted`、`input_mode: http` 或 `local_html`；Markdown 必须是本转换器使用 JSON 值的 frontmatter 格式，`parse_status: ok`、源 URL 匹配且正文非空。若指定 `--account`，公众号也必须精确匹配。核验失败立即停止，不自动改成网络重抓。程序复制种子到新编号目录，保留原文件与原读取时间来源。

## 运行方式

```sh
sh scripts/run.sh --batch --links ./verified-links.json --output-dir ./new-batch --account '已核验公众号名称'
```

```powershell
& .\scripts\run.ps1 --batch --links .\verified-links.json --output-dir .\new-batch --account "已核验公众号名称"
```

`--batch` 必须是启动器的第一个参数。它切换到 `batch.cjs`，继续使用同一套 Node.js 检测、官方24.x LTS 下载校验与私有安装逻辑，所以缺少全局 node 时也可以启动批次。已有 Node.js 18+ 可直接使用 `node scripts/batch.cjs ...`。`--help` 查看参数；完整基础环境说明见 [环境教程](environment.md)。

`--account` 可选，但整理指定公众号时应提供已核验名称；提取缺失或不完全相同都停止。程序不凭外部链接表填补公众号。所有实际文章处理都调用现有自包含转换器，以当前 `process.execPath` 启动，禁止 shell 插值，不需要 npm 安装。

一次只处理一篇。上一条网络转换进程完成到下一条启动间至少60秒，使用单调时钟计算间隔；可用 `--interval 90` 调长，不能调短。种子复用不会发起请求。转换器原有的重定向、正文规则与有限重读逻辑不变，批次层不添加重试。

## 文件、日期与游标

每次必须选择全新的输出目录，已存在即拒绝。目录内包含：

```text
new-batch/
  001/article.md
  001/article.md.status.json
  002/article.md
  002/article.md.status.json
  batch-index.json
  manifest.json
  remaining-links.json
```

文件仅在实际生成时存在，失败项可能只有状态文件。`batch-index.json` 每项记录状态、实际标题、公众号、文件字节数和SHA256。`manifest.json` 记录已转换、复用、失败、待处理和未选中数；`converter_invocations` 是网络转换器启动次数，不等同于每次 HTTP 请求次数，也不能证明每次都已取得正文。所有图片仍为远程 URL。

日期字段明确分开：

| 字段 | 来源与解释 |
| --- | --- |
| `supplied_published_at` | 链接表的原始 `published_at`，未经正文核验 |
| `published_at` | 已保存 Markdown frontmatter 中的解析值，可能缺失或存在原解析器已知差异 |
| `request_started_at` / `request_completed_at` | 本次实际转换进程的开始与完成时间，不是输入表日期 |
| `retrieved_at` | 新转换记录完成时间；复用则取原 Markdown 的有效 `saved_at`，缺失时留空 |
| `source_of_date` | 分别说明上述日期来自文章frontmatter、未核验输入、实际转换完成或原种子saved_at |

不得把输入表的发布时间当作真实采集时间。复用种子不会改写其原采集日期。新批次创建时间只表示本次整理，不表示文章首次读取时间。对作者、发布时间等元数据仍须遵守 [已知差异](reverse-evidence.md)。

首个验证码、403/429、缺正文、账号不符、子进程异常或其他失败即停止，不继续下一篇、不换代理、不自动重试。已生成文件均保留；账号不符的 Markdown 也会保留，但不计为成功整理。

`next_index` 是从0开始的首个未完成输入位置。`remaining-links.json` 保留该失败项及之后未处理项，包括因 `--limit` 试跑而未选中的项；已完成项不再包含。确认正常访问恢复、人工核对剩余链接后，换一个全新输出目录续接：

```sh
sh scripts/run.sh --batch --links ./new-batch/remaining-links.json --output-dir ./next-batch --account '已核验公众号名称'
```

失败项不会自动跳过。若正常验证仍未恢复，就保持停止；不要为了推进游标重复访问。中断后索引可能显示 `running` / `in_progress`，需人工检查文件与状态再决定是否正常续接；不要把它算作已完成。退出码0表示选中项全部完成，2表示访问受限或账号不符，1表示其他失败。

## 基于正文做分类与研究

批次脚本只整理与记录证据。分类、比较和研究由智能体读取实际保存的正文后完成；不根据标题、排序或搜索摘要补写未取得的内容。

报告建议包含：实际取得的文章清单和采集范围；每篇核心观点、结构、证据和可引用段落位置；分类依据；跨篇共性、差异与局限；原文明确说法与研究者推断的区分；尚未取得的篇目与真实阻塞。任何“指定范围已完成”的表述都必须与索引、文件和实际取得数量一致。

用户授权的私有研究报告及文章全文不自动公开到 Git 或网站。公开技能、合成测试、规则说明与私有文章资料分开；遵守原作者版权，不把读取成功等同于可再分发全文。

批次功能以离线合成转换子进程和注入时钟验证，包括默认全量选择、可选试跑数量、停止条件、日期来源、复用与60秒节流约束。测试没有发起真实微信请求，也没有实际等待60秒；不等于真实公众号历史批次或 Windows / Linux 真机已经验收。原有真实单篇验证结论保持独立。
