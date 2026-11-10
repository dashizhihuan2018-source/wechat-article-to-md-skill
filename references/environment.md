# 环境准备与自动安装

此 skill 的转换器已经自包含，只需要 Node.js 18 或更高版本，不需要 `npm install`、浏览器插件、服务端或原小程序。推荐直接运行下列启动器；首次发现缺少可用 Node.js 时，它会自动准备用户私有的官方 Node.js 24.x LTS。已有可用 Node.js 时，环境检测完全不联网；文章转换本身仍需访问文章地址，除非使用本地 `--html` 输入。

## 下载后直接使用

将完整 skill 目录解压到任意可读目录，保留 `scripts` 与 `references` 的相对位置。以下路径均替换成你实际保存的位置。运行命令时不要复制占位符。

macOS / Linux 终端：

```sh
sh "/你的路径/wechat-article-to-md-skill/scripts/run.sh" \
  --url "https://mp.weixin.qq.com/s/文章标识" \
  --output "/你的输出目录/文章.md"
```

Windows PowerShell（Windows 自带 5.1 或 PowerShell 7）：

```powershell
& "C:\你的路径\wechat-article-to-md-skill\scripts\run.ps1" `
  --url "https://mp.weixin.qq.com/s/文章标识" `
  --output "C:\你的输出目录\文章.md"
```

若 Windows 提示下载文件被阻止，请在确认来源和本地脚本内容后，通过文件属性中的“解除锁定”，或运行 `Unblock-File -LiteralPath "C:\你的路径\wechat-article-to-md-skill\scripts\run.ps1"`，再执行。若组织策略禁止运行脚本，请遵循组织策略并使用下文的手动 Node.js 命令；不要关闭系统执行策略。

离线 HTML、输出路径、其他转换器参数均按原样传给转换器，例如追加 `--html "/你的路径/真实页面.html"`。启动器不会修改转换规则。

## 自动补齐的具体行为

1. 检测 `PATH` 中的 `node` 是否能运行且版本至少为 18；可用就直接使用。
2. 检测本 skill 先前安装的私有 Node.js；可用就直接使用，不联网检查更新。
3. 都不存在时，在终端显示来源、平台、架构与安装位置，读取 [Node.js 官方 SHA256 清单](https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt)，严格匹配本机平台 / 架构的 24.x 文件，再用清单中选出的具体版本 URL 下载。
4. 核对 SHA256 后才解压并验证 Node.js 可执行。校验失败停止，不执行下载文件。包来自 `nodejs.org`，HTTPS 证书验证保持开启，不接受下载重定向；不执行远程安装脚本。`curl` 不读取 `.curlrc`，避免该配置意外关闭证书校验或启用重定向；代理环境变量仍可使用。
5. 安装成功后继续转换文章。退出码沿用转换器的结果；启动器的准备信息写向终端，转换器仍输出原有结果。

macOS / Linux 使用 `.tar.gz`，需要系统已有 `curl`、`tar`、`awk` 及 `sha256sum` 或 `shasum`。macOS 通常已具备这些工具；精简 Linux 缺少工具时，按发行版说明补齐，或手动安装官方 Node.js。Windows 使用系统 PowerShell 的下载、SHA256 和 ZIP 解压能力。

自动支持的架构由官方当期清单决定：macOS 的 x64 / arm64，Windows 的 x64 / arm64，Linux 的 x64 / arm64 / ppc64le / s390x；Linux 检测到 `/lib/ld-musl-*.so.1` 时严格请求对应 musl 包。没有精确匹配则停止，不下载其他架构或第三方替代包。Node.js 24 的系统版本与 libc 要求仍需满足；旧系统请从 [官方下载页](https://nodejs.org/en/download) 选择适合系统的受支持版本。这里“18+”是转换器最低运行门槛，不代表 Node.js 18 仍有官方维护。

私有安装目录：

| 系统 | 目录 |
| --- | --- |
| macOS / Linux | `${XDG_DATA_HOME:-$HOME/.local/share}/wechat-article-to-md/node/runtime-<平台>-<架构>` |
| Windows | `%LOCALAPPDATA%\WechatArticleToMd\node\runtime-win-<架构>` |

不使用 `sudo` 或管理员权限，不改全局 `PATH`，不覆盖系统已有 Node.js。自动准备需要可以访问 `nodejs.org`，以及私有目录的写权限与足够空间。私有运行时不自动升级；需要更新时先停止本 skill 的运行，再将对应 `runtime-*` 目录移至可恢复的位置，然后重试启动器。也可自行安装较新的官方 Node.js，启动器会优先使用 `PATH` 中的版本。

SHA256 清单与包都通过官方 HTTPS 获取，校验用于确认包与清单一致；启动器没有额外核验发行签名。

## 网络、代理、并发与中断

- 下载失败会明确报错并退出，不会自动转换到镜像站，也不会关闭 HTTPS 校验。检查网络、系统时间、组织网络要求与受信任的系统 CA 证书后重试。已有合适的 Node.js 时，不受运行时下载网络影响。
- macOS / Linux 的 `curl` 使用现有的 `HTTPS_PROXY` / `https_proxy`、`NO_PROXY` 等环境设置；PowerShell 7 可使用其支持的代理环境配置，Windows PowerShell 5.1 通常使用 Windows 系统代理。按组织要求设置代理，避免将代理凭证写入脚本或发布包。启动器不代为修改代理配置。
- 一个用户同时首次运行两次时，第二次可能看到 `.install-lock` 提示。等待首次运行结束后重试即可。没有自动抢锁或覆盖已有安装。
- 普通退出和下载错误会清理本次 `.install.*` 临时目录与锁。断电或强制终止可能留下残余；确认没有此 skill 的安装进程运行后，仅删除上述私有 `node` 目录里的 `.install-lock` 和 `.install.*`，再重试。不要删除用户文章或其他 Node.js 安装。
- 已有但无法运行的私有 `runtime-*` 目录不会被覆盖。检查权限和系统兼容性；必要时先将该私有目录移到可恢复位置，再重试或手动安装 Node.js。

## 手动官方安装与重试

打开 [Node.js 官方下载页](https://nodejs.org/en/download)，选择与你的系统 / CPU 相符的 LTS 安装方式。遵循官方安装说明，重新打开终端，执行 `node --version`，确认版本为 18 或更高，再重试上面的启动器命令。

也可以绕过启动器直接使用已安装的 Node.js：

```sh
node "/你的路径/wechat-article-to-md-skill/scripts/wechat-to-md.cjs" --url "https://mp.weixin.qq.com/s/文章标识" --output "/你的输出目录/文章.md"
```

## 验证范围

本机开发验证只执行已有 Node.js 的启动分支；未在开发机安装新的 Node.js。缺失 Node.js 的平台选择、校验失败与参数透传可用隔离的 mock 测试检查；这不代表真实下载、安装或跨平台运行已经验收。Windows、Linux 与其他 CPU 架构尚未真机测试。
