interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'saffron' | 'teal' | 'gold' | 'ember';
}

const colorMap = {
  saffron: {
    glow: 'rgba(255, 107, 53, 0.08)',
    iconBg: 'linear-gradient(135deg, #FF6B35 0%, #EA580C 100%)',
    iconShadow: '0 4px 15px rgba(255, 107, 53, 0.3)',
    text: 'text-saffron-400',
    border: 'rgba(255, 107, 53, 0.12)',
  },
  teal: {
    glow: 'rgba(46, 196, 182, 0.08)',
    iconBg: 'linear-gradient(135deg, #2EC4B6 0%, #0D9488 100%)',
    iconShadow: '0 4px 15px rgba(46, 196, 182, 0.3)',
    text: 'text-teal-400',
    border: 'rgba(46, 196, 182, 0.12)',
  },
  gold: {
    glow: 'rgba(245, 158, 11, 0.08)',
    iconBg: 'linear-gradient(135deg, #FBBF24 0%, #D97706 100%)',
    iconShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
    text: 'text-gold-400',
    border: 'rgba(245, 158, 11, 0.12)',
  },
  ember: {
    glow: 'rgba(239, 68, 68, 0.08)',
    iconBg: 'linear-gradient(135deg, #F87171 0%, #DC2626 100%)',
    iconShadow: '0 4px 15px rgba(239, 68, 68, 0.3)',
    text: 'text-ember-400',
    border: 'rgba(239, 68, 68, 0.12)',
  },
};

export default function StatsCard({ label, value, icon, color }: StatsCardProps) {
  const colors = colorMap[color];

  return (
    <div
      className="relative rounded-2xl p-5 bg-surface/80 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:scale-[1.02]"
      style={{
        border: `1px solid ${colors.border}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Background glow */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl pointer-events-none"
        style={{ background: colors.glow }}
      />

      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-[13px] font-medium text-ash-500 mb-1.5">{label}</p>
          <p className={`text-2xl font-bold font-display tracking-tight ${colors.text}`}>
            {value}
          </p>
        </div>
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{ background: colors.iconBg, boxShadow: colors.iconShadow }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
