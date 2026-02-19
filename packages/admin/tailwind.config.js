/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Core dark surfaces
        void: '#050810',
        abyss: '#0A0E1A',
        surface: {
          DEFAULT: '#111827',
          raised: '#1A2235',
          overlay: '#1E293B',
          border: 'rgba(255, 255, 255, 0.06)',
        },
        // Indian-inspired accent palette
        saffron: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FF8C42',
          500: '#FF6B35',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        teal: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#2EC4B6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
        },
        gold: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        ember: {
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
        },
        // Muted text tones
        ash: {
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
        },
        // Sidebar
        sidebar: {
          DEFAULT: '#070B14',
          hover: 'rgba(255, 107, 53, 0.08)',
          active: 'rgba(255, 107, 53, 0.15)',
          border: 'rgba(255, 255, 255, 0.04)',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh-gradient': 'linear-gradient(135deg, rgba(255,107,53,0.03) 0%, transparent 50%, rgba(46,196,182,0.03) 100%)',
        'glow-saffron': 'radial-gradient(ellipse at center, rgba(255,107,53,0.15) 0%, transparent 70%)',
        'glow-teal': 'radial-gradient(ellipse at center, rgba(46,196,182,0.15) 0%, transparent 70%)',
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(255, 107, 53, 0.1)',
        'glow-md': '0 0 30px rgba(255, 107, 53, 0.15)',
        'glow-teal': '0 0 20px rgba(46, 196, 182, 0.15)',
        'glow-gold': '0 0 20px rgba(245, 158, 11, 0.15)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.3)',
        'inner-light': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'fade-up': 'fadeUp 0.5s ease-out forwards',
        'slide-in': 'slideIn 0.4s ease-out forwards',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255, 107, 53, 0.1)' },
          '50%': { boxShadow: '0 0 25px rgba(255, 107, 53, 0.25)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
