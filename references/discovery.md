# 免登录微信：历史链接发现

单篇文章可以直接使用现有 HTTP 转换器。账号历史列表使用 DataXAPI 的公开服务：无需登录微信，须注册服务商账号并在本机环境配置 `DATAXAPI_API_KEY`。Key 不应粘贴到聊天、命令参数、文章或 Git；按服务商控制台教程设置本地环境变量。Windows 用进程环境变量，macOS/Linux 用当前终端环境变量或本机秘密管理器。

服务商官方文档（2026-11-10 核对）：

- [文章列表参数、返回结构、分页与价格](https://dataxapi.com/zh/apis/wechat_mp/accounts/articles/list/)
- [服务商登录与 Key 配置入口](https://dataxapi.com/zh/signin/)

官方文档列出每页 $0.02；免费次数和实际价格以控制台为准。脚本默认只调用一页以便核验数据和费用；`--pages all` 遍历服务商可见全部页，没有文章篇数上限。分页之间等待60秒，错误立即停止，服务商内部采集机制不受本脚本控制。

## 账号定位

需要已核验的公众号原始 ID，通常以 `gh_` 开头。名称可通过服务商 `wechat.accounts.search` 或正常可访问的公众号介绍核对；当前脚本尚未自动执行名称搜索。不要把重名账号直接视为目标。

本次目标：Best in Class，原始 ID `gh_47bcb0437f6f`，微信号 `BiotechCatalysts`；该映射来自本机已核验文章元数据，不依赖用户重新登录微信。

## 获取与转换

```sh
sh scripts/run.sh --discover --id gh_47bcb0437f6f --account 'Best in Class' --pages 1 --output-dir ./discovery-trial
sh scripts/run.sh --batch --links ./discovery-trial/discovered-links.json --account 'Best in Class' --limit 10 --output-dir ./article-trial
```

Windows 将 `sh scripts/run.sh` 改为 `& .\scripts\run.ps1`；其余参数相同。

`discovery.json` 保存状态、页数和下一页游标；`discovered-links.json` 可直接交给批次下载器。逐条检查返回的 `author.id`，转换时再用 `--account` 核对实际正文的公众号名称。服务商日期保留为外部日期，不能覆盖正文日期。

需要继续时，把 `discovery.json` 的 `next_cursor` 原样传入 `--cursor`，换新输出目录。服务商游标通常一小时过期；过期后停止，在控制台确认情况。新目录包含本次续接的链接，原目录继续保留；合并时按 URL 去重。同一文章长短链可能不同，下载前仍需核对。

```sh
sh scripts/run.sh --discover --id gh_47bcb0437f6f --pages all --cursor '<上一批 next_cursor>' --output-dir ./discovery-next
```

`provider_exhausted` 表示服务商此次无后续页，不能证明涵盖已删除、付费或所有历史文章。脚本固定 `complete_history_verified: false`。检索命中的公开搜索引擎结果可补充链接，其覆盖情况同样需要标注。

## 本次验证边界

2026-11-10：DataXAPI 无凭证请求返回 HTTP401，未收费；本机未配置该服务的 Key。分页和下载清单衔接使用合成响应通过验证，账号级真实覆盖尚待有效 Key 验证。Best in Class 另有3篇真实正文已保存，其中2篇是本次直接 HTTP 转换，1篇复用此前验证文件；这3条链接来源于本地缓存，不能算作第三方接口的成功结果。
