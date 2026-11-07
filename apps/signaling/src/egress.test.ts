import { describe, it, expect, vi } from 'vitest';
import {
  getEgressStorageConfig,
  buildEncodedFileOutput,
  startRoomCompositeRecording,
  stopRoomCompositeRecording,
  handleLiveKitWebhook,
} from './egress.js';
import type { EgressClient, EgressInfo } from 'livekit-server-sdk';

describe('LiveKit Egress recording and storage suite', () => {
  it('parses S3 storage configuration correctly', () => {
    const config = getEgressStorageConfig({
      EGRESS_S3_BUCKET: 'meetit-recordings-test',
      EGRESS_S3_ENDPOINT: 'http://localhost:9000',
      EGRESS_S3_REGION: 'us-west-2',
      EGRESS_S3_ACCESS_KEY: 'test-access-key',
      EGRESS_S3_SECRET: 'test-secret',
      EGRESS_S3_FORCE_PATH_STYLE: 'true',
    });

    expect(config.type).toBe('s3');
    expect(config.bucket).toBe('meetit-recordings-test');
    expect(config.endpoint).toBe('http://localhost:9000');
    expect(config.region).toBe('us-west-2');
    expect(config.accessKey).toBe('test-access-key');
    expect(config.secret).toBe('test-secret');
    expect(config.forcePathStyle).toBe(true);
  });

  it('parses GCP storage configuration correctly', () => {
    const config = getEgressStorageConfig({
      EGRESS_GCP_BUCKET: 'gcp-recordings-test',
      EGRESS_GCP_CREDENTIALS: '{"type":"service_account"}',
    });

    expect(config.type).toBe('gcp');
    expect(config.bucket).toBe('gcp-recordings-test');
    expect(config.gcpCredentials).toBe('{"type":"service_account"}');
  });

  it('falls back to local storage when no cloud storage is configured', () => {
    const config = getEgressStorageConfig({});
    expect(config.type).toBe('local');
    expect(config.localDir).toBe('/tmp/meetit-recordings');
  });

  it('builds EncodedFileOutput for S3 object storage', () => {
    const storage = getEgressStorageConfig({
      EGRESS_S3_BUCKET: 'my-s3-bucket',
      EGRESS_S3_REGION: 'us-east-1',
    });
    const { fileOutput, filepath } = buildEncodedFileOutput(
      storage,
      'abc-defg-hij',
    );
    expect(fileOutput.output?.case).toBe('s3');
    expect(filepath).toContain('{room_name}');
  });

  it('builds EncodedFileOutput for GCP object storage', () => {
    const storage = getEgressStorageConfig({
      EGRESS_GCP_BUCKET: 'my-gcp-bucket',
    });
    const { fileOutput, filepath } = buildEncodedFileOutput(
      storage,
      'abc-defg-hij',
    );
    expect(fileOutput.output?.case).toBe('gcp');
    expect(filepath).toContain('{room_name}');
  });

  it('starts and stops room composite egress using mock EgressClient', async () => {
    const mockStart = vi.fn().mockResolvedValue({
      egressId: 'EG_test_12345',
      roomName: 'test-room',
    } as unknown as EgressInfo);

    const mockStop = vi.fn().mockResolvedValue({
      egressId: 'EG_test_12345',
    } as unknown as EgressInfo);

    const mockClient = {
      startRoomCompositeEgress: mockStart,
      stopEgress: mockStop,
    } as unknown as EgressClient;

    const res = await startRoomCompositeRecording({
      roomCode: 'abc-defg-hij',
      layout: 'grid',
      audioOnly: false,
      livekitUrl: 'https://test.livekit.cloud',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      client: mockClient,
      storage: {
        type: 's3',
        bucket: 'test-recordings-bucket',
      },
    });

    expect(res).not.toBeNull();
    expect(res?.egressId).toBe('EG_test_12345');
    expect(res?.filepath).toContain('abc-defg-hij');
    expect(mockStart).toHaveBeenCalledWith(
      'abc-defg-hij',
      expect.anything(),
      expect.objectContaining({ layout: 'grid', audioOnly: false }),
    );

    const stopped = await stopRoomCompositeRecording({
      egressId: 'EG_test_12345',
      livekitUrl: 'https://test.livekit.cloud',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      client: mockClient,
    });

    expect(stopped).toBe(true);
    expect(mockStop).toHaveBeenCalledWith('EG_test_12345');
  });

  it('handles simulated/fallback recording when livekit is unconfigured or in offline mode', async () => {
    const res = await startRoomCompositeRecording({
      roomCode: 'mock-room',
      layout: 'speaker',
      audioOnly: true,
    });

    expect(res).not.toBeNull();
    expect(res?.egressId).toMatch(/^eg_sim_/);
    expect(res?.filepath).toContain('mock-room');

    const stopped = await stopRoomCompositeRecording({
      egressId: res!.egressId,
    });
    expect(stopped).toBe(true);
  });

  it('handles webhook authorization gracefully', async () => {
    const result = await handleLiveKitWebhook(
      '{}',
      undefined,
      'test-key',
      'test-secret',
    );
    expect(result).toBeNull();
  });
});
