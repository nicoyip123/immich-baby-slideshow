import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSoundtrackMixer,
  soundtrackLevel,
  type SoundtrackAudio,
  type SoundtrackAudioContext,
} from "../../src/client/soundtrack.js";

class FakeAudio implements SoundtrackAudio {
  private storedVolume = 1;
  readonly play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  volumeError: unknown;

  get volume(): number {
    return this.storedVolume;
  }

  set volume(value: number) {
    if (this.volumeError !== undefined) {
      throw this.volumeError;
    }
    this.storedVolume = value;
  }
}

class FakeBrowserAudio extends FakeAudio {}

function createNativeContextHarness() {
  const instances: NativeContext[] = [];

  class NativeContext {
    readonly currentTime = 4;
    readonly destination = {};
    readonly source = {
      connect: vi.fn<(destination: unknown) => void>(),
      disconnect: vi.fn<() => void>(),
    };
    readonly gain = {
      gain: {
        value: 1,
        cancelScheduledValues: vi.fn<(time: number) => void>(),
        setValueAtTime: vi.fn<(value: number, time: number) => void>(),
        linearRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
      },
      connect: vi.fn<(destination: unknown) => void>(),
      disconnect: vi.fn<() => void>(),
    };
    readonly createMediaElementSource = vi.fn((_audio: unknown) => this.source);
    readonly createGain = vi.fn(() => this.gain);
    readonly resume = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    readonly close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    constructor() {
      instances.push(this);
    }
  }

  return { Context: NativeContext, instances };
}

function stubBrowserWindow(
  standardContext: unknown,
  webkitContext?: unknown,
): void {
  vi.stubGlobal("window", {
    AudioContext: standardContext,
    HTMLMediaElement: FakeBrowserAudio,
    webkitAudioContext: webkitContext,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function deferredRejection(error: unknown): Promise<void> {
  return new Promise((_resolve, reject) => {
    queueMicrotask(() => reject(error));
  });
}

function createGraph() {
  const gainParam = {
    value: 0.35,
    cancelScheduledValues: vi.fn<(time: number) => void>(),
    setValueAtTime: vi.fn<(value: number, time: number) => void>(),
    linearRampToValueAtTime: vi.fn<(value: number, time: number) => void>(),
  };
  const source = {
    connect: vi.fn<(destination: unknown) => void>(),
    disconnect: vi.fn<() => void>(),
  };
  const gain = {
    gain: gainParam,
    connect: vi.fn<(destination: unknown) => void>(),
    disconnect: vi.fn<() => void>(),
  };
  const destination = {};
  const context: SoundtrackAudioContext = {
    currentTime: 12.5,
    destination,
    createMediaElementSource: vi.fn(() => source),
    createGain: vi.fn(() => gain),
    resume: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  return { context, destination, gain, gainParam, source };
}

describe("soundtrackLevel", () => {
  it.each([
    ["IMAGE", false, 1],
    ["VIDEO", false, 0.15],
    [undefined, false, 1],
    ["IMAGE", true, 0],
    ["VIDEO", true, 0],
    [undefined, true, 0],
  ] as const)("returns %s/%s as %s", (type, muted, expected) => {
    expect(soundtrackLevel(type, muted)).toBe(expected);
  });
});

describe("createSoundtrackMixer Web Audio path", () => {
  it("constructs one graph and connects source through gain to destination", () => {
    const audio = new FakeAudio();
    const graph = createGraph();
    const createContext = vi.fn(() => graph.context);

    createSoundtrackMixer(audio, createContext);

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(graph.context.createMediaElementSource).toHaveBeenCalledTimes(1);
    expect(graph.context.createMediaElementSource).toHaveBeenCalledWith(audio);
    expect(graph.context.createGain).toHaveBeenCalledTimes(1);
    expect(graph.source.connect).toHaveBeenCalledOnce();
    expect(graph.source.connect).toHaveBeenCalledWith(graph.gain);
    expect(graph.gain.connect).toHaveBeenCalledOnce();
    expect(graph.gain.connect).toHaveBeenCalledWith(graph.destination);
  });

  it("ramps video volume to exactly 0.15 over 0.4 seconds", () => {
    const graph = createGraph();
    const mixer = createSoundtrackMixer(new FakeAudio(), () => graph.context);

    mixer.setTarget(0.15);

    expect(graph.gainParam.cancelScheduledValues).toHaveBeenCalledWith(12.5);
    expect(graph.gainParam.setValueAtTime).toHaveBeenCalledWith(0.35, 12.5);
    expect(graph.gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.15, 12.9);
  });

  it.each([
    [-2, 0],
    [2, 1],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [Number.NEGATIVE_INFINITY, 0],
  ])("clamps or safely normalizes %s to %s", (requested, expected) => {
    const graph = createGraph();
    const mixer = createSoundtrackMixer(new FakeAudio(), () => graph.context);

    mixer.setTarget(requested);

    expect(graph.gainParam.linearRampToValueAtTime).toHaveBeenCalledWith(expected, 12.9);
  });

  it("resumes the context and plays the audio", async () => {
    const audio = new FakeAudio();
    const graph = createGraph();
    const mixer = createSoundtrackMixer(audio, () => graph.context);

    await expect(mixer.start()).resolves.toBeUndefined();

    expect(graph.context.resume).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("still plays when resume rejects", async () => {
    const audio = new FakeAudio();
    const graph = createGraph();
    vi.mocked(graph.context.resume).mockRejectedValueOnce(new Error("resume failed"));
    const mixer = createSoundtrackMixer(audio, () => graph.context);

    await expect(mixer.start()).resolves.toBeUndefined();

    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("still plays when resume throws synchronously", async () => {
    const audio = new FakeAudio();
    const graph = createGraph();
    vi.mocked(graph.context.resume).mockImplementationOnce(() => {
      throw new Error("resume threw");
    });
    const mixer = createSoundtrackMixer(audio, () => graph.context);

    await expect(mixer.start()).resolves.toBeUndefined();

    expect(graph.context.resume).toHaveBeenCalledOnce();
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("resolves when play rejects", async () => {
    const audio = new FakeAudio();
    audio.play.mockRejectedValueOnce(new Error("play failed"));
    const graph = createGraph();
    const mixer = createSoundtrackMixer(audio, () => graph.context);

    await expect(mixer.start()).resolves.toBeUndefined();
  });

  it("resolves when play throws synchronously", async () => {
    const audio = new FakeAudio();
    audio.play.mockImplementationOnce(() => {
      throw new Error("play threw");
    });
    const graph = createGraph();
    const mixer = createSoundtrackMixer(audio, () => graph.context);

    await expect(mixer.start()).resolves.toBeUndefined();

    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("never throws when any automation method throws", () => {
    for (const method of [
      "cancelScheduledValues",
      "setValueAtTime",
      "linearRampToValueAtTime",
    ] as const) {
      const graph = createGraph();
      graph.gainParam[method].mockImplementationOnce(() => {
        throw new Error(`${method} failed`);
      });
      const mixer = createSoundtrackMixer(new FakeAudio(), () => graph.context);

      expect(() => mixer.setTarget(0.5)).not.toThrow();
    }
  });

  it("never throws when reading the context time throws", () => {
    const graph = createGraph();
    Object.defineProperty(graph.context, "currentTime", {
      get() {
        throw new Error("clock failed");
      },
    });
    const mixer = createSoundtrackMixer(new FakeAudio(), () => graph.context);

    expect(() => mixer.setTarget(0.5)).not.toThrow();
  });

  it("disposes the graph and context only once", async () => {
    const graph = createGraph();
    const mixer = createSoundtrackMixer(new FakeAudio(), () => graph.context);

    mixer.dispose();
    mixer.dispose();
    await Promise.resolve();

    expect(graph.source.disconnect).toHaveBeenCalledOnce();
    expect(graph.gain.disconnect).toHaveBeenCalledOnce();
    expect(graph.context.close).toHaveBeenCalledOnce();
  });

  it("swallows disconnect and synchronous close failures", () => {
    const graph = createGraph();
    graph.source.disconnect.mockImplementationOnce(() => {
      throw new Error("source disconnect failed");
    });
    graph.gain.disconnect.mockImplementationOnce(() => {
      throw new Error("gain disconnect failed");
    });
    vi.mocked(graph.context.close).mockImplementationOnce(() => {
      throw new Error("close failed");
    });
    const mixer = createSoundtrackMixer(new FakeAudio(), () => graph.context);

    expect(() => mixer.dispose()).not.toThrow();
    expect(graph.gain.disconnect).toHaveBeenCalledOnce();
    expect(graph.context.close).toHaveBeenCalledOnce();
  });

  it("handles an asynchronous close rejection", async () => {
    const graph = createGraph();
    vi.mocked(graph.context.close).mockReturnValueOnce(
      deferredRejection(new Error("close rejected")),
    );
    const mixer = createSoundtrackMixer(new FakeAudio(), () => graph.context);

    mixer.dispose();

    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("createSoundtrackMixer default browser factory", () => {
  it("uses window.AudioContext", () => {
    const standard = createNativeContextHarness();
    stubBrowserWindow(standard.Context);

    const mixer = createSoundtrackMixer(new FakeBrowserAudio());

    expect(standard.instances).toHaveLength(1);
    expect(standard.instances[0]?.createMediaElementSource).toHaveBeenCalledOnce();
    mixer.dispose();
  });

  it("falls back to window.webkitAudioContext", () => {
    const webkit = createNativeContextHarness();
    stubBrowserWindow(undefined, webkit.Context);

    const mixer = createSoundtrackMixer(new FakeBrowserAudio());

    expect(webkit.instances).toHaveLength(1);
    expect(webkit.instances[0]?.createMediaElementSource).toHaveBeenCalledOnce();
    mixer.dispose();
  });

  it("prefers window.AudioContext when both constructors exist", () => {
    const standard = createNativeContextHarness();
    const webkit = createNativeContextHarness();
    stubBrowserWindow(standard.Context, webkit.Context);

    const mixer = createSoundtrackMixer(new FakeBrowserAudio());

    expect(standard.instances).toHaveLength(1);
    expect(webkit.instances).toHaveLength(0);
    mixer.dispose();
  });

  it("uses the safe volume fallback when Web Audio is unavailable", () => {
    const audio = new FakeBrowserAudio();
    stubBrowserWindow(undefined);

    const mixer = createSoundtrackMixer(audio);
    mixer.setTarget(0.3);

    expect(audio.volume).toBe(0.3);
  });
});

describe("createSoundtrackMixer fallback", () => {
  it("uses volume and play when context construction fails", async () => {
    const audio = new FakeAudio();
    const mixer = createSoundtrackMixer(audio, () => {
      throw new Error("context unavailable");
    });

    expect(() => mixer.setTarget(0.4)).not.toThrow();
    expect(audio.volume).toBe(0.4);
    await expect(mixer.start()).resolves.toBeUndefined();
    expect(audio.play).toHaveBeenCalledOnce();
    expect(() => {
      mixer.dispose();
      mixer.dispose();
    }).not.toThrow();
  });

  it.each([
    {
      step: "createMediaElementSource",
      fail(graph: ReturnType<typeof createGraph>) {
        vi.mocked(graph.context.createMediaElementSource).mockImplementationOnce(() => {
          throw new Error("source creation failed");
        });
      },
      sourceDisconnects: 0,
      gainDisconnects: 0,
    },
    {
      step: "createGain",
      fail(graph: ReturnType<typeof createGraph>) {
        vi.mocked(graph.context.createGain).mockImplementationOnce(() => {
          throw new Error("gain creation failed");
        });
      },
      sourceDisconnects: 1,
      gainDisconnects: 0,
    },
    {
      step: "source.connect",
      fail(graph: ReturnType<typeof createGraph>) {
        graph.source.connect.mockImplementationOnce(() => {
          throw new Error("source connection failed");
        });
      },
      sourceDisconnects: 1,
      gainDisconnects: 1,
    },
    {
      step: "gain.connect",
      fail(graph: ReturnType<typeof createGraph>) {
        graph.gain.connect.mockImplementationOnce(() => {
          throw new Error("gain connection failed");
        });
      },
      sourceDisconnects: 1,
      gainDisconnects: 1,
    },
  ])(
    "cleans resources after $step fails and falls back",
    ({ fail, sourceDisconnects, gainDisconnects }) => {
      const audio = new FakeAudio();
      const graph = createGraph();
      fail(graph);

      const mixer = createSoundtrackMixer(audio, () => graph.context);
      mixer.setTarget(0.6);

      expect(graph.source.disconnect).toHaveBeenCalledTimes(sourceDisconnects);
      expect(graph.gain.disconnect).toHaveBeenCalledTimes(gainDisconnects);
      expect(graph.context.close).toHaveBeenCalledOnce();
      expect(audio.volume).toBe(0.6);
    },
  );

  it("swallows fallback volume setter failures", () => {
    const audio = new FakeAudio();
    audio.volumeError = new Error("volume failed");
    const mixer = createSoundtrackMixer(audio, () => {
      throw new Error("context unavailable");
    });

    expect(() => mixer.setTarget(0.5)).not.toThrow();
  });

  it("swallows fallback play rejection", async () => {
    const audio = new FakeAudio();
    audio.play.mockReturnValueOnce(deferredRejection(new Error("play rejected")));
    const mixer = createSoundtrackMixer(audio, () => {
      throw new Error("context unavailable");
    });

    await expect(mixer.start()).resolves.toBeUndefined();
  });

  it("swallows a synchronous fallback play throw", async () => {
    const audio = new FakeAudio();
    audio.play.mockImplementationOnce(() => {
      throw new Error("play threw");
    });
    const mixer = createSoundtrackMixer(audio, () => {
      throw new Error("context unavailable");
    });

    await expect(mixer.start()).resolves.toBeUndefined();

    expect(audio.play).toHaveBeenCalledOnce();
  });
});
