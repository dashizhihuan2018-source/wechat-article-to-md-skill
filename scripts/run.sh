#!/bin/sh
# Bootstrap only the runtime; the converter is self-contained (no npm install).
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
entry=wechat-to-md.cjs
if [ "${1:-}" = --batch ]; then entry=batch.cjs; shift; fi
if [ "${1:-}" = --discover ]; then entry=discover.cjs; shift; fi
fail() { printf '%s\n' "环境准备失败：$*" "请参阅 $script_dir/../references/environment.md；也可从 https://nodejs.org/en/download 安装 Node.js 18+ 后重试。" >&2; exit 1; }
usable_node() { "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' >/dev/null 2>&1; }

# A working PATH runtime needs no network, cache creation or installation.
if command -v node >/dev/null 2>&1 && usable_node "$(command -v node)"; then
  exec "$(command -v node)" "$script_dir/$entry" "$@"
fi

case $(uname -s) in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *) fail "自动安装仅支持 macOS / Linux；此系统请手动安装 Node.js。" ;;
esac
case $(uname -m) in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  ppc64le|s390x) arch=$(uname -m) ;;
  *) fail "没有为此架构配置官方二进制包：$(uname -m)。" ;;
esac
# Alpine and other musl distributions must not receive a glibc binary.
if [ "$platform" = linux ]; then
  for musl_loader in /lib/ld-musl-*.so.1; do
    if [ -e "$musl_loader" ]; then arch="$arch-musl"; break; fi
  done
fi
if [ -n "${XDG_DATA_HOME:-}" ]; then
  data_root=$XDG_DATA_HOME
else
  [ -n "${HOME:-}" ] || fail 'HOME 未设置，无法选择用户私有安装目录。'
  data_root=$HOME/.local/share
fi
runtime_root=$data_root/wechat-article-to-md/node
runtime=$runtime_root/runtime-$platform-$arch
if [ -e "$runtime" ]; then
  usable_node "$runtime/bin/node" || fail "私有运行时不可用：${runtime}。请先检查系统兼容性，或按教程退休该目录后重试。"
  exec "$runtime/bin/node" "$script_dir/$entry" "$@"
fi

command -v curl >/dev/null 2>&1 || fail '缺少 curl，请安装系统 curl，或手动安装 Node.js。'
command -v tar >/dev/null 2>&1 || fail '缺少 tar，请安装系统 tar，或手动安装 Node.js。'
if command -v sha256sum >/dev/null 2>&1; then
  hash_tool=sha256sum
elif command -v shasum >/dev/null 2>&1; then
  hash_tool=shasum
else
  fail '缺少 SHA256 校验工具（sha256sum 或 shasum），已停止自动安装。'
fi
mkdir -p "$runtime_root"
lock=$runtime_root/.install-lock
mkdir "$lock" 2>/dev/null || fail "另一安装正在进行，或上次中断留下锁：${lock}。确认没有安装进程后按教程清理，再重试。"
stage=
cleanup() {
  [ -z "$stage" ] || rm -rf -- "$stage"
  rmdir "$lock" 2>/dev/null || :
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stage=$(mktemp -d "$runtime_root/.install.XXXXXXXX") || fail '无法创建临时下载目录。'
printf '%s\n' "未找到可用的 Node.js 18+；即将从 nodejs.org 下载 Node.js 24.x LTS（${platform} / ${arch}）及 SHA256 清单。" "仅安装到：${runtime}；不会使用 sudo、修改全局 PATH 或覆盖已有 Node.js。" >&2
# No redirects: both the manifest and archive must come directly from nodejs.org.
download() {
  curl --disable --fail --silent --show-error --proto '=https' --tlsv1.2 \
    --connect-timeout 20 --max-time 300 --output "$2" "$1" || fail "无法下载 ${1}。请检查网络、代理与系统 CA 证书；不要关闭 HTTPS 验证。"
}
download https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt "$stage/SHASUMS256.txt"
selection=$(awk -v target="$platform-$arch" '
  length($1) == 64 && $1 !~ /[^0-9a-f]/ && $2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-" target "\\.tar\\.gz$") { result=$1 " " $2; count++ }
  END { if (count == 1) print result; else exit 1 }
' "$stage/SHASUMS256.txt") || fail "官方清单没有唯一匹配的 $platform-$arch 二进制包；不会改用其他平台。"
expected_hash=${selection%% *}
archive=${selection#* }
version=${archive#node-}
version=${version%%-*}
printf '%s\n' "下载官方文件：$archive" >&2
# Pin the archive URL to the version selected by the manifest, avoiding a latest-alias race.
download "https://nodejs.org/dist/$version/$archive" "$stage/$archive"
if [ "$hash_tool" = sha256sum ]; then
  actual_hash=$(sha256sum "$stage/$archive")
else
  actual_hash=$(shasum -a 256 "$stage/$archive")
fi
actual_hash=${actual_hash%% *}
[ "$actual_hash" = "$expected_hash" ] || fail 'SHA256 不匹配；下载文件不会解压或执行。请检查网络后重试。'
tar -xzf "$stage/$archive" -C "$stage" || fail '官方包解压失败。'
unpacked=$stage/${archive%.tar.gz}
usable_node "$unpacked/bin/node" || fail '下载的官方 Node.js 无法在本机运行；可能是操作系统或 libc 版本不兼容。'
[ ! -e "$runtime" ] || fail "目标目录已出现，为避免覆盖已停止：${runtime}。"
mv "$unpacked" "$runtime"
printf '%s\n' "Node.js $version 已校验并安装到 $runtime" >&2
cleanup
stage=
trap - EXIT INT TERM
exec "$runtime/bin/node" "$script_dir/$entry" "$@"
