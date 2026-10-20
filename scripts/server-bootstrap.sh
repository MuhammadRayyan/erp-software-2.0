#!/usr/bin/env bash
# ==============================================================================
# Modern ERP - Oracle Cloud Ubuntu 24.04 ARM64 Bootstrap Script
# Installs Docker, configures firewall, and initializes persistent storage.
# ==============================================================================
set -euo pipefail

echo "==> 1. Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg git iptables-persistent netfilter-persistent

echo "==> 2. Opening Oracle Linux Firewall for HTTP (80) & HTTPS (443)..."
# Oracle's default Ubuntu images block incoming port 80/443 via iptables REJECT rules
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

echo "==> 3. Installing Docker Engine & Docker Compose plugin..."
if ! command -v docker &> /dev/null; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker "$USER"
fi

echo "==> 4. Setting up persistent data directory..."
sudo mkdir -p /opt/modern-erp/data
sudo chown -R "$USER:$USER" /opt/modern-erp

echo "==> Setup complete! Please log out and back in (or run 'newgrp docker') to use Docker without sudo."
