# 微信文章整理skill

[宣传网站与教程（GitHub Pages）](https://dashizhihuan2018-source.github.io/wechat-article-to-md-skill/) · [下载 v0.6.0](https://github.com/dashizhihuan2018-source/wechat-article-to-md-skill/releases/tag/v0.6.0)

宣传站的技能包、PDF报告、字体、图片和环境教程均为站内资源；下载使用原 v0.6.0 发布包并保留 SHA256 校验，GitHub 源码与 Release 作为独立入口。

根据「Obsidian同步助手」实际 v13 小程序代码包逆向，复刻其中微信文章读取、正文清洗与 Markdown 转换规则。核心是 JSDOM + 微信正文选择器 + Turndown 7.2.0；[证据与差异](references/reverse-evidence.md)记录了实际函数与限制。

![微信文章整理skill 技术路径](docs/assets/technical-path.png)

输入公众号名称，自动查找账号、分页获取可见历史、下载并按正文归类：

```sh
sh scripts/run.sh --archive --name '公众号名称' --output-dir './account-archive'
```

默认使用免费的 ByDrug 公开作者索引发现原微信链接，再直接读取微信正文；无需 API Key、微信登录或付费服务，适用于该索引已收录的公众号。首次试10篇可加 `--trial 10`；技能本身不设10篇上限，但索引站未登录只开放3页，程序遵守该范围。网站显示的收录总数不代表全部可下载，更不等于公众号完整历史。[名称归档、分类与续接教程](references/archive.md)说明来源核验、状态与自定义规则。

2026-11-11，已通过免费路径完成 **Best in Class 10/10篇真实微信原文下载及10/10篇正文归类**，没有复用旧种子文件。主分类为临床研究6篇、商业合作与渠道2篇、AI与药物发现1篇、企业财报与专利1篇。这是公开索引可见顺序的前10条，不是“最新10篇”或“全部历史”的保证：

```sh
sh scripts/run.sh --archive --name 'Best in Class' --trial 10 --rules references/medicine-rules.json --output-dir './best-in-class-trial'
```

这10篇的内容研究案例见[在线报告与PDF下载](https://dashizhihuan2018-source.github.io/wechat-article-to-md-skill/#research)：《创新药竞争的三条主线》，采用A4标准蓝画册，附十篇原文索引。

方法见 [免费发现实战教程](references/free-discovery.md)。旧 DataXAPI 路径保留为显式可选项 `--provider dataxapi`，不会因免费来源缺失而自动调用或收费。

下载完整发布包、解压即可运行。启动器自动检测 Node.js；缺失时从官方源下载、校验并安装到用户私有目录。转换依赖已打包，无需 npm 安装：

```sh
sh scripts/run.sh --url 'https://mp.weixin.qq.com/s/文章ID' --output './output/文章.md'
```

Windows PowerShell：

```powershell
& .\scripts\run.ps1 --url "https://mp.weixin.qq.com/s/文章ID" --output ".\output\文章.md"
```

[完整环境检测、自动安装与故障处理教程](references/environment.md)包含系统要求、下载校验、安装位置和手动准备方法。已有 Node.js 18+ 时也可直接运行 `node scripts/wechat-to-md.cjs ...`。

## 作为 Skill 安装

从 [v0.6.0 发布页](https://github.com/dashizhihuan2018-source/wechat-article-to-md-skill/releases/tag/v0.6.0) 下载 ZIP，解压得到 `wechat-article-to-md-skill` 文件夹。`.skill` 附件也是同内容 ZIP，供支持该格式的技能管理器导入。

Codex 用户将文件夹复制到以下目录，确认 `SKILL.md` 直接位于该文件夹内，再重新打开会话：

- macOS / Linux：`~/.codex/skills/wechat-article-to-md-skill/`
- Windows：`%USERPROFILE%\.codex\skills\wechat-article-to-md-skill\`

对智能体说：“使用 $wechat-article-to-md-skill，把这个微信文章链接保存为 Markdown：……”即可。无需绑定 Obsidian 或提供原作者服务的账号；输出目录由使用者指定。其他支持 `SKILL.md` 的智能体可按其技能目录约定放置同一文件夹。

也可转换已正常取得的真实 HTML：

```sh
node scripts/wechat-to-md.cjs --url 'https://mp.weixin.qq.com/s/文章ID' --html './page.html' --output './output/文章.md'
```

成功写入 Markdown 和状态文件，例如 `文章.md` 与 `文章.md.status.json`；图片仍为远程 URL。退出码0表示转换成功，2表示需要验证或访问受限，1表示其他失败。输出路径须不存在。

2026-11-10，最终运行包已直接通过 HTTP 读取指定真实微信文章并生成 3,753 字节 Markdown；与原小程序保存结果相比，正文移除排版空白后完全一致（1,331字符）。16例原解析函数差分和15项本地测试全部通过。作者、发布时间等元数据与线上版仍有差异，详见[验证记录](references/reverse-evidence.md#真实单篇验证)。

微信可能向本机请求返回验证页。遇到验证立即停止，**不保证任意文章、网络或平台都能只凭链接取得全文**。图片保留远程链接。已验证的10篇试跑不代表全历史完整性已验收。

## 串行批次与正文研究

按名称自动执行免费发现、下载、归类请用 `--archive`。仅需免费链接表时，运行 `sh scripts/run.sh --free-discover --name '公众号名称' --limit 10 --output-dir ./discovery`；发现的链接可交给 `--batch`。旧 DataXAPI 方法另见 [可选服务商教程](references/discovery.md)，不属于默认免费流程。

支持用户已授权、已核验顺序的文章清单，不设固定篇数上限。默认处理清单中的全部文章；`--limit` 只用于试跑少量样本，不是产品上限。通过名称搜索或正常可访问的公众号历史列表核对账号与链接，记录排序依据。访问受限时保留已有文章与进度。

将链接按已核验顺序存为 JSON 或一行一条 URL 的文本文件，然后在**新的输出目录**运行：

```sh
sh scripts/run.sh --batch --links ./verified-links.json --output-dir ./new-batch --account '已核验公众号名称'
```

```powershell
& .\scripts\run.ps1 --batch --links .\verified-links.json --output-dir .\new-batch --account "已核验公众号名称"
```

两个启动器的 `--batch` 都复用自动 Node.js 准备与私有运行时；已有 Node.js 时也可执行 `node scripts/batch.cjs ...`，无需 npm。单并发，上一条实际转换进程完成后至少等待60秒，再启动下一条；`--interval` 只接受60秒及以上。首个验证、403/429、缺正文、其他失败或账号不匹配即停止。首次试跑可在清单前只放少量链接，或传 `--limit 10`；试跑完成后从完成项之后继续处理剩余链接。既有单篇转换器的正文逻辑和有限重读行为保持不变，批次层不添加重试。

输出包含 `001/article.md` 等编号目录、每篇状态文件、`batch-index.json`、`manifest.json` 和 `remaining-links.json`。外部 `published_at` 保留为 `supplied_published_at`，文章解析日期、真实采集时间及各自来源分开记录；不把列表日期冒充实际读取日期。

停止后不覆盖原产物。正常验证恢复且人工核对剩余列表后，以 `remaining-links.json` 和新的输出目录继续；列表包含首次失败项，不会自动请求。可通过 `reuse_markdown` 复用带匹配源 URL、成功解析与原状态文件的真实种子，避免重复请求。

已有批次可执行 `sh scripts/run.sh --classify --batch-dir ./new-batch --output-dir ./classified`。分类器核验哈希、账号和链接后按正文关键词生成主目录、多标签和命中片段，支持JSON规则；`--archive` 自动执行此步骤。智能体可继续读正文做研究。私有研究报告和全文不随技能公开。字段与报告方法见 [批次整理与研究教程](references/batch-report.md)。合成测试与真实验证分开记录：本版已完成免费路径的10篇真实下载、身份核验和正文归类，全历史完整性仍未验收。

`SKILL.md` 是智能体入口。发布的可执行脚本已自包含，不需要调用原作者 API 或提供微信凭证。

## 案例图

下图使用人民日报微信公众号的旅行与城市影像文章《微视频 | 陕西24小时》作为真实单篇转换示范。文章视频不转录，图片在 Markdown 中保留远程链接。

![人民日报旅行文章转换案例](docs/assets/people-daily-case.png)

## GitHub 仓库二维码

<p align="center"><img src="docs/assets/github-qr.png" width="180" alt="微信文章整理skill GitHub 仓库二维码"></p>

## 开发与验证

```sh
npm ci --ignore-scripts
npm run build
npm test
```

`src/` 是可读复刻实现，`scripts/wechat-to-md.cjs` 是生成的运行文件。构建关闭 JSDOM 的同步 XHR worker 定位；转换器不执行网页脚本，不加载远程资源，不使用 XHR。`THIRD_PARTY_NOTICES.md` 保留打包依赖的许可证。原小程序完整代码与真实文章不随开源包发布。

## 案例封面规范

宣传站 `docs/site/assets/` 下的研究报告封面（含 AI 生成或 PIL 合成的位图）**不得出现 `v1.2` / `V2.5.0` / `版本：x.x` 等版本号**，左下角只保留作者、发布日期、批次或密级。版本号仅写入文件名、`reports/manifest*.json`、`site-manifest.json` 等机器可读元数据。该规则为「标准蓝画册排版」Skill `SKILL.md` §4 硬规则 18（v2.5.1）的站点侧落实；每次更换封面需重算 `site-manifest.json` 的 bytes/sha256 并目视复核左下角落款。

## 成功经验与跨 Skill 复用

- [成功案例：远方青木近十日头条 → 68 页成册 → 线上第二案例](references/success-case-yuanfangqingmu.md)：八步链路、12 个失败点与修复、8 项验收门槛、6 条合规边界，以及与「标准蓝画册排版」Skill 的协作契约。适用于免费公开索引未收录目标公众号的场景。
- 该文档为**仓库级补充资料**，随 `main` 维护，**不在 v0.6.0 发布 ZIP 内**；安装后如需查阅请以仓库 `references/` 为准。运行时行为与 v0.6.0 一致，未改动 `scripts/`、`src/`、`tests/`。
