export interface SoundtrackMixer {
  start(): Promise<void>;
  setTarget(level: number): void;
  dispose(): void;
}

export interface SoundtrackAudio {
  play(): Promise<void>;
  volume: number;
}

interface SoundtrackAudioParam {
  readonly value: number;
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
}

interface SoundtrackSourceNode {
  connect(destination: unknown): void;
  disconnect(): void;
}

interface SoundtrackGainNode {
  readonly gain: SoundtrackAudioParam;
  connect(destination: unknown): void;
  disconnect(): void;
}

export interface SoundtrackAudioContext {
  readonly currentTime: number;
  readonly destination: unknown;
  createMediaElementSource(audio: SoundtrackAudio): SoundtrackSourceNode;
  createGain(): SoundtrackGainNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type SoundtrackContextFactory = () => SoundtrackAudioContext;

interface AudioContextConstructor {
  new (): AudioContext;
}

function isAudioContextConstructor(value: unknown): value is AudioContextConstructor {
  return typeof value === "function";
}

function browserContextFactory(): SoundtrackAudioContext {
  const standardConstructor: unknown = window.AudioContext;
  const webkitConstructor: unknown = Reflect.get(window, "webkitAudioContext");
  const ContextConstructor = isAudioContextConstructor(standardConstructor)
    ? standardConstructor
    : webkitConstructor;

  if (!isAudioContextConstructor(ContextConstructor)) {
    throw new Error("Web Audio is unavailable");
  }

  const context = new ContextConstructor();
  const nativeNodes = new WeakMap<object, AudioNode>();
  const destination = {};
  nativeNodes.set(destination, context.destination);

  function connect(node: AudioNode, target: unknown): void {
    if (typeof target !== "object" || target === null) {
      throw new Error("Invalid audio destination");
    }
    const nativeTarget = nativeNodes.get(target);
    if (nativeTarget === undefined) {
      throw new Error("Unknown audio destination");
    }
    node.connect(nativeTarget);
  }

  return {
    get currentTime() {
      return context.currentTime;
    },
    destination,
    createMediaElementSource(audio) {
      if (!(audio instanceof window.HTMLMediaElement)) {
        throw new Error("A browser media element is required");
      }
      const nativeSource = context.createMediaElementSource(audio);
      const source: SoundtrackSourceNode = {
        connect: (target) => connect(nativeSource, target),
        disconnect: () => nativeSource.disconnect(),
      };
      nativeNodes.set(source, nativeSource);
      return source;
    },
    createGain() {
      const nativeGain = context.createGain();
      const gain: SoundtrackGainNode = {
        gain: nativeGain.gain,
        connect: (target) => connect(nativeGain, target),
        disconnect: () => nativeGain.disconnect(),
      };
      nativeNodes.set(gain, nativeGain);
      return gain;
    },
    resume: () => context.resume(),
    close: () => context.close(),
  };
}

function safeLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }
  return Math.min(1, Math.max(0, level));
}

function ignoreClose(context: SoundtrackAudioContext): void {
  try {
    void context.close().catch(() => undefined);
  } catch {
    // Closing is best-effort.
  }
}

function disconnect(node: { disconnect(): void } | undefined): void {
  try {
    node?.disconnect();
  } catch {
    // Disconnection is best-effort.
  }
}

function startIndependently(
  audio: SoundtrackAudio,
  context?: SoundtrackAudioContext,
): Promise<void> {
  const pending: Promise<void>[] = [];
  if (context !== undefined) {
    try {
      pending.push(context.resume());
    } catch {
      // A synchronous resume failure must not prevent playback.
    }
  }
  try {
    pending.push(audio.play());
  } catch {
    // A synchronous playback failure is nonfatal.
  }
  return Promise.allSettled(pending).then(() => undefined);
}

function createInertMixer(): SoundtrackMixer {
  return {
    start: () => Promise.resolve(),
    setTarget() {},
    dispose() {},
  };
}

function createFallbackMixer(audio: SoundtrackAudio): SoundtrackMixer {
  return {
    start: () => startIndependently(audio),
    setTarget(level) {
      try {
        audio.volume = safeLevel(level);
      } catch {
        // Some media implementations expose a throwing volume setter.
      }
    },
    dispose() {},
  };
}

function createDirectMixer(
  audio: SoundtrackAudio,
  context: SoundtrackAudioContext,
  source: SoundtrackSourceNode,
): SoundtrackMixer {
  let disposed = false;
  return {
    start: () => startIndependently(audio, context),
    setTarget(level) {
      try {
        audio.volume = safeLevel(level);
      } catch {
        // Some media implementations expose a throwing volume setter.
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disconnect(source);
      ignoreClose(context);
    },
  };
}

export function soundtrackLevel(
  type: "IMAGE" | "VIDEO" | undefined,
  muted: boolean,
): number {
  if (muted) {
    return 0;
  }
  return type === "VIDEO" ? 0.15 : 1;
}

export function createSoundtrackMixer(
  audio: SoundtrackAudio,
  createContext: SoundtrackContextFactory = browserContextFactory,
): SoundtrackMixer {
  let context: SoundtrackAudioContext | undefined;
  let source: SoundtrackSourceNode | undefined;
  let gain: SoundtrackGainNode | undefined;

  try {
    context = createContext();
    source = context.createMediaElementSource(audio);
    gain = context.createGain();
    source.connect(gain);
    gain.connect(context.destination);
  } catch {
    disconnect(source);
    disconnect(gain);
    if (context === undefined) {
      return createFallbackMixer(audio);
    }
    if (source === undefined) {
      ignoreClose(context);
      return createFallbackMixer(audio);
    }
    try {
      source.connect(context.destination);
      return createDirectMixer(audio, context, source);
    } catch {
      ignoreClose(context);
      return createInertMixer();
    }
  }

  let disposed = false;
  const activeContext = context;
  const activeSource = source;
  const activeGain = gain;

  return {
    start: () => startIndependently(audio, activeContext),
    setTarget(level) {
      try {
        const now = activeContext.currentTime;
        activeGain.gain.cancelScheduledValues(now);
        activeGain.gain.setValueAtTime(activeGain.gain.value, now);
        activeGain.gain.linearRampToValueAtTime(safeLevel(level), now + 0.4);
      } catch {
        // Gain automation is best-effort.
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disconnect(activeSource);
      disconnect(activeGain);
      ignoreClose(activeContext);
    },
  };
}
