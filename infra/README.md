# Local infrastructure

Use the signaling example file as the Compose environment source so coturn and
the signaling service share the same TURN secret:

```sh
docker compose --env-file apps/signaling/.env.example \
  -f infra/docker-compose.yml up -d
```

For local work, copy `apps/signaling/.env.example` to
`apps/signaling/.env`, replace both secret placeholders with long random values,
and use that file with `--env-file`. The example secret is not suitable for
deployment. The coturn configuration denies private and reserved peer ranges;
run this on a network with a public routable address and set `TURN_EXTERNAL_IP`
to the public address forwarded to the Docker host when it is behind NAT.

The relay allocation range is UDP `49160-49200`; open it along with port 3478
when running outside Docker Desktop. If the host's default Redis port is
occupied, set `REDIS_PORT` to a free port and update `REDIS_URL` in the
signaling environment file to match it.
