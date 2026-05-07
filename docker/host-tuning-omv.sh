#!/usr/bin/env bash
set -euo pipefail

# Host tuning for Debian/OMV running Portainer + Docker
# Usage:
#   sudo bash docker/host-tuning-omv.sh
# Optional env vars:
#   SWAP_SIZE_GB=4
#   APPLY_DOCKER_DAEMON=1

SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
APPLY_DOCKER_DAEMON="${APPLY_DOCKER_DAEMON:-1}"

if [ "$(id -u)" -ne 0 ]; then
  echo "[ERROR] Run as root: sudo bash docker/host-tuning-omv.sh"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker is not installed or not in PATH"
  exit 1
fi

echo "[1/6] Writing sysctl tuning..."
cat >/etc/sysctl.d/99-eyedbot-host.conf <<'EOF'
# Keep swap usage low while allowing emergency headroom
vm.swappiness = 10
vm.vfs_cache_pressure = 50

# Increase queue and file descriptor headroom
fs.file-max = 2097152
net.core.somaxconn = 4096
EOF
sysctl --system >/dev/null

echo "[2/6] Configuring process limits..."
cat >/etc/security/limits.d/99-eyedbot-nofile.conf <<'EOF'
* soft nofile 65535
* hard nofile 65535
root soft nofile 65535
root hard nofile 65535
EOF

echo "[3/6] Ensuring swap file (${SWAP_SIZE_GB}G) exists..."
if swapon --show | grep -q '/swapfile'; then
  echo "[INFO] /swapfile already active, skipping creation"
else
  if [ -f /swapfile ]; then
    echo "[INFO] /swapfile exists but inactive, enabling"
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null 2>&1 || true
    swapon /swapfile
  else
    fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="$((SWAP_SIZE_GB*1024))" status=progress
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
  fi

  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi
fi

echo "[4/6] Enabling Docker service at boot..."
systemctl enable docker >/dev/null

if [ "$APPLY_DOCKER_DAEMON" = "1" ]; then
  echo "[5/6] Writing Docker daemon defaults (log rotation + live restore)..."
  mkdir -p /etc/docker

  if [ -f /etc/docker/daemon.json ]; then
    cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%Y%m%d%H%M%S)"
  fi

  cat >/etc/docker/daemon.json <<'EOF'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  },
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 65535,
      "Soft": 65535
    }
  }
}
EOF

  systemctl restart docker
else
  echo "[5/6] Skipping Docker daemon.json changes (APPLY_DOCKER_DAEMON=0)"
fi

echo "[6/6] Summary"
echo "- RAM usage:"
free -h
echo "- Swap status:"
swapon --show
echo "- Docker service:"
systemctl is-active docker

echo "[DONE] Host tuning applied. Redeploy your Portainer stack to apply container-level settings."
