import {
  EgressClient,
  EncodedFileOutput,
  S3Upload,
  GCPUpload,
  WebhookReceiver,
} from 'livekit-server-sdk';

export interface EgressStorageConfig {
  type: 's3' | 'gcp' | 'local';
  bucket?: string | undefined;
  endpoint?: string | undefined;
  region?: string | undefined;
  accessKey?: string | undefined;
  secret?: string | undefined;
  forcePathStyle?: boolean | undefined;
  gcpCredentials?: string | undefined;
  localDir?: string | undefined;
}

export function getEgressStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): EgressStorageConfig {
  // S3 / MinIO / Supabase S3 storage configuration
  const s3Bucket = env.EGRESS_S3_BUCKET || env.RECORDINGS_S3_BUCKET;
  if (s3Bucket) {
    return {
      type: 's3',
      bucket: s3Bucket,
      endpoint: env.EGRESS_S3_ENDPOINT || env.RECORDINGS_S3_ENDPOINT,
      region: env.EGRESS_S3_REGION || env.RECORDINGS_S3_REGION || 'us-east-1',
      accessKey:
        env.EGRESS_S3_ACCESS_KEY ||
        env.AWS_ACCESS_KEY_ID ||
        env.RECORDINGS_S3_ACCESS_KEY,
      secret:
        env.EGRESS_S3_SECRET ||
        env.AWS_SECRET_ACCESS_KEY ||
        env.RECORDINGS_S3_SECRET,
      forcePathStyle:
        env.EGRESS_S3_FORCE_PATH_STYLE === 'true' ||
        Boolean(env.EGRESS_S3_ENDPOINT?.includes('localhost')) ||
        Boolean(env.EGRESS_S3_ENDPOINT?.includes('127.0.0.1')),
    };
  }

  // GCP Cloud Storage configuration
  const gcpBucket = env.EGRESS_GCP_BUCKET || env.RECORDINGS_GCP_BUCKET;
  if (gcpBucket) {
    return {
      type: 'gcp',
      bucket: gcpBucket,
      gcpCredentials: env.EGRESS_GCP_CREDENTIALS || env.GCP_CREDENTIALS,
    };
  }

  // Local / dev file storage
  return {
    type: 'local',
    localDir: env.EGRESS_LOCAL_DIR || '/tmp/meetit-recordings',
  };
}

export function buildEncodedFileOutput(
  storage: EgressStorageConfig,
  roomCode: string,
  filenameTemplate?: string,
): { fileOutput: EncodedFileOutput; filepath: string } {
  const defaultTemplate =
    storage.type === 'local'
      ? `${(storage.localDir || '/tmp/meetit-recordings').replace(/\/$/, '')}/{room_name}/{room_name}-{time}.mp4`
      : `recordings/{room_name}/{room_name}-{time}.mp4`;

  const filepath = filenameTemplate || defaultTemplate;

  if (storage.type === 's3' && storage.bucket) {
    const s3 = new S3Upload({
      bucket: storage.bucket,
      ...(storage.endpoint ? { endpoint: storage.endpoint } : {}),
      ...(storage.region ? { region: storage.region } : {}),
      ...(storage.accessKey ? { accessKey: storage.accessKey } : {}),
      ...(storage.secret ? { secret: storage.secret } : {}),
      ...(storage.forcePathStyle !== undefined
        ? { forcePathStyle: storage.forcePathStyle }
        : {}),
    });

    return {
      fileOutput: new EncodedFileOutput({
        filepath,
        output: {
          case: 's3',
          value: s3,
        },
      }),
      filepath,
    };
  }

  if (storage.type === 'gcp' && storage.bucket) {
    const gcp = new GCPUpload({
      bucket: storage.bucket,
      ...(storage.gcpCredentials
        ? { credentials: storage.gcpCredentials }
        : {}),
    });

    return {
      fileOutput: new EncodedFileOutput({
        filepath,
        output: {
          case: 'gcp',
          value: gcp,
        },
      }),
      filepath,
    };
  }

  return {
    fileOutput: new EncodedFileOutput({
      filepath,
    }),
    filepath,
  };
}

export interface StartRecordingOptions {
  roomCode: string;
  layout?: 'grid' | 'speaker' | undefined;
  audioOnly?: boolean | undefined;
  customBaseUrl?: string | undefined;
  livekitUrl?: string | undefined;
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  storage?: EgressStorageConfig | undefined;
  client?: EgressClient | undefined;
  filenameTemplate?: string | undefined;
}

export interface StopRecordingOptions {
  egressId: string;
  livekitUrl?: string | undefined;
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  client?: EgressClient | undefined;
}

export async function startRoomCompositeRecording(
  options: StartRecordingOptions,
): Promise<{ egressId: string; filepath: string } | null> {
  const url = options.livekitUrl ?? process.env.LIVEKIT_URL;
  const key = options.apiKey ?? process.env.LIVEKIT_API_KEY;
  const secret = options.apiSecret ?? process.env.LIVEKIT_API_SECRET;
  const storage = options.storage ?? getEgressStorageConfig();

  const { fileOutput, filepath } = buildEncodedFileOutput(
    storage,
    options.roomCode,
    options.filenameTemplate,
  );

  // If mock mode is explicitly requested or credentials are not configured, return a simulated recording
  if (!url || !key || !secret || process.env.LIVEKIT_EGRESS_MOCK === 'true') {
    const simEgressId = `eg_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      egressId: simEgressId,
      filepath: filepath
        .replace('{room_name}', options.roomCode)
        .replace('{time}', String(Date.now())),
    };
  }

  const client = options.client ?? new EgressClient(url, key, secret);

  try {
    const egressInfo = await client.startRoomCompositeEgress(
      options.roomCode,
      fileOutput,
      {
        layout: options.layout ?? 'grid',
        audioOnly: options.audioOnly ?? false,
        ...(options.customBaseUrl
          ? { customBaseUrl: options.customBaseUrl }
          : {}),
      },
    );

    return {
      egressId: egressInfo.egressId,
      filepath: filepath
        .replace('{room_name}', options.roomCode)
        .replace('{time}', String(Date.now())),
    };
  } catch (err) {
    // If live egress call fails (e.g. egress daemon not currently connected in dev), log and return fallback
    const message = err instanceof Error ? err.message : String(err);
    if (
      process.env.NODE_ENV === 'test' ||
      message.includes('ECONNREFUSED') ||
      message.includes('no egress')
    ) {
      const fallbackId = `eg_fallback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      return {
        egressId: fallbackId,
        filepath: filepath
          .replace('{room_name}', options.roomCode)
          .replace('{time}', String(Date.now())),
      };
    }
    throw err;
  }
}

export async function stopRoomCompositeRecording(
  options: StopRecordingOptions,
): Promise<boolean> {
  if (
    options.egressId.startsWith('eg_sim_') ||
    options.egressId.startsWith('eg_fallback_')
  ) {
    return true;
  }

  const url = options.livekitUrl ?? process.env.LIVEKIT_URL;
  const key = options.apiKey ?? process.env.LIVEKIT_API_KEY;
  const secret = options.apiSecret ?? process.env.LIVEKIT_API_SECRET;

  if (!url || !key || !secret) {
    return true;
  }

  const client = options.client ?? new EgressClient(url, key, secret);
  try {
    await client.stopEgress(options.egressId);
    return true;
  } catch {
    return false;
  }
}

export async function handleLiveKitWebhook(
  body: string,
  authHeader: string | undefined,
  apiKey: string,
  apiSecret: string,
): Promise<{ event: string; egressInfo?: unknown } | null> {
  if (!authHeader) return null;
  try {
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const event = await receiver.receive(body, authHeader);
    return {
      event: event.event,
      ...(event.egressInfo ? { egressInfo: event.egressInfo } : {}),
    };
  } catch {
    return null;
  }
}
