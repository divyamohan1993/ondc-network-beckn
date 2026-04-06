interface DashboardCardProps {
  label: string;
  value: string | number;
  color: 'saffron' | 'teal' | 'gold' | 'ember';
  icon: React.ReactNode;
}

const colorMap = {
  saffron: {
    bg: 'bg-saffron-500/10',
    text: 'text-saffron-400',
    border: 'border-saffron-500/20',
    glow: 'shadow-glow-sm',
  },
  teal: {
    bg: 'bg-teal-500/10',
    text: 'text-teal-400',
    border: 'border-teal-500/20',
    glow: 'shadow-glow-teal',
  },
  gold: {
    bg: 'bg-gold-500/10',
    text: 'text-gold-400',
    border: 'border-gold-500/20',
    glow: 'shadow-glow-gold',
  },
  ember: {
    bg: 'bg-ember-500/10',
    text: 'text-ember-400',
    border: 'border-ember-500/20',
    glow: '',
  },
};

export default function DashboardCard({ label, value, color, icon }: DashboardCardProps) {
  const c = colorMap[color];

  return (
    <article className={`card ${c.glow}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-ash-500 font-bold mb-2">{label}</p>
          <p className={`text-3xl font-bold font-display tracking-tight ${c.text}`}>{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center ${c.text}`} aria-hidden="true">
          {icon}
        </div>
      </div>
    </article>
  );
}
