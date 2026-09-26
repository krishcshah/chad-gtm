"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
  Badge,
} from "@smartreach/ui";
import { Sparkles, Key, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";
import { saveWorkspaceAiSettings } from "@/lib/actions";
import { AiModelSelector } from "./ai-model-selector";
import { toast } from "sonner";

interface AiSettingsCardProps {
  initialProvider?: string;
  initialModel?: string;
  hasApiKey?: boolean;
}

export function AiSettingsCard({
  initialProvider = "google",
  initialModel = "gemini-3.8-flash",
  hasApiKey = false,
}: AiSettingsCardProps) {
  const [provider, setProvider] = useState<"google" | "openai">(
    initialProvider === "openai" ? "openai" : "google"
  );
  const [model, setModel] = useState<string>(initialModel || "gemini-3.8-flash");
  const [apiKey, setApiKey] = useState<string>("");
  const [keySaved, setKeySaved] = useState<boolean>(hasApiKey);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      try {
        const res = await saveWorkspaceAiSettings({
          provider,
          model,
          apiKey: apiKey.trim() || undefined,
        });

        if (!res.ok) {
          toast.error(res.error || "Failed to update AI settings");
          return;
        }

        toast.success("AI model configuration saved successfully");
        if (apiKey.trim()) {
          setKeySaved(true);
          setApiKey("");
        }
      } catch (err: any) {
        toast.error(err?.message || "An unexpected error occurred");
      }
    });
  };

  return (
    <Card>
      <CardHeader className="p-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">AI Writing & Script Engine</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configure your frontier AI model for on-the-fly personalization and copy generation.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 border-primary/30 text-primary bg-primary/5 text-xs">
            <ShieldCheck className="size-3" /> AES-GCM Encrypted
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-6 pt-0">
        <Separator />

        {/* Model Selector with latest models */}
        <AiModelSelector
          selectedProvider={provider}
          selectedModel={model}
          onProviderChange={setProvider}
          onModelChange={setModel}
        />

        <Separator />

        {/* API Key Configuration */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-api-key" className="text-xs font-medium text-foreground">
              {provider === "google" ? "Google Gemini API Key" : "OpenAI API Key"}
            </Label>
            {keySaved && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                <CheckCircle2 className="size-3" /> Key saved & encrypted
              </span>
            )}
          </div>
          <div className="relative">
            <Key className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              id="ai-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                keySaved
                  ? "•••••••••••••••••••••••••••••••• (leave blank to keep current key)"
                  : provider === "google"
                  ? "AIzaSy..."
                  : "sk-proj-..."
              }
              className="pl-9 font-mono text-xs"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {provider === "google" ? (
              <>
                Obtain your free or paid key from the{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  Google AI Studio console
                </a>
                .
              </>
            ) : (
              <>
                Obtain your secret key from your{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline hover:text-primary/80"
                >
                  OpenAI dashboard
                </a>
                .
              </>
            )}
            {" "}Keys are encrypted using workspace-level cryptographic envelopes. If no key is set, SmartReach uses built-in heuristic synthesis.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="gap-2 font-medium"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Save AI Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
