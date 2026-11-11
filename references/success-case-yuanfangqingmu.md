# 成功案例：远方青木近十日头条 → 68 页成册 → 线上第二案例

> **状态**：2026-11-11 实测完成，证据为本机产物、Git 提交与线上 HTTP 复核。
> **性质**：仓库级复用经验文档，随 `main` 维护；**不在 v0.6.0 发布 ZIP 内**，不影响运行时。
> **范围**：仅覆盖 2026-11-01 ~ 11-10 的十日头条，不是公众号完整历史归档。

## 1. 结论与适用边界

本案例回答一个常见问题：**免费公开索引不收录目标公众号时，如何不越界地走通端到端交付。**

| 环节 | 事实 |
|---|---|
| `--free-discover --name "远方青木" --limit 10` | 返回 `provider_exhausted`、`reported_total=0`、`links=[]`；ByDrug 公开作者目录无收录 |
| 处置 | 不擅自切换收费 DataXAPI，不绕过登录／验证码；改走「公开检索交叉核验 → 已核验链接清单 → `--batch`」 |
| 核验结果 | 十日范围确认 8 篇头条；其中 6 篇取得原号微信原文全文，2 篇仅有署名镜像／授权转载号全文 |
| 存疑项 | 11-03、11-07 标注「未发现，不能确认休更」；10-31 为范围外边界项，不纳入发布日口径 |
| 归档结果 | 6/6 `converted`，`failed 0 / pending 0` |

**关键原则**：`--free-discover` 的 `reported_total=0` 只说明该索引未收录，不证明公众号没有文章；反过来，8 篇核验成功也不等于历史已经完整。

## 2. 八步链路与可复用命令

### 2.1 发现并如实记录缺口

```sh
sh scripts/run.sh --free-discover --name "<公众号名称>" --limit 10 --output-dir "<新目录>"
```

保留 `discovery.json`，把 `provider_exhausted` 写进交付说明。

### 2.2 公开检索交叉核验（不猜测）

按证据强度排序，逐篇记录来源：

1. 原号微信原文页（可读取精确发布时间与全文，最高强度）；
2. 署名镜像（如新浪财经 roll 的 `.shtml.md` YAML frontmatter，含 `source` / `datetime` / `canonical_url`）；
3. 授权转载号全文；
4. 微博媒体页转发清单、第三方原创合集编号，用于确认发布日与转发日错位。

**禁止**：凭 `mid` 递增规律推测拼接原号 URL。2 篇原号 URL 未核实的篇目在成册与元数据中明确标注，只作为「镜像／转载全文」使用。

### 2.3 已核验链接清单

```json
{
  "ordering": "公众号发布日升序；依据：微信原文页时间 + 镜像 frontmatter + 原创合集编号",
  "links": [
    { "url": "https://mp.weixin.qq.com/s?__biz=...", "title": "...", "published_at": "..." }
  ]
}
```

**所有 URL 必须是 `https://`**。`http://mp.weixin.qq.com` 会被转换器直接拒绝，返回 `Only HTTPS mp.weixin.qq.com article URLs are supported`。

### 2.4 串行批次归档

```sh
sh scripts/run.sh --batch \
  --links "<已核验链接.json>" \
  --output-dir "<新批次目录>" \
  --account "<已核验公众号名称>"
```

单并发、相邻请求至少间隔 60 秒；首个验证码／403／429／缺正文／账号不符即停止。读取 `batch-index.json` 与实际 `NNN/article.md` 报告成功数，不把待处理项算作成功。本例 6 篇归档 Markdown 合计约 63 KB。

### 2.5 成册排版（跨 Skill 交接）

交给「标准蓝画册排版」Skill（A4 单栏默认）：

```sh
python <标准蓝画册 Skill>/references/build_article_digest.py \
  --batch-dir "<批次目录>" \
  --config <标准蓝画册 Skill>/samples/article_digest.example.json \
  --out "<输出>/book.pptx" --render-pdf
```

- 前四章为整理者归纳的观察摘要，第五章为**公众号原文附录**；两类内容必须分开标注，不得把归纳写成原文观点。
- 归档 Markdown 的无损清洗边界：只删 YAML frontmatter、`# 标题`、`---` 分隔线、含「主页右上角加星标」的运营引导语；正文句子一字不改。
- 本例成册 V1.4：68 页 A4，391 段全文，34 张配图。

### 2.6 配图本地化与原位插入

- 从归档 Markdown 提取 `mmbiz.qpic.cn` 图片 URL，带 `Referer: https://mp.weixin.qq.com/` 抓取，归一扩展名，生成 `image_manifest.json`（记录真实宽高、`aspect`、篇号、序号、来源 URL）。
- 用 `inline_image` 块把配图留在正文流中按原出现位置插入，**不要用文字占位**（如「原文配图 N，本册从略」）。
- 渲染高度与分页成本必须同源（`inline_image_h()`），等比居中，不拉伸到栏宽。

### 2.7 验收

见 §4「验收门槛」。

### 2.8 发布为线上案例

- 新增 `reports/<案例>.pdf`、`assets/<封面>.webp`、`reports/manifest-<案例>.json`、`case-data-<案例>.json`。
- 在 `docs/site/index.html` 增加案例卡片与导航；`docs/site/site-manifest.json` **全量重算**所有文件的 `bytes` + `sha256`（本例 19 个文件）。
- `git push` 到 `main` 触发 `.github/workflows/pages.yml`（监听 `docs/site/**`）；`build_type: workflow`、源 `main /`、发布目录 `docs/site`。
- 部署后用 `curl` 复核新资源 200、旧资源 404、首页关键字命中、线上 `site-manifest.json` 的 `release_id` 一致。

## 3. 失败点与修复（本次实测）

| 现象 | 根因 | 修复 |
|---|---|---|
| `--free-discover` 返回 0 条 | ByDrug 公开索引不收录该号 | 改走已核验清单 + `--batch`；不切付费接口 |
| 单篇转换报 `Only HTTPS ...` | 链接为 `http://mp.weixin.qq.com` | 清单统一改为 `https://` |
| 默认 Python 3.13 缺 `python-pptx` | 解释器环境差异 | 显式使用带 `python-pptx 1.0.2` 的 Python 3.12 |
| 附录只有「原文配图 N，本册从略」文字 | 归档 Markdown 里是图片占位行 | 下载并归一配图，改用 `inline_image` 原位插入 |
| 配图被踢到独立图版页 | 原 `image` 块会触发 `flush_body()` 走通栏／gallery | 新增 `inline_image`，留在流式分页中 |
| 封面初版做成带蓝边的「图窗」 | 误解标准蓝封面几何 | 反推引擎可见区 `u∈[0,0.8496]、v∈[0.1001,0.6023]`，上半全出血图 + 下部蓝块 |
| 长章名在章节页断行并压住英文眉题 | `render_chapter` 标题框仍是 B5 遗留 14.2cm | 本轮用短章名规避；引擎根因未修 |
| 全文锚点校验假报「顺序倒退」 | 前四章摘要含相同前缀，全局 `find` 回到前章 | 从「附录索引」位置起推进游标做顺序命中 |
| 封面出现 `v1.2` | 合成封面时把版本号烘焙进位图 | 封面禁版本号（标准蓝 Skill §4.18 / V2.5.1）；版本号只留文件名与元数据 |
| 线上点开是 18 页摘要版而非最新版 | 整理者基于版权主动降级，未与委托方确认 | 按委托方决定换成 68 页 V1.4 完整版；**重大内容取舍必须先确认** |
| `git ls-remote` 超时 | 本机直连 GitHub 不可达 | 使用 `http://127.0.0.1:7897` 代理 |
| 本地落后远端 2 个提交 | 直接提交会覆盖他人成果 | 先快照 + stash + `merge --ff-only`，再在远端最新上重做最小变更；禁止强推 |

## 4. 验收门槛（每次交付逐项留证）

| 项目 | 方法 | 本例结果 |
|---|---|---|
| 全文完整性 | 每段取前 12 个非空白字符作锚点，从附录起点推进游标顺序命中 | **391/391，0 缺失** |
| 配图 | `python-pptx` 枚举 `MSO_SHAPE_TYPE.PICTURE`；核对宽高比与图注顺序 | 35 = 1 封面 + 34 附录；**34/34 等比**；图注 `[4,4,4,3,16,3]` |
| 版式 | 按实际栏式二选一：`audit_overflow_single.py` / `audit_overflow.py` | 单栏 bbox **PASS**；越右 0、越底 0 |
| 字体 | `pdffonts` 确认嵌入 | 全部 `emb yes` |
| 单测 | `PYTHONPATH=. python -m unittest discover -s tests -v` | Skill 侧 14/14 OK；本仓库 `npm test` 40/40 |
| 站点清单 | 遍历 `docs/site/` 重算 `bytes` + `sha256`；校验 HTML 本地链接 | 19 文件全一致；21 条链接零缺失 |
| 线上 | `curl -o /dev/null -w '%{http_code}'` | 新 PDF 200 / 旧 PDF 404 / 两张封面 200 |
| Git | `fetch` 后 `rev-list --left-right --count HEAD...origin/main` | `0 / 0`，`ls-remote` 与本地 HEAD 一致 |

## 5. 合规与内容边界

1. 不请求公开索引第 4 页、不绕过登录／验证码、不自动切换付费接口；遇阻断停止并保留进度。
2. 图片只按原 URL 带 `Referer` 抓取作本地归档；`images_offline: false` 的归档不得称为离线图片归档。
3. 未核实的原号链接标注为「未核实」，不用其他公众号文章凑数，不把「未发现」写成「确认休更」。
4. 用户私有报告、全文与配图**不自动上传 Git、发布网站或分享**；发布需当次明确授权。
5. 公开 PDF 若含公众号原文全文与配图，必须在案例页、`reports/manifest*.json`、`case-data*.json` 写明著作权归原作者及原发布账号、仅限个人非商业查阅核验、不得转载摘编。该声明不能替代原作者授权；如无法接受风险，改用不含全文与配图的摘要版。
6. 内部参考版与公开版要显式区分，文件名、元数据 `includes_full_text`、页面说明三者一致。

## 6. 与「标准蓝画册排版」Skill 的协作契约

| 项 | 约定 |
|---|---|
| 输入 | 本 Skill 的 `--batch` 产物：`batch-index.json` + `NNN/article.md` + 图片 manifest |
| 承接能力 | `build_article_digest.py` 汇编、`inline_image` 原位配图、标准蓝封面合成、PPTX/PDF、bbox 审计 |
| 封面规范 | 不得出现版本号，见该 Skill `SKILL.md` §4 硬规则 18（V2.5.1）；位图内烘焙文字同样适用 |
| 版本命名 | 交付物统一大写 `VX.X.X`；Skill `metadata.version` 用语义化版本（如 `2.5.1`），两者不混用 |
| 输出 | `.pptx` / `.pdf` / `page_types.json` / `site-manifest.json`，均为可复核证据 |

## 7. 本次产物与证据索引

| 类型 | 位置 |
|---|---|
| 数据底稿 | `output/research/yuanfangqingmu-headlines.md`（本机构建目录，不入库） |
| 批次归档 | `output/batch-2026-11-11/001..006/article.md`（本机构建目录，不入库） |
| 成册交付 | `output/远方青木近十日头条观察_V1.4.pptx` / `.pdf`（68 页 A4） |
| 线上案例 | `reports/yuanfangqingmu-headline-review-v1.4.pdf` + `case-data-yuanfangqingmu.json` + 封面 |
| 本仓库提交 | `8b23de1`（第二案例发布）、`9515426`（封面去版本号 / PDF 换 V1.4） |
| 标准蓝 Skill 提交 | `f7fbf55`（V2.5.0 手册能力）、`cefc1c0`（V2.5.1 封面禁版本号） |
| 站点 | `https://dashizhihuan2018-source.github.io/wechat-article-to-md-skill/#case-yuanfangqingmu` |
