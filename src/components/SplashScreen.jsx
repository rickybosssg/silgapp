import { SILGAPP_LOGO_URL } from "@/lib/branding";

export default function SplashScreen() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#0969F2]"
    >
      <div className="flex flex-col items-center gap-6 px-8 relative z-10">
        <img
          src={SILGAPP_LOGO_URL}
          alt="SILGAPP Logo"
          className="w-40 h-40 rounded-[2rem] shadow-2xl object-cover ring-1 ring-white/40"
        />
        <div className="text-center space-y-2">
          <p className="text-white text-2xl font-extrabold tracking-wide">
            Bienvenue sur SILGAPP
          </p>
          <p className="text-white/90 text-sm font-medium tracking-wider">
            PLUS QU'UN SERVICE, UNE PROMESSE
          </p>
        </div>
        <div className="flex gap-1.5 mt-4">
          <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
