export default function SplashScreen() {
  const stars = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 2.5 + Math.random() * 2,
    size: 8 + Math.random() * 10,
    opacity: 0.6 + Math.random() * 0.4,
  }));

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#1a7a3c" }}
    >
      {/* Étoiles tombantes */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute pointer-events-none select-none"
          style={{
            left: `${star.left}%`,
            top: "-20px",
            fontSize: `${star.size}px`,
            opacity: star.opacity,
            animation: `starFall ${star.duration}s ${star.delay}s infinite linear`,
          }}
        >
          ⭐
        </div>
      ))}

      {/* Contenu centré */}
      <div className="flex flex-col items-center gap-6 px-8 relative z-10">
        <img
          src="https://media.base44.com/images/public/6a0ec08f3af5e1d1284254c1/666943399_IMG-20260523-WA00032.jpg"
          alt="SILGAPP Logo"
          className="w-36 h-36 rounded-3xl shadow-2xl object-contain"
        />
        <div className="text-center space-y-2">
          <p className="text-white text-2xl font-extrabold tracking-wide">
            Bienvenue sur SILGAPP
          </p>
          <p className="text-white/90 text-sm font-medium tracking-wider">
            ❤️ PLUS QU'UN SERVICE, UNE PROMESSE ❤️
          </p>
        </div>
        <div className="flex gap-1.5 mt-4">
          <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>

      <style>{`
        @keyframes starFall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.8; }
          100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}