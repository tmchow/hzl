// packages/hzl-core/src/services/gateway-client.ts
import { generateKeyPairSync, sign, createPrivateKey, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type GatewayStatus = 'connected' | 'connecting' | 'disconnected' | 'unconfigured';

export interface DeviceIdentity {
  id: string;             // SHA256 hex of raw 32-byte Ed25519 public key
  publicKey: string;      // Raw 32-byte Ed25519 public key, base64url-encoded
  privateKeyPkcs8: string; // PKCS8 DER private key, base64-encoded
  deviceToken?: string;
}

export interface GatewayClientOptions {
  url: string;
  token?: string;
  configDir: string;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface GatewayMessage {
  type?: string;
  method?: string;
  event?: string;
  id?: string;
  ok?: boolean;
  params?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string; code?: string; details?: Record<string, unknown> };
}

const RPC_TIMEOUT_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const PAIRING_RETRY_DELAY_MS = 5_000;
const DEVICE_IDENTITY_FILE = 'gateway-device.json';
const PROTOCOL_VERSION = 3;
const ED25519_SPKI_PREFIX_LEN = 12; // ASN.1 header length for Ed25519 SPKI DER

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export class GatewayClient {
  private url: string;
  private token: string | undefined;
  private configDir: string;
  private ws: WebSocket | null = null;
  private _status: GatewayStatus = 'disconnected';
  private deviceIdentity: DeviceIdentity | null = null;
  private pendingCalls = new Map<string, PendingCall>();
  private nextId = 1;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private connectPromise: Promise<void> | null = null;
  private disposed = false;
  private pairingMessageShown = false;

  constructor(options: GatewayClientOptions) {
    this.url = options.url;
    this.token = options.token;
    this.configDir = options.configDir;
    this.deviceIdentity = this.loadDeviceIdentity();
  }

  getStatus(): GatewayStatus {
    return this._status;
  }

  /**
   * Update gateway configuration. Disconnects and reconnects if URL or token changed.
   */
  configure(url: string, token?: string): void {
    const changed = url !== this.url || token !== this.token;
    this.url = url;
    this.token = token;
    if (changed && this._status === 'connected') {
      this.disconnect();
    }
  }

  /**
   * Send an RPC call to the gateway. Lazily connects on first call.
   */
  async call(method: string, params?: object): Promise<unknown> {
    await this.ensureConnected();

    return new Promise<unknown>((resolve, reject) => {
      const id = String(this.nextId++);
      const timer = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error(`Gateway RPC timeout: ${method}`));
      }, RPC_TIMEOUT_MS);

      this.pendingCalls.set(id, { resolve, reject, timer });
      const frame: Record<string, unknown> = { type: 'req', id, method };
      if (params !== undefined) {
        frame.params = params;
      }
      this.ws!.send(JSON.stringify(frame));
    });
  }

  /**
   * Disconnect from the gateway and clean up resources.
   */
  dispose(): void {
    this.disposed = true;
    this.disconnect();
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    // Reject all pending calls
    for (const call of this.pendingCalls.values()) {
      clearTimeout(call.timer);
      call.reject(new Error('Gateway disconnected'));
    }
    this.pendingCalls.clear();

    this._status = 'disconnected';
    this.connectPromise = null;
  }

  private async ensureConnected(): Promise<void> {
    if (this._status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._status = 'connecting';

      const ws = new WebSocket(this.url);
      this.ws = ws;

      let handshakeComplete = false;
      let challengeNonce: string | null = null;

      ws.onopen = () => {
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      };

      ws.onmessage = (event: MessageEvent) => {
        const raw = String(event.data);
        let msg: GatewayMessage;
        try {
          msg = JSON.parse(raw) as GatewayMessage;
        } catch {
          return;
        }

        // Handshake phase
        if (!handshakeComplete) {
          // Step 1: Receive connect.challenge
          // Gateway sends: { type: "event", event: "connect.challenge", payload: { nonce, ts } }
          const isChallenge =
            (msg.event === 'connect.challenge' && msg.payload) ||
            (msg.method === 'connect.challenge' && (msg.params ?? msg.payload));
          const challengeData = msg.payload ?? msg.params;

          if (isChallenge && challengeData) {
            challengeNonce = typeof challengeData.nonce === 'string' ? challengeData.nonce : '';
            this.sendConnectFrame(ws, challengeNonce);
            return;
          }

          // Step 2: Receive hello-ok response
          // Gateway sends: { type: "res", id: "…", ok: true, payload: { type: "hello-ok", ... } }
          const isHelloOk =
            (msg.type === 'res' && msg.ok === true && msg.payload) ||
            (msg.type === 'res' && !msg.error && challengeNonce);

          if (isHelloOk) {
            handshakeComplete = true;
            this._status = 'connected';

            if (this.pairingMessageShown) {
              console.log('  Device approved — gateway connected.');
              console.log('');
              this.pairingMessageShown = false;
            } else {
              console.log(`Gateway connected (${this.url})`);
            }

            // Persist device token if provided
            // Token is at payload.auth.deviceToken
            const payload = msg.payload;
            const auth = payload?.auth as Record<string, unknown> | undefined;
            const deviceToken = auth?.deviceToken;
            if (typeof deviceToken === 'string' && this.deviceIdentity) {
              this.deviceIdentity.deviceToken = deviceToken;
              this.saveDeviceIdentity(this.deviceIdentity);
            }

            resolve();
            return;
          }

          // Handshake error
          if (msg.type === 'res' && (msg.error || msg.ok === false)) {
            const errorMsg = msg.error?.message ?? 'unknown error';
            const details = msg.error?.details;
            const rawCode = details?.code ?? msg.error?.code;
            const code = typeof rawCode === 'string' ? rawCode : '';

            if (code === 'PAIRING_REQUIRED') {
              if (!this.pairingMessageShown) {
                const rawReqId = details?.requestId;
                const requestId = typeof rawReqId === 'string' ? rawReqId : '';
                console.log('');
                console.log('  Device pairing required');
                console.log('');
                console.log('  This device must be approved on your OpenClaw gateway.');
                console.log('  Run on your gateway host:');
                console.log('');
                console.log(`    openclaw devices approve ${requestId}`);
                console.log('');
                console.log('  Waiting for approval...');
                this.pairingMessageShown = true;
              }

              // Retry every 5s — user may approve at any time
              this._status = 'disconnected';
              this.reconnectDelay = PAIRING_RETRY_DELAY_MS;
              reject(new Error(`Gateway handshake failed: ${errorMsg}`));
              if (!this.disposed) {
                this.scheduleReconnect();
              }
              return;
            }

            const err = new Error(`Gateway handshake failed: ${errorMsg}`);
            this._status = 'disconnected';
            reject(err);
            return;
          }

          return;
        }

        // Normal RPC response
        if (msg.type === 'res' && msg.id) {
          const call = this.pendingCalls.get(msg.id);
          if (call) {
            this.pendingCalls.delete(msg.id);
            clearTimeout(call.timer);
            if (msg.error) {
              call.reject(new Error(msg.error.message));
            } else {
              // Result may be in msg.result or msg.payload
              call.resolve(msg.result ?? msg.payload);
            }
          }
        }
      };

      ws.onclose = () => {
        const wasConnected = handshakeComplete;
        this._status = 'disconnected';

        if (!handshakeComplete) {
          reject(new Error('Gateway connection closed during handshake'));
        }

        // Reject pending calls
        for (const call of this.pendingCalls.values()) {
          clearTimeout(call.timer);
          call.reject(new Error('Gateway connection closed'));
        }
        this.pendingCalls.clear();

        // Auto-reconnect if we were connected and not disposed
        if (wasConnected && !this.disposed) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        if (!handshakeComplete) {
          this._status = 'disconnected';
          reject(new Error(`Gateway connection failed: ${this.url}`));
        }
      };
    });
  }

  private sendConnectFrame(ws: WebSocket, nonce: string): void {
    const identity = this.getOrCreateDeviceIdentity();
    const connectId = String(this.nextId++);
    const signedAt = Date.now();
    const clientId = 'gateway-client';
    const clientMode = 'backend';
    const role = 'operator';
    const scopes = ['operator.read', 'operator.write', 'operator.admin'];
    const token = identity.deviceToken ?? this.token ?? '';
    const platform = process.platform;

    // Build v3 auth payload: v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily
    const authPayload = [
      'v3',
      identity.id,
      clientId,
      clientMode,
      role,
      scopes.join(','),
      String(signedAt),
      token,
      nonce,
      platform.toLowerCase(),
      '', // deviceFamily (empty for server)
    ].join('|');

    const signature = this.signPayload(authPayload, identity.privateKeyPkcs8);

    const frame = {
      type: 'req',
      id: connectId,
      method: 'connect',
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: clientId,
          version: '1.0.0',
          platform,
          mode: clientMode,
        },
        role,
        scopes,
        caps: [],
        commands: [],
        permissions: {},
        auth: { token: identity.deviceToken ?? this.token },
        locale: 'en-US',
        userAgent: 'hzl-dashboard/1.0.0',
        device: {
          id: identity.id,
          publicKey: identity.publicKey,
          signature,
          signedAt,
          nonce,
        },
      },
    };

    ws.send(JSON.stringify(frame));
  }

  private signPayload(payload: string, privateKeyPkcs8Base64: string): string {
    const privateKeyDer = Buffer.from(privateKeyPkcs8Base64, 'base64');
    const key = createPrivateKey({
      key: privateKeyDer,
      format: 'der',
      type: 'pkcs8',
    });
    const sig = sign(null, Buffer.from(payload, 'utf8'), key);
    return base64UrlEncode(sig);
  }

  /**
   * Derive device ID as SHA256 hex of the raw 32-byte Ed25519 public key.
   * publicKeyBase64Url is the raw 32-byte key in base64url encoding.
   */
  private deriveDeviceId(publicKeyBase64Url: string): string {
    // Decode base64url → raw 32 bytes → SHA256 hex
    const normalized = publicKeyBase64Url.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const raw = Buffer.from(padded, 'base64');
    return createHash('sha256').update(raw).digest('hex');
  }

  private getOrCreateDeviceIdentity(): DeviceIdentity {
    if (this.deviceIdentity) {
      let changed = false;

      // Migrate old SPKI base64 public keys to raw base64url
      // SPKI Ed25519 keys start with 'MCowBQ' (the ASN.1 header)
      if (this.deviceIdentity.publicKey.startsWith('MCowBQ')) {
        const spkiDer = Buffer.from(this.deviceIdentity.publicKey, 'base64');
        const rawKey = spkiDer.subarray(ED25519_SPKI_PREFIX_LEN);
        this.deviceIdentity.publicKey = base64UrlEncode(rawKey);
        changed = true;
      }

      // Validate stored ID matches derived fingerprint
      const expectedId = this.deriveDeviceId(this.deviceIdentity.publicKey);
      if (this.deviceIdentity.id !== expectedId) {
        this.deviceIdentity.id = expectedId;
        changed = true;
      }

      if (changed) {
        this.saveDeviceIdentity(this.deviceIdentity);
      }
      return this.deviceIdentity;
    }

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    // Extract raw 32-byte public key from SPKI DER (strip 12-byte ASN.1 header)
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const rawPub = (spkiDer as Buffer).subarray(ED25519_SPKI_PREFIX_LEN);
    const pubBase64Url = base64UrlEncode(rawPub);

    const identity: DeviceIdentity = {
      id: this.deriveDeviceId(pubBase64Url),
      publicKey: pubBase64Url,
      privateKeyPkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    };

    this.deviceIdentity = identity;
    this.saveDeviceIdentity(identity);
    return identity;
  }

  private loadDeviceIdentity(): DeviceIdentity | null {
    const filePath = path.join(this.configDir, DEVICE_IDENTITY_FILE);
    try {
      if (!fs.existsSync(filePath)) return null;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      const id = data.id as string | undefined;
      const publicKey = data.publicKey as string | undefined;
      // Support both old ('privateKey') and new ('privateKeyPkcs8') field names
      const privateKeyPkcs8 = (data.privateKeyPkcs8 ?? data.privateKey) as string | undefined;
      if (id && publicKey && privateKeyPkcs8) {
        return { id, publicKey, privateKeyPkcs8, deviceToken: data.deviceToken as string | undefined };
      }
      return null;
    } catch {
      return null;
    }
  }

  private saveDeviceIdentity(identity: DeviceIdentity): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      const filePath = path.join(this.configDir, DEVICE_IDENTITY_FILE);
      const tempPath = `${filePath}.tmp.${process.pid}`;
      fs.writeFileSync(tempPath, JSON.stringify(identity, null, 2) + '\n');
      fs.renameSync(tempPath, filePath);
    } catch {
      // Non-fatal: device identity will be regenerated next time
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.disposed) {
        this.ensureConnected().catch(() => {
          // Reconnect failed, schedule another attempt
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
          this.scheduleReconnect();
        });
      }
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }
}
