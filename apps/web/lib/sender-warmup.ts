export interface SenderWarmupConfig {
  enabled: boolean;
  dailyLimit: number;
  replyRate: number; // percentage, e.g. 40
  sentCount: number;
  receivedCount: number;
}

export function parseSenderWarmup(signature: string | null | undefined): {
  warmup: SenderWarmupConfig;
  cleanSig: string;
} {
  const defaultWarmup: SenderWarmupConfig = {
    enabled: false,
    dailyLimit: 20,
    replyRate: 40,
    sentCount: 0,
    receivedCount: 0,
  };
  if (!signature) return { warmup: defaultWarmup, cleanSig: "" };

  const match = signature.match(/<!--SR_WARMUP:(\{.*?\})-->/);
  if (!match) return { warmup: defaultWarmup, cleanSig: signature };

  try {
    const parsed = JSON.parse(match[1]);
    const cleanSig = signature.replace(match[0], "").trim();
    return {
      warmup: {
        enabled: Boolean(parsed.enabled),
        dailyLimit: Number(parsed.dailyLimit) || 20,
        replyRate: Number(parsed.replyRate) || 40,
        sentCount: Number(parsed.sentCount) || 0,
        receivedCount: Number(parsed.receivedCount) || 0,
      },
      cleanSig,
    };
  } catch {
    return { warmup: defaultWarmup, cleanSig: signature };
  }
}

export function formatSenderWarmup(
  cleanSignature: string,
  warmup: Partial<SenderWarmupConfig>
): string {
  const json = JSON.stringify({
    enabled: Boolean(warmup.enabled),
    dailyLimit: Number(warmup.dailyLimit ?? 20),
    replyRate: Number(warmup.replyRate ?? 40),
    sentCount: Number(warmup.sentCount ?? 0),
    receivedCount: Number(warmup.receivedCount ?? 0),
  });
  return `${cleanSignature.trim()}\n<!--SR_WARMUP:${json}-->`.trim();
}
