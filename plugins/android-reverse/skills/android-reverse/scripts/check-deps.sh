#!/usr/bin/env bash
# check-deps.sh — Verify Android reverse engineering tool dependencies
# Exit 0 if all required deps available, 1 if any required dep missing
set -euo pipefail

REQUIRED_DEPS=("java" "jadx")
OPTIONAL_DEPS=("fernflower" "dex2jar" "apktool" "adb" "frida")

missing_required=0

log() { echo "[$1] $2"; }

check_java() {
    if command -v java &>/dev/null; then
        # Windows 原生工具输出带 CRLF，先 tr 掉 \r 再提取版本号；
        # 版本号用 [0-9][0-9]*（一或多），零或多写法在贪婪 .* 配合下恒捕获空串
        version=$(java -version 2>&1 | head -1 | tr -d '\r' | sed -n 's/.*"\([0-9][0-9]*\).*/\1/p')
        if [ -z "$version" ]; then
            log "WARN" "java found but version could not be parsed"
            return 1
        fi
        if [ "$version" -ge 17 ]; then
            log "OK" "Java $version found"
            return 0
        else
            log "WARN" "Java $version found, but 17+ required"
            return 1
        fi
    fi
    return 1
}

check_jadx() {
    if command -v jadx &>/dev/null; then
        log "OK" "jadx found: $(jadx --version 2>/dev/null || echo 'version unknown')"
        return 0
    fi
    return 1
}

check_fernflower() {
    if command -v fernflower &>/dev/null || command -v vineflower &>/dev/null; then
        log "OK" "Fernflower/Vineflower found"
        return 0
    elif [ -f "${HOME}/.local/bin/fernflower" ] || [ -f "${HOME}/.local/bin/vineflower" ]; then
        log "OK" "Fernflower/Vineflower found in ~/.local/bin"
        return 0
    fi
    return 1
}

check_generic() {
    command -v "$1" &>/dev/null
}

# frida 版本分级检查：OK=17.6.2 基准 / legacy=16.5-16.8 / 其余 WARN
# 规则见 references/frida-version-policy.md
check_frida() {
    if ! command -v frida &>/dev/null; then
        return 1
    fi
    local version major minor
    version=$(frida --version 2>/dev/null | tr -d '\r')
    if [ -z "$version" ]; then
        log "WARN" "frida found but version unknown"
        return 0
    fi
    major=$(echo "$version" | cut -d. -f1)
    minor=$(echo "$version" | cut -d. -f2)
    if [ "$version" = "17.6.2" ]; then
        log "OK" "frida $version (recommended baseline)"
    elif [ "$major" = "16" ] && [ "${minor:-0}" -ge 5 ] 2>/dev/null; then
        log "OK" "frida $version (legacy supported)"
    elif [ "$major" = "16" ]; then
        log "WARN" "frida $version below legacy floor 16.5 (see references/frida-version-policy.md)"
        echo "VERSION_MISMATCH:frida:$version"
    else
        log "WARN" "frida $version not in verified set {16.5-16.8, 17.6.2} (see references/frida-version-policy.md)"
        echo "VERSION_MISMATCH:frida:$version"
    fi
    return 0
}

# Check required
for dep in "${REQUIRED_DEPS[@]}"; do
    case "$dep" in
        java)
            if ! check_java; then
                echo "INSTALL_REQUIRED:java"
                missing_required=1
            fi
            ;;
        jadx)
            if ! check_jadx; then
                echo "INSTALL_REQUIRED:jadx"
                missing_required=1
            fi
            ;;
        *)
            if ! check_generic "$dep"; then
                echo "INSTALL_REQUIRED:$dep"
                missing_required=1
            fi
            ;;
    esac
done

# Check optional
for dep in "${OPTIONAL_DEPS[@]}"; do
    case "$dep" in
        fernflower)
            if ! check_fernflower; then
                echo "INSTALL_OPTIONAL:fernflower"
            fi
            ;;
        frida)
            if ! check_frida; then
                echo "INSTALL_OPTIONAL:frida"
            fi
            ;;
        *)
            if ! check_generic "$dep"; then
                echo "INSTALL_OPTIONAL:$dep"
            fi
            ;;
    esac
done

exit $missing_required
