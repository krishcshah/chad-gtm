"use client";

import { useState } from "react";
import { Badge, cn, Input, Label } from "@smartreach/ui";
import { Check, Cpu, Sparkles, Zap, SlidersHorizontal } from "lucide-react";
import { SUPPORTED_AI_MODELS, type AiModelDefinition } from "@smartreach/shared";

interface AiModelSelectorProps {
  selectedProvider: string;
  selectedModel: string;
  onProviderChange: (provider: "google" | "openai") => void;
  onModelChange: (model: string) => void;
  className?: string;
}

export function AiModelSelector({
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  className,
}: AiModelSelectorProps) {
  const [customMode, setCustomMode] = useState(
    () => !SUPPORTED_AI_MODELS.some((m) => m.id === selectedModel)
  );

  const availableModels = SUPPORTED_AI_MODELS.filter(
    (m) => m.provider === selectedProvider
  );

  const handleSelectProvider = (provider: "google" | "openai") => {
    onProviderChange(provider);
    if (!customMode) {
      const defaultForProvider =
        provider === "google" ? "gemini-3.8-flash" : "gpt-5.6";
      onModelChange(defaultForProvider);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Provider Selector Tabs */}
      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          AI Provider
        </Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSelectProvider("google")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
              selectedProvider === "google"
                ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary"
                : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            <Sparkles className="size-4 text-amber-500" />
            <div className="text-left">
              <div className="font-semibold text-foreground">Google Gemini</div>
              <div className="text-[11px] text-muted-foreground">3.8 Flash, 3.5 Series</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelectProvider("openai")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all",
              selectedProvider === "openai"
                ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary"
                : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            <Zap className="size-4 text-emerald-500" />
            <div className="text-left">
              <div className="font-semibold text-foreground">OpenAI</div>
              <div className="text-[11px] text-muted-foreground">GPT-5.6, GPT-5 Mini, o1</div>
            </div>
          </button>
        </div>
      </div>

      {/* Model Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Latest Frontier Models
          </Label>
          <button
            type="button"
            onClick={() => {
              setCustomMode(!customMode);
              if (customMode && !availableModels.some((m) => m.id === selectedModel)) {
                onModelChange(selectedProvider === "google" ? "gemini-3.8-flash" : "gpt-5.6");
              }
            }}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <SlidersHorizontal className="size-3" />
            {customMode ? "Choose from presets" : "Enter custom model ID"}
          </button>
        </div>

        {customMode ? (
          <div className="space-y-1.5 rounded-lg border border-dashed border-border p-3 bg-muted/20">
            <Label htmlFor="custom-model" className="text-xs text-foreground">
              Custom Model Identifier
            </Label>
            <Input
              id="custom-model"
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value.trim())}
              placeholder={selectedProvider === "google" ? "gemini-3.8-flash" : "gpt-5.6"}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Enter any supported model ID or fine-tuned checkpoint for {selectedProvider === "google" ? "Google AI Studio" : "OpenAI"}.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {availableModels.map((model) => {
              const isSelected = selectedModel === model.id;
              return (
                <div
                  key={model.id}
                  onClick={() => onModelChange(model.id)}
                  className={cn(
                    "group relative flex cursor-pointer items-start justify-between rounded-lg border p-3 transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/60 shadow-xs"
                      : "border-border/70 bg-card hover:border-primary/40 hover:bg-accent/40"
                  )}
                >
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {model.name}
                      </span>
                      {model.badge && (
                        <Badge
                          variant={model.recommended ? "default" : "secondary"}
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            model.recommended && "bg-primary text-primary-foreground font-medium"
                          )}
                        >
                          {model.badge}
                        </Badge>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground opacity-70 group-hover:opacity-100">
                        {model.id}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-normal">
                      {model.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center justify-center pt-0.5">
                    <div
                      className={cn(
                        "size-4 rounded-full border flex items-center justify-center transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/80 group-hover:border-primary/50"
                      )}
                    >
                      {isSelected && <Check className="size-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
