# zufang2boss Docker redeploy script - PowerShell engine
# Entry point is redeploy.bat (2-line bootstrap); this file can also be run directly.
# ASCII only on purpose: PowerShell 5.1 reads BOM-less files as ANSI.

$IMAGE_NAME     = 'zufang2bos'
$CONTAINER_NAME = 'zufang2bos'
$HOST_PORT      = '7864'
$CONTAINER_PORT = '3000'
$DATA_DIR       = 'D:\docker\zufang2bos\data'
$UPLOADS_DIR    = 'D:\docker\zufang2bos\uploads'
$DATABASE_URL   = 'postgresql://neondb_owner:npg_KLQv36ezVyYG@ep-round-credit-b584r680-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

# Cloudinary free image hosting (upload target for house photos/videos)
$CLOUDINARY_CLOUD_NAME = 'jcgfauar'
$CLOUDINARY_API_KEY    = '334846743197461'
$CLOUDINARY_API_SECRET = '08QPJV_jQenHGREGo2dBRpO_834'

Write-Host '========================================'
Write-Host 'zufang2bos - Docker Deployment Script (Windows)'
Write-Host '========================================'
Write-Host ''

# --- 0. Docker engine check -------------------------------------------------
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] Docker engine not reachable. Please start Docker Desktop first.'
    Read-Host 'Press Enter to exit'
    exit 1
}

# --- 1. Build ---------------------------------------------------------------
# The Dockerfile already has: npm cache mount + maxsockets=1 + 6 internal
# retries + tencent mirror fallback. Outer retries reuse the cache mount,
# so a failed run keeps downloaded packages for the next attempt.
Write-Host '[1/4] Building Docker image...'
Write-Host "Building image ${IMAGE_NAME}:latest ..."
docker build -t "${IMAGE_NAME}:latest" .
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '[WARN] Build attempt 1 failed. Retrying with cache - npm cache mount keeps downloaded packages...'
    docker build -t "${IMAGE_NAME}:latest" .
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host '[WARN] Build attempt 2 failed. Last resort: rebuild without layer cache...'
        docker build --no-cache -t "${IMAGE_NAME}:latest" .
        if ($LASTEXITCODE -ne 0) {
            Write-Host ''
            Write-Host '[ERROR] Docker build failed after 3 attempts. Deployment aborted.'
            Write-Host 'Checklist:'
            Write-Host '  1. Make sure Docker Desktop is running;'
            Write-Host '  2. Check host VPN/proxy - TUN-mode proxies often break npm TLS;'
            Write-Host '  3. The npm cache mount keeps partial downloads - just run again later.'
            Read-Host 'Press Enter to exit'
            exit 1
        }
    }
}
Write-Host 'Build successful.'
Write-Host ''

# --- 2. Stop and remove old container ---------------------------------------
Write-Host '[2/4] Stopping and removing old container...'
docker stop $CONTAINER_NAME *> $null
docker rm $CONTAINER_NAME *> $null
Write-Host 'Done.'
Write-Host ''

# --- 3. Clean dangling images ------------------------------------------------
Write-Host '[3/4] Cleaning up dangling images...'
$dangling = docker images $IMAGE_NAME -q --filter 'dangling=true'
if ($dangling) { docker rmi $dangling *> $null }
Write-Host 'Done.'
Write-Host ''

# --- 4. Start new container --------------------------------------------------
Write-Host '[4/4] Starting new container...'
if (-not (Test-Path $DATA_DIR))    { New-Item -ItemType Directory -Path $DATA_DIR | Out-Null }
if (-not (Test-Path $UPLOADS_DIR)) { New-Item -ItemType Directory -Path $UPLOADS_DIR | Out-Null }

# host 7864 -> container 3000, persistent data/uploads volumes, Neon PostgreSQL
docker run -d --name $CONTAINER_NAME -p "${HOST_PORT}:${CONTAINER_PORT}" -v "${DATA_DIR}:/app/data" -v "${UPLOADS_DIR}:/app/uploads" -e "DATABASE_URL=$DATABASE_URL" -e "CLOUDINARY_CLOUD_NAME=$CLOUDINARY_CLOUD_NAME" -e "CLOUDINARY_API_KEY=$CLOUDINARY_API_KEY" -e "CLOUDINARY_API_SECRET=$CLOUDINARY_API_SECRET" --restart unless-stopped "${IMAGE_NAME}:latest"
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] Failed to start Docker container.'
    Read-Host 'Press Enter to exit'
    exit 1
}

# --- Verify -------------------------------------------------------------------
Write-Host ''
Write-Host '[Verify] Waiting 3s then checking container status...'
Start-Sleep -Seconds 3
$status = docker ps --filter "name=$CONTAINER_NAME" --format '{{.Names}} | {{.Status}}'
if ($status) {
    Write-Host "[OK] Container is running: $status"
} else {
    Write-Host '[WARN] Container not in running state. Last 30 log lines:'
    docker logs $CONTAINER_NAME --tail 30
}

Write-Host ''
Write-Host '========================================'
Write-Host 'Deployment finished.'
Write-Host '========================================'
Write-Host "Access URL: http://localhost:$HOST_PORT"
Write-Host '========================================'
Write-Host ''
