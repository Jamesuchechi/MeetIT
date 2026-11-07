# MeetIT LiveKit SFU Load Testing Suite

This suite verifies MeetIT's SFU performance against the **Phase 4 Exit Criteria**:

- **100 participants per room** (30 publishers with simulcast video + audio, 70 subscribers)
- **Stable audio** with packet loss < 2.0%
- **p75 time-to-first-frame under 5.0 seconds**
- **Node CPU utilization under 70%** under target load

---

## 1. Running the Automated Load Tester Harness

MeetIT includes a built-in load testing runner that issues grants, simulates room joins, and benchmarks token generation, connection times, and latency.

```bash
# Run with default configuration (100 participants, 30 publishers, 10s duration)
pnpm loadtest

# Or run with custom LiveKit endpoint and parameters
LIVEKIT_URL=wss://meetit.livekit.cloud \
LIVEKIT_API_KEY=your-api-key \
LIVEKIT_API_SECRET=your-api-secret \
pnpm loadtest --participants 100 --publishers 30 --duration 30
```

### CLI Arguments

| Argument         | Default        | Description                                                  |
| :--------------- | :------------- | :----------------------------------------------------------- |
| `--participants` | `100`          | Total number of participants in the room                     |
| `--publishers`   | `30`           | Number of audio/video publishers (remainder are subscribers) |
| `--duration`     | `10`           | Duration in seconds to run simulated telemetry               |
| `--url`          | `$LIVEKIT_URL` | LiveKit Server / Cloud WebSocket URL                         |
| `--room`         | Auto-generated | Target room code                                             |

---

## 2. Running with Official `livekit-load-tester` (Go / Docker)

LiveKit provides an official headless WebRTC load testing tool that publishes real media streams and measures end-to-end transport metrics.

### Using Docker

```bash
docker run --rm -it \
  -v $(pwd)/infra/loadtest/livekit-loadtest.yaml:/loadtest.yaml \
  livekit/load-tester:latest \
  -config /loadtest.yaml
```

### Installing the Binary via Go

```bash
go install github.com/livekit/load-tester@latest

livekit-load-tester -config infra/loadtest/livekit-loadtest.yaml
```

### Interpreting the Results

The load tester reports:

- **Join Latency (p50, p75, p95)**: Time from token presentation to WebRTC DTLS completion.
- **TTFF (Time To First Frame)**: Measures delay between publisher track announcement and first media packet decoded.
- **Bitrate Ingress/Egress**: Total network bandwidth consumption across all 3 simulcast layers (720p, 360p, 180p).
- **Packet Loss & Jitter**: Verifies network stability under concurrent subscriber demand.
