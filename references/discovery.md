# 免登录微信：历史链接发现

单篇文章可以直接使用现有 HTTP 转换器。账号历史列表使用 DataXAPI 的公开服务：无需登录微信，须注册服务商账号并在本机环境配置 `DATAXAPI_API_KEY`。Key 不应粘贴到聊天、命令参数、文章或 Git；按服务商控制台教程设置本地环境变量。Windows 用进程环境变量，macOS/Linux 用当前终端环境变量或本机秘密管理器。

服务商官方文档（2026-11-10 核对）：

- [文章列表参数、返回结构、分页与价格](https://dataxapi.com/zh/apis/wechat_mp/accounts/articles/list/)
- [服务商登录与 Key 配置入口](https://dataxapi.com/zh/signin/)

macOS 可将 Key 存入钥匙串服务 `wechat-article-to-md-skill.dataxapi`，账号为本机用户名；由智能体使用安全输入完成保存。读取并用于单次运行时可执行下式，Key不打印到终端，不写入项目：

```sh
DATAXAPI_API_KEY="$(security find-generic-password -a "$USER" -s 'wechat-article-to-md-skill.dataxapi' -w)" sh scripts/run.sh --archive --name '公众号名称' --trial 10 --output-dir ./name-trial
```

其他系统沿用本机秘密管理器或终端环境变量；不要把真实Key放进教程文件。

官方文档列出每页 $0.02；免费次数和实际价格以控制台为准。脚本默认只调用一页以便核验数据和费用；`--pages all` 遍历服务商可见全部页，没有文章篇数上限。分页之间等待60秒，错误立即停止，服务商内部采集机制不受本脚本控制。

## 账号定位

只给公众号名称时可用 `--archive --name` 自动调用服务商 `wechat.accounts.search`，处理同名情况并衔接发现、下载与归类；详见 [名称归档流程](archive.md)。独立 `--discover` 需要已核验原始 ID，通常以 `gh_` 开头，也支持服务商返回的其他字母数字 ID。

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

2026-11-10无凭证请求返回HTTP401。2026-11-11取得有效Key并实测名称搜索，5页未精确匹配目标后免费余额耗尽；指定ID历史接口返回HTTP402、charged:false。尚未验证该服务对目标历史文章的覆盖。Best in Class另有3篇真实正文已保存并归类，其中2篇直接HTTP转换、1篇复用旧结果；链接来自本地缓存，不能算作第三方发现成功。
