#!/usr/bin/env bash
# Runs ON the Pi (piped over ssh by install-pi.sh). Prints the path of a Node binary to
# use on stdout, progress on stderr. Args: <node major> <remote dir>.
set -euo pipefail
major="$1"
dir="$HOME/$2/node"
works() { "$1" --version >/dev/null 2>&1; }

if [ -x "$dir/bin/node" ] && works "$dir/bin/node" && "$dir/bin/node" --version | grep -q "^v$major\."; then
  echo "private Node already installed: $("$dir/bin/node" --version)" >&2
  echo "$dir/bin/node"
  exit 0
fi

case "$(uname -m)" in
  armv7l) arch=armv7l ;;
  aarch64) arch=arm64 ;;
  x86_64) arch=x64 ;;
  *) arch='' ;;
esac
marker="$HOME/$2/node-unsupported"
if [ -e "$marker" ]; then
  echo "skipping the official build, it did not run here before (delete $marker to retry)" >&2
  arch=''
fi
if [ -n "$arch" ]; then
  index="https://nodejs.org/dist/latest-v$major.x/"
  file="$(curl -fsSL "$index" | grep -oE "node-v$major\.[0-9]+\.[0-9]+-linux-$arch\.tar\.gz" | head -1 || true)"
  if [ -n "$file" ]; then
    echo "trying official $file" >&2
    rm -rf "$dir"
    mkdir -p "$dir"
    curl -fsSL "$index$file" | tar -xz -C "$dir" --strip-components=1
    if works "$dir/bin/node"; then
      echo "private Node installed: $("$dir/bin/node" --version)" >&2
      echo "$dir/bin/node"
      exit 0
    fi
    echo "official build does not run on this OS (too old C++ runtime), removing it" >&2
    rm -rf "$dir"
    touch "$marker"
  fi
fi

system_node="$(command -v node || true)"
if [ -n "$system_node" ] && works "$system_node"; then
  version="$("$system_node" --version | sed 's/^v//')"
  if [ "$(printf '%s\n' 14.13.1 "$version" | sort -V | head -1)" = 14.13.1 ]; then
    echo "using the system Node v$version at $system_node" >&2
    echo "$system_node"
    exit 0
  fi
  echo "system Node v$version is older than 14.13" >&2
fi
echo "no usable Node found" >&2
exit 1
