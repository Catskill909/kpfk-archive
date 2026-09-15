#!/bin/sh
# Copy the KPFK archive's data directory off the container, as a dated tarball.
#
# RUN THIS ON THE VPS THAT HOSTS THE CONTAINER, not on a laptop.
#
# Why bother when the VPS itself is snapshotted: a snapshot restores the whole
# machine, which rolls back every other Coolify app on that host. This gives a
# second path — put one directory back into one volume, with only this container
# stopped.
#
# What is actually at stake in the KPFK app is `stats/` — the studio's usage
# counters, the only data here no upstream can give back. `pacifica/` holds the
# last accepted feed snapshots (they refill from Pacifica on their own) and
# `.instance.json` is the volume's identity marker.
#
# Coolify names containers itself, so pass the name (docker ps shows it):
#   CONTAINER=<name> ./backup-data.sh             -> ./kpfk-data-YYYY-MM-DD.tgz
#   CONTAINER=<name> ./backup-data.sh /backups    -> /backups/kpfk-data-YYYY-MM-DD.tgz
#
# Cron it weekly and keep the result somewhere that is not this machine:
#   0 4 * * 0  CONTAINER=<name> /opt/kpfk/backup-data.sh /backups >> /var/log/kpfk-backup.log 2>&1
set -e
CONTAINER="${CONTAINER:-kpfk-archive}"
DEST="${1:-.}"
STAMP=$(date +%F)
OUT="$DEST/kpfk-data-$STAMP.tgz"
command -v docker >/dev/null 2>&1 || { echo "docker not found — run this on the VPS host"; exit 1; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || {
  echo "no container named '$CONTAINER'. Set CONTAINER=<name>; docker ps --format '{{.Names}}' to list."
  exit 1
}
mkdir -p "$DEST"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# Copy rather than tar-in-place: `docker cp` works on a running container and
# needs no shell inside it.
docker cp "$CONTAINER:/app/data" "$TMP/data"
tar czf "$OUT" -C "$TMP" data
# Report what was actually captured, not just that a file was written. A backup
# whose size nobody looked at is how you discover at restore time that it has
# been archiving an empty directory for six months.
MONTHS=$(ls "$TMP/data/stats" 2>/dev/null | wc -l | tr -d ' ')
SNAPS=$(ls "$TMP/data/pacifica" 2>/dev/null | wc -l | tr -d ' ')
echo "$OUT  ($(du -h "$OUT" | cut -f1))  stats: $MONTHS month file(s), pacifica: $SNAPS snapshot file(s)"
[ -f "$TMP/data/.instance.json" ] || echo "WARNING: no .instance.json — is the volume mounted at /app/data?" >&2
[ "$MONTHS" = "0" ] && echo "WARNING: no usage stats captured. Do not overwrite an older backup with this one." >&2

# ---------------------------------------------------------------- restoring
# Stop only this container, put the directory back, start it. Do NOT restore a
# whole VPS snapshot for this — that rolls back every other app on the host.
#
#   tar xzf kpfk-data-YYYY-MM-DD.tgz
#   docker stop <name>
#   docker cp data/stats <name>:/app/data/
#   docker start <name>
#   curl -s https://<host>/healthz    # storage.instanceId should be unchanged
#
# From a VPS snapshot instead of a tarball, the same files live at
#   /var/lib/docker/volumes/<volume-name>/_data/stats/
exit 0
