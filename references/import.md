# 粘贴链接导入（`--import`）

手机上看公众号，最顺的攒文方式是「右上角 → 分享 → 复制链接」。复制出来的并不是干净的 URL，而是一段带着标题、换行、跟踪参数甚至会话凭证的文本。`--import` 就是把这段东西直接变成可下载清单的入口：不要求用户写 JSON、不要求从电脑端找链接。

## 什么时候用它

| 场景 | 该用哪个入口 |
|---|---|
| 公开索引已收录该公众号，要按名称取历史 | `--archive --name` |
| 索引没收录，但手上有零散的真实链接 | **`--import`** |
| 已有一份自己核验过的顺序清单 | `--batch --links` |
| 只有一篇文章 | `--url` |

`--import` 与 `--batch` 的区别只在入口：`--import` 负责把「人话文本」压成 `links.json`，之后完全走 `--batch` 的串行下载与 `--classify` 的归类逻辑。判据、限速、失败即停、`remaining-links.json` 续接全部共用，不存在两套行为。

## 命令

```sh
# 从剪贴板直接读（macOS）
pbpaste | sh scripts/run.sh --import --from - --output-dir ./imported --account '公众号名称'

# 从文件读，Windows PowerShell
Get-Clipboard | & .\scripts\run.ps1 --import --from - --output-dir .\imported --account '公众号名称'

# 先只出清单，人工过目，再决定是否下载
sh scripts/run.sh --import --from ./粘贴.txt --list-only --output-dir ./review
```

| 参数 | 说明 |
|---|---|
| `--from PATH` | 纯文本文件；`--from -` 读 stdin（终端直连时会提示改用管道） |
| `--output-dir DIR` | **必须是新目录**；已存在则直接报错，不覆盖上一次结果 |
| `--list-only` | 只清洗出清单并写 `links.json`／`import.json`／`import-report.md`，不联网 |
| `--limit N` | 本次只处理前 N 条 |
| `--days N` / `--since` / `--until` | 时间要求，语义同 `--archive` |
| `--account` | 期望公众号名称；正文实际账号不符即停止 |
| `--interval` | 相邻两篇的间隔秒数，不得小于 60 |
| `--rules` | 归类规则 JSON |

## 清洗规则

**只留文章身份，丢掉会话凭证。** 微信分享链接里的 `key`、`pass_ticket`、`uin` 属于登录态与设备标识，跟着归档落盘就是凭证泄漏；`scene`、`from`、`sharer_sharetime` 之类是传播来源统计，对定位文章没有任何作用。

- 保留：`__biz`、`mid`、`idx`、`sn`、`chksm`
- 丢弃：其余全部，去重排序后记入 `import.json.stripped_params`
- `http://` 自动升级为 `https://`（转换器拒收明文链接）
- `&amp;` 实体先还原再解析
- 非 `mp.weixin.qq.com` 域、非 `/s` 路径（主页、话题页、`/mp/...`）、带端口或带账号密码的伪地址一律拒绝

**按 `mid+idx` 去重。** 这是微信文章的稳定身份；短链（`/s/AbCdEf`）没有参数可取，退化为整 URL 比较。重复项不静默丢弃，写进 `import.json.duplicates` 并标注首次出现的行号，便于核对用户到底重复粘了几次。

## 标题怎么来

微信分享面板的格式就是「标题换行链接」，所以链接**上一行**的纯文字是标题候选。规则刻意保守：

- 链接同行还有文字 → 用同行文字（最常见于「标题 https://...」一行式粘贴）
- 否则回退到上一行纯文字，且仅在**这一行只有一个链接**时使用；一行多个链接不猜归属
- 纯日期（`2026-11-05`、`2026/11/05`）、纯序号（`1.`、`2）`）不算标题
- 空行表示上一篇结束，候选标题立即作废，避免串到下一篇
- 被当作标题用掉的行不再计入「未采纳」

标题只作为 `links.json` 的 `title` 提示位；真实标题始终以正文 `og:title` 为准，粘错也不会污染成稿。

## 产物

| 文件 | 内容 |
|---|---|
| `links.json` | 可直接喂给 `--batch` 的清单，`ordering` 记为「paste order is processing order」 |
| `import.json` | 状态机：`list_ready` → `downloading` → `classifying` → `imported_and_downloaded`／`stopped`；含 `counts`、`stripped_params`、`duplicates`、`rejected`、`date_window` |
| `import-report.md` | 给人看的：将按此顺序处理 / 重复链接 / 未采纳的行（含行号与原因） |
| `articles/` | `--list-only` 之外才会生成，结构同 `--batch` |
| `classified/` | 同上，含 `catalog.json` 与 `INDEX.md` |

粘贴顺序就是处理顺序，不重排、不按日期猜顺序。一条有效链接都没有时报 `No valid mp.weixin.qq.com article URL found`，且**不创建输出目录**，不留空壳。

## 边界

- 不做短链扩展：`/s/xxxx` 这类短链直接可用，但不预先请求解析；解析发生在下载阶段。
- 不从正文反推被删文章：链接失效就是失效，报失败保留进度，不猜。
- 不因为某条链接失败而跳过后续：这是与 `--batch` 一致的「首个失败即停」，由 `remaining-links.json` 续接。
- `import-report.md` 只是导入记录，不是转载授权。全文与配图著作权归原作者与原发布账号。
