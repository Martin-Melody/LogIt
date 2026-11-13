# Shared by backup.sh, restore-test.sh and alert.sh (installed in /opt/logit/bin).
# Reads single settings from /opt/logit/.env without sourcing the whole file.
env_get() { sed -n "s/^$1=//p" /opt/logit/.env | tail -1; }

require_env() {
  local v
  for v in "$@"; do
    printf -v "$v" '%s' "$(env_get "$v")"
    export "${v?}"
    [[ -n "${!v}" ]] || { echo "$v is not set in /opt/logit/.env" >&2; exit 1; }
  done
}

# rclone in a container, talking to the R2 bucket as remote "r2:". Credentials go in as
# environment variables by name, so they never appear in the process list.
r2() {
  RCLONE_CONFIG_R2_ENDPOINT=$R2_ENDPOINT \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
  docker run --rm --user "$(id -u):$(id -g)" -v /opt/logit/backups:/backups \
    -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    -e RCLONE_CONFIG_R2_ENDPOINT -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
    rclone/rclone:1 "$@"
}
