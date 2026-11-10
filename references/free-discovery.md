# 免费、免微信登录：Best in Class 的10篇实战

## 技术路径

ByDrug 的[公开作者页](https://bydrug.pharmcube.com/news/summary/source/Best%20in%20Class)按来源名称聚合文章，详情页提供“查看原文”链接。技能免费发现这些原始微信公众号链接，再由本机转换器直接读取微信原文；无需 API Key、微信登录、原小程序或自建服务器。

公开索引发现是本技能新增扩展；正文读取、清洗和 Markdown 转换仍复刻原小程序 v13 规则，详见 [逆向证据](reverse-evidence.md)。不将免费索引功能归为原小程序的逆向成果。

## 一条命令复用

解压完整技能包，在技能目录执行：

```sh
sh scripts/run.sh --archive --name 'Best in Class' --trial 10 --rules references/medicine-rules.json --output-dir ./best-in-class-trial
```

Windows：

```powershell
& .\scripts\run.ps1 --archive --name 'Best in Class' --trial 10 --rules references/medicine-rules.json --output-dir .\best-in-class-trial
```

启动器复用 Node.js；缺失时按 [自动准备教程](environment.md) 从官方源下载、校验并放入用户私有目录。不用 npm 安装，输出目录必须是新目录。

## 核验同一公众号

1. 作者索引标题及每条记录的来源名称匹配输入名称。
2. 详情页来源名称再次匹配；仅提取 `a.origin_link` 指向的 HTTPS 微信文章链接。
3. 原链接须带完整 `__biz`、`mid`、`idx`、`sn`，同批 `__biz` 一致；额外已核验标识可通过独立发现命令的 `--biz` 指定。
4. 下载正文后，实际提取的公众号名称仍须匹配目标，并记录状态、字节数与 SHA256。
5. 分类器再次核验源URL、账号和哈希，只使用已保存正文，不根据索引摘要或标题补写内容。

打包内的 JSDOM 只读解析HTML，不执行网页脚本或加载远程资源。镜像页只提供发现证据，其正文不计作直接微信原文下载。

## 10篇真实结果

2026-11-11，本次公开索引前10条全部取得真实微信正文：10次转换成功、0次复用、0次失败，10篇全部归类。

| 主分类 | 篇数 |
| --- | ---: |
| 临床研究 | 6 |
| 商业合作与渠道 | 2 |
| AI与药物发现 | 1 |
| 企业财报与专利 | 1 |

`articles/batch-index.json` 与每篇 `article.md.status.json` 记录下载结果；`classified/catalog.json` 包含多标签、命中词、正文证据；`classified/INDEX.md` 供阅读跳转。副本保留原Markdown，图片仍为远程URL。

公开教程展示方法、统计与验证边界。本案例的内容研究报告《创新药竞争的三条主线》提供[在线阅读与PDF下载](https://dashizhihuan2018-source.github.io/wechat-article-to-md-skill/#research)，附录为原文标题、链接与二维码。第三方文章全文、私人分类证据与其他未经确认公开的报告不上传公有 Git。

## 覆盖范围

作者页本次显示共收录62条，但未登录只开放前3页。程序遵守范围，不取第4页、不绕过登录；达到范围后报告 `public_access_limit`，归档为 `partial_history_archived`。这是上游访问条件，不是技能的10篇产品上限。

`--trial 10` 只选择本次样本。来源排序、延迟和遗漏意味着这些不一定是公众号最新10篇；62条也不等同于全部历史。未收录公众号、已删除或未公开文章无法由此方法保证取得。

实测还发现分页元数据差异：第一页显示62条，第二页仍有真实文章，但页面总数会误显示为0。程序保留已见到的最大收录数，并核对请求页号与返回页号、去重原文标识，避免把第二页的0误当成历史已穷尽；同时遵守未登录3页范围。

身份不符、原链接不完整、页面要求验证、403/429、缺正文或正文账号不符时停止并保留进度。不将其他公众号相似标题计入目标，不用镜像全文冒充原文；免费来源缺失时不自动调用收费接口。
