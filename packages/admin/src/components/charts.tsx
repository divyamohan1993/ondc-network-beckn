'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#FF6B35', '#2EC4B6', '#FBBF24', '#F87171', '#A78BFA', '#EC4899', '#06B6D4', '#84CC16'];

const tooltipStyle = {
  backgroundColor: '#1A2235',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const axisStyle = { fontSize: 11, fontFamily: 'Outfit', fill: '#64748B' };
const gridStroke = 'rgba(255,255,255,0.04)';

// ---------------------------------------------------------------------------
// TransactionVolumeChart
// ---------------------------------------------------------------------------
interface TransactionVolumeChartProps {
  data: Array<{ date: string; count: number }>;
}

export function TransactionVolumeChart({ data }: TransactionVolumeChartProps) {
  return (
    <div className="card">
      <h3 className="card-header">Transaction Volume (Last 7 Days)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF6B35" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#FF6B35" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="date" tick={axisStyle} stroke="transparent" />
          <YAxis tick={axisStyle} stroke="transparent" />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#CBD5E1', fontWeight: 600 }} itemStyle={{ color: '#FF8C42' }} />
          <Area type="monotone" dataKey="count" stroke="#FF6B35" strokeWidth={2.5} fill="url(#colorCount)" dot={{ fill: '#FF6B35', strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: '#FF6B35', stroke: '#1A2235', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DomainTransactionsChart (stacked area)
// ---------------------------------------------------------------------------
interface DomainTransactionsChartProps {
  data: Array<Record<string, any>>;
  domains: string[];
}

export function DomainTransactionsChart({ data, domains }: DomainTransactionsChartProps) {
  return (
    <div className="card">
      <h3 className="card-header">Transactions by Domain</h3>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="date" tick={axisStyle} stroke="transparent" />
          <YAxis tick={axisStyle} stroke="transparent" />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#CBD5E1', fontWeight: 600 }} />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Outfit', color: '#94A3B8' }} />
          {domains.map((domain, idx) => (
            <Area
              key={domain}
              type="monotone"
              dataKey={domain}
              stackId="1"
              stroke={COLORS[idx % COLORS.length]}
              fill={COLORS[idx % COLORS.length]}
              fillOpacity={0.15}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConversionFunnelChart
// ---------------------------------------------------------------------------
interface ConversionFunnelChartProps {
  data: Array<{ action: string; count: number }>;
}

export function ConversionFunnelChart({ data }: ConversionFunnelChartProps) {
  return (
    <div className="card">
      <h3 className="card-header">Search to Order Conversion Funnel</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="action" tick={axisStyle} stroke="transparent" />
          <YAxis tick={axisStyle} stroke="transparent" />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#CBD5E1', fontWeight: 600 }} />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LatencyChart
// ---------------------------------------------------------------------------
interface LatencyChartProps {
  data: Array<{ action: string; avg_latency: number }>;
}

export function LatencyChart({ data }: LatencyChartProps) {
  return (
    <div className="card">
      <h3 className="card-header">Average Latency by Action (ms)</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis type="number" tick={axisStyle} stroke="transparent" />
          <YAxis type="category" dataKey="action" tick={axisStyle} stroke="transparent" />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#CBD5E1', fontWeight: 600 }} />
          <Bar dataKey="avg_latency" fill="#A78BFA" radius={[0, 8, 8, 0]} fillOpacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopParticipantsChart
// ---------------------------------------------------------------------------
interface TopParticipantsChartProps {
  data: Array<{ subscriber_id: string; count: number }>;
}

export function TopParticipantsChart({ data }: TopParticipantsChartProps) {
  return (
    <div className="card">
      <h3 className="card-header">Top Participants by Volume</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="subscriber_id" tick={{ ...axisStyle, fontSize: 10 }} stroke="transparent" angle={-30} textAnchor="end" height={80} />
          <YAxis tick={axisStyle} stroke="transparent" />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#CBD5E1', fontWeight: 600 }} />
          <Bar dataKey="count" fill="#2EC4B6" radius={[8, 8, 0, 0]} fillOpacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PieChartComponent
// ---------------------------------------------------------------------------
interface PieChartComponentProps {
  data: Array<{ name: string; value: number }>;
  title: string;
}

export function PieChartComponent({ data, title }: PieChartComponentProps) {
  return (
    <div className="card">
      <h3 className="card-header">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={105}
            paddingAngle={4}
            dataKey="value"
            stroke="rgba(10,14,26,0.8)"
            strokeWidth={2}
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} fillOpacity={0.85} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#CBD5E1', fontWeight: 600 }} />
          <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Outfit', color: '#94A3B8' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
