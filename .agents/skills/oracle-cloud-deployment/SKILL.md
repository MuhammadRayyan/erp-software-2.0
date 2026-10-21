---
name: oracle-cloud-deployment
description: >-
  Operational runbook and troubleshooting guide for Modern ERP's Oracle Cloud Always Free
  production instance, Docker container management, Caddy reverse proxy, GitHub Actions CI/CD,
  and Hostinger DNS domain attachment. Use when the user asks to deploy, update, check server health,
  debug CI/CD pipelines, configure domains, or manage the remote Oracle Cloud VM.
---

# Oracle Cloud Production Operations Runbook

This skill provides step-by-step procedures for managing the Modern ERP production environment on Oracle Cloud Always Free.

## Server Infrastructure Profile
- **Public IP**: `84.235.255.173`
- **Instance Type**: Oracle Cloud Ampere A1 Compute (ARM64 `aarch64`, 2 OCPUs, 12 GB RAM, 100 GB NVMe)
- **Host User**: `ubuntu`
- **SSH Key**: `~/.ssh/id_ed25519`
- **Persistent Data Directory**: `/opt/modern-erp/data`
- **Docker Compose Directory**: `/opt/modern-erp/`

---

## 1. Automated Health & Status Verification

To verify the live application status from the local workspace:

```powershell
# 1. Query the live application health endpoint
curl.exe -m 5 -s http://84.235.255.173/api/health

# 2. Inspect container status on remote host
ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/id_ed25519 ubuntu@84.235.255.173 "docker ps"

# 3. View live application logs
ssh -o StrictHostKeyChecking=no -i $HOME/.ssh/id_ed25519 ubuntu@84.235.255.173 "docker compose -f /opt/modern-erp/docker-compose.yml logs --tail=50 modern-erp"
```

---

## 2. Autonomous CI/CD Pipeline Monitoring

When commits are pushed to `main` or active feature branches, monitor the automated GitHub Actions workflow:

```powershell
# Check recent CI/CD pipeline runs
gh run list --limit 5

# Inspect failed run details without user manual intervention
gh run view <run_id> --log-failed

# Watch active pipeline execution in real-time
gh run watch <run_id>
```

---

## 3. Hostinger Subdomain & SSL Attachment Procedure

When the user decides to connect a custom subdomain (e.g. `erp.yourdomain.com`):

### Step A: Configure DNS in Hostinger
1. In Hostinger Control Panel ➔ DNS Zone Management:
   - **Type**: `A`
   - **Name**: `erp` (or desired subdomain)
   - **Points to**: `84.235.255.173`
   - **TTL**: `300` (5 minutes)

### Step B: Update Caddyfile
Update `/opt/modern-erp/Caddyfile` on the remote server:
```caddy
erp.yourdomain.com {
    encode zstd gzip

    @static path /_next/static/* /public/*
    header @static Cache-Control "public, max-age=31536000, immutable"

    reverse_proxy modern-erp:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

### Step C: Reload Caddy
```bash
ssh ubuntu@84.235.255.173 "cd /opt/modern-erp && docker compose restart caddy"
```
*Caddy automatically requests, installs, and renews a free Let's Encrypt TLS certificate.*

---

## 4. Emergency Container Recovery & Backup

### Snapshot Database Backup:
```bash
ssh ubuntu@84.235.255.173 "tar -czf /home/ubuntu/backup_$(date +%Y%m%d_%H%M%S).tar.gz /opt/modern-erp/data"
```

### Full Container Rebuild on Server:
```bash
ssh ubuntu@84.235.255.173 "cd /opt/modern-erp && docker compose down && docker compose up -d --build"
```
