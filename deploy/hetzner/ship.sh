#!/bin/bash
# Construye la imagen en tu máquina, la sube al VPS y la levanta. Si no queda "healthy", vuelve a la anterior.
# Uso: deploy/hetzner/ship.sh            (usa el SHA corto de HEAD como tag)
# Requiere: docker local, ssh con la llave del VPS (SSH_KEY, por defecto ~/.ssh/atajolab_prod).
set -euo pipefail
HOST="${HOST:-deploy@167.233.65.236}"
KEY="${SSH_KEY:-$HOME/.ssh/atajolab_prod}"
DIR=/opt/atajolab/apps/atajolab-qr
TAG="${TAG:-$(git rev-parse --short HEAD)}"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

echo ">> build atajolab-qr:$TAG"
docker build -t "atajolab-qr:$TAG" .

echo ">> subir imagen"
docker save "atajolab-qr:$TAG" | gzip | "${SSH[@]}" 'gunzip | docker load'

echo ">> subir compose y scripts"
scp -i "$KEY" -q deploy/hetzner/docker-compose.yml deploy/hetzner/cron.sh "$HOST:$DIR/"
"${SSH[@]}" "chmod +x $DIR/cron.sh; mkdir -p $DIR/logs"

echo ">> levantar (anterior: $("${SSH[@]}" "cat $DIR/.current 2>/dev/null || echo ninguna"))"
PREV=$("${SSH[@]}" "cat $DIR/.current 2>/dev/null || true")
"${SSH[@]}" "cd $DIR && TAG=$TAG docker compose up -d --no-build app"
for i in $(seq 1 24); do
  st=$("${SSH[@]}" "docker inspect -f '{{.State.Health.Status}}' atajolab-qr 2>/dev/null || echo starting")
  if [ "$st" = "healthy" ]; then
    "${SSH[@]}" "cd $DIR && echo '$TAG' > .current && { [ -n '$PREV' ] && echo '$PREV' > .previous || true; }; sed -i 's/^TAG=.*/TAG=$TAG/' .env 2>/dev/null || true"
    echo ">> healthy: $TAG"; exit 0
  fi
  sleep 5
done
echo "!! no quedó healthy; logs:"; "${SSH[@]}" "docker logs --tail 60 atajolab-qr" || true
if [ -n "$PREV" ]; then
  echo ">> rollback a $PREV"; "${SSH[@]}" "cd $DIR && TAG=$PREV docker compose up -d --no-build app"
fi
exit 1
