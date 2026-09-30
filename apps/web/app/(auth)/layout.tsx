import { ChadGtmLogo } from "@/components/chad-gtm-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 bg-[#07090e] text-zinc-100 overflow-hidden">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[650px] rounded-full bg-violet-600/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-1/4 size-[500px] rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative z-10 mb-8 flex flex-col items-center gap-2">
        <ChadGtmLogo />
      </div>
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
