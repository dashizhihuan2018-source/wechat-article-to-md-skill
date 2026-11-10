# 网站标题字体

本目录的 `wechat-archive-serif-bold.woff2` 是 Adobe 官方 **思源宋体简体中文 Bold（Source Han Serif SC Bold）** 的网页子集，字重为真实 700。保留原标题字形与布局特性，仅裁去本网站未使用的字符并转换为 WOFF2；未使用或再分发系统专有字体。

## 来源与许可

- 官方项目：https://github.com/adobe-fonts/source-han-serif
- 固定版本提交：`7889f11bf31170b5d092a083b357c8c8130f89e0`
- 原始字体：https://raw.githubusercontent.com/adobe-fonts/source-han-serif/7889f11bf31170b5d092a083b357c8c8130f89e0/OTF/SimplifiedChinese/SourceHanSerifSC-Bold.otf
- 原始许可：https://raw.githubusercontent.com/adobe-fonts/source-han-serif/7889f11bf31170b5d092a083b357c8c8130f89e0/LICENSE.txt
- 许可：SIL Open Font License 1.1，完整原文保留在 [OFL.txt](OFL.txt)。该字体子集继续受 OFL 1.1 约束，不受仓库其他代码许可证替代。
- 原始 OTF SHA256：`706b8c0de2deff6cbc0c87e2cdedfd33a78b7ffd76cebb4549012f197ba611fe`

根据 OFL 的 Reserved Font Name 条款，子集的内部字体名及 CSS 别名改为 `Wechat Archive Serif`。这是对思源宋体字形子集的许可性重命名，不代表 Adobe 为本网站提供背书。

## 子集与复现

子集脚本提取 `index.html`、`styles.css`、`tutorial.js`、`case-data.json` 的全部字符，加上可打印 ASCII。当前覆盖 584 个 Unicode 码位，包含 1,328 个字形（包括布局替换字形），无缺失码位，已包含主标题“微信公众号文章，可以批量下载啦”的全部文字。新增网站文字后需重新生成子集。

下载上面的官方 OTF 后，在项目根目录运行（Python 3 + fonttools + brotli）：

```sh
python3 -m pip install 'fonttools[woff]' brotli
python3 docs/site/assets/fonts/build_subset.py /path/to/SourceHanSerifSC-Bold.otf
```

当前网页资源：262,288 字节（256.1 KiB），SHA256：`851baeb70ffc4aeab2cdaab437f70fd15e2a2027abe6189606e9e22fbf7f7d3e`。完整原字库不随网站分发。
