import { ChadGtmLogo } from "@/components/chad-gtm-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 bg-black text-white overflow-hidden app-shell">
      <div className="relative z-10 mb-8 flex flex-col items-center gap-2">
        <ChadGtmLogo size="lg" />
      </div>
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
