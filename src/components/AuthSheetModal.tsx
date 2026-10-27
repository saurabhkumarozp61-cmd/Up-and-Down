import { useState, useMemo, FormEvent } from 'react';
import {
  X,
  GraduationCap,
  Coins,
  Gift,
  Search,
  Send,
  Chrome,
  Sparkles,
} from 'lucide-react';
import { INDIAN_COLLEGES } from '../types.ts';

interface AuthSheetModalProps {
  isOpen: boolean;
  initialReferral: string;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSignup: (data: {
    username: string;
    collegeName: string;
    email: string;
    password: string;
    referredBy?: string;
  }) => void;
  onLogin: (identifier: string, password: string, isDemoQuickLogin?: boolean) => void;
  onGoogleLogin: (collegeName: string, referredBy?: string) => void;
}

export const AuthSheetModal = ({
  isOpen,
  initialReferral,
  isSubmitting,
  error,
  onClose,
  onSignup,
  onLogin,
  onGoogleLogin,
}: AuthSheetModalProps) => {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [collegeSearch, setCollegeSearch] = useState('');
  const [selectedCollege, setSelectedCollege] = useState('IIT Bombay');
  const [showCollegeList, setShowCollegeList] = useState(false);
  const [referredBy, setReferredBy] = useState(initialReferral || '');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const filteredColleges = useMemo(() => {
    const q = collegeSearch.trim().toLowerCase();
    if (!q) return INDIAN_COLLEGES;
    return INDIAN_COLLEGES.filter((c) => c.toLowerCase().includes(q));
  }, [collegeSearch]);

  if (!isOpen) return null;

  const handleSignupSubmit = (e: FormEvent) => {
    e.preventDefault();
    const finalCollege = collegeSearch.trim() || selectedCollege || 'IIT Bombay';
    onSignup({
      username,
      collegeName: finalCollege,
      email,
      password,
      referredBy: referredBy.trim() || undefined,
    });
  };

  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    onLogin(loginIdentifier, loginPassword, false);
  };

  // Detect if inside Telegram WebApp or simulate instant Telegram Mini-App Auth
  const handleTelegramInstantAuth = () => {
    const tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser && tgUser.username) {
      onSignup({
        username: tgUser.username,
        collegeName: selectedCollege || 'IIT Bombay',
        email: `${tgUser.username}@telegram.campusodds.in`,
        password: `tg_${tgUser.id}`,
        referredBy: referredBy.trim() || undefined,
      });
    } else {
      onLogin('anya_du', 'campus123', true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-sheet-title"
    >
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto bg-[#131B2E] border-t border-x border-[#1E293B] rounded-t-3xl p-5 text-white shadow-2xl">
        {/* Grab Handle */}
        <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-3" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#10B981] mb-1">
              <Coins className="w-4 h-4" />
              <span>IN-APP WEBVIEW SAFE · INSTANT ACCESS</span>
            </div>
            <h2 id="auth-sheet-title" className="text-lg font-bold text-white">
              {mode === 'signup'
                ? 'Claim 1,000 Free Campus Coins'
                : 'Welcome Back, Predictor'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#090D16] rounded-2xl border border-[#1E293B] mb-4">
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`min-h-[42px] rounded-xl text-xs font-semibold transition-colors ${
              mode === 'signup'
                ? 'bg-[#131B2E] text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign Up (+1,000 Coins)
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`min-h-[42px] rounded-xl text-xs font-semibold transition-colors ${
              mode === 'login'
                ? 'bg-[#131B2E] text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Log In
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200">
            {error}
          </div>
        )}

        {mode === 'signup' ? (
          <form onSubmit={handleSignupSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="signup-username"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Campus Handle (Username)
              </label>
              <input
                id="signup-username"
                type="text"
                required
                placeholder="e.g. rohit_iitd"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            {/* Searchable Indian College Dropdown + Custom Input */}
            <div className="relative">
              <label
                htmlFor="signup-college"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                College / City Name (For College Wars Leaderboard)
              </label>
              <div className="relative">
                <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  id="signup-college"
                  type="text"
                  required
                  placeholder="Search IIT, DU, NIT, VIT, Manipal, Patna Univ..."
                  value={showCollegeList ? collegeSearch : selectedCollege}
                  onFocus={() => {
                    setCollegeSearch('');
                    setShowCollegeList(true);
                  }}
                  onChange={(e) => {
                    setCollegeSearch(e.target.value);
                    setSelectedCollege(e.target.value);
                    setShowCollegeList(true);
                  }}
                  className="w-full min-h-[44px] pl-10 pr-9 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
                />
                <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>

              {showCollegeList && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-xl bg-[#090D16] border border-slate-700 divide-y divide-slate-800/80 shadow-xl z-20">
                  {filteredColleges.map((college) => (
                    <button
                      key={college}
                      type="button"
                      onClick={() => {
                        setSelectedCollege(college);
                        setCollegeSearch('');
                        setShowCollegeList(false);
                      }}
                      className="w-full text-left px-3.5 py-2.5 text-xs text-slate-200 hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span>{college}</span>
                      {selectedCollege === college && (
                        <span className="text-[#10B981] font-semibold">Selected</span>
                      )}
                    </button>
                  ))}
                  {collegeSearch.trim() &&
                    !filteredColleges.includes(collegeSearch.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCollege(collegeSearch.trim());
                          setShowCollegeList(false);
                        }}
                        className="w-full text-left px-3.5 py-2.5 text-xs text-[#10B981] hover:bg-slate-800 font-semibold"
                      >
                        Use Custom Campus: &ldquo;{collegeSearch.trim()}&rdquo;
                      </button>
                    )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="signup-email"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  required
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  required
                  minLength={4}
                  placeholder="Min 4 chars"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            {/* Referral Code Bonus */}
            <div>
              <label
                htmlFor="signup-referral"
                className="flex items-center justify-between text-xs font-medium text-slate-300 mb-1"
              >
                <span className="inline-flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5 text-amber-400" />
                  Referred by a Friend? (Optional)
                </span>
                <span className="text-amber-400 font-mono-tabular">+500 Bonus Coins</span>
              </label>
              <input
                id="signup-referral"
                type="text"
                placeholder="Enter referrer username (e.g. arjun_iitb)"
                value={referredBy}
                onChange={(e) => setReferredBy(e.target.value)}
                className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[48px] rounded-2xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting
                ? 'Creating Account...'
                : referredBy.trim()
                ? 'Sign Up & Claim 1,500 Free Coins'
                : 'Sign Up & Claim 1,000 Free Coins'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="login-identifier"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Email or Campus Username
              </label>
              <input
                id="login-identifier"
                type="text"
                required
                placeholder="e.g. arjun_iitb or arjun@iitb.ac.in"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                placeholder="Enter password (demo: campus123)"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[48px] rounded-2xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? 'Signing In...' : 'Log In to Up & Down'}
            </button>
          </form>
        )}

        {/* Instant Demo Accounts & Telegram / Google Options */}
        <div className="mt-4 pt-4 border-t border-[#1E293B] space-y-2.5">
          <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Instant 1-Tap Campus Demo Accounts (Test Any Role):</span>
          </p>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onLogin('arjun_iitb', 'campus123', true)}
              className="min-h-[42px] px-2 py-1.5 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-left transition-colors"
            >
              <p className="text-[11px] font-bold text-emerald-400 truncate">@arjun_iitb</p>
              <p className="text-[10px] text-slate-400">Admin · IITB</p>
            </button>

            <button
              type="button"
              onClick={() => onLogin('anya_du', 'campus123', true)}
              className="min-h-[42px] px-2 py-1.5 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-left transition-colors"
            >
              <p className="text-[11px] font-bold text-amber-300 truncate">@anya_du</p>
              <p className="text-[10px] text-slate-400">Creator · SRCC</p>
            </button>

            <button
              type="button"
              onClick={() => onLogin('kabir_vit', 'campus123', true)}
              className="min-h-[42px] px-2 py-1.5 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-left transition-colors"
            >
              <p className="text-[11px] font-bold text-sky-300 truncate">@kabir_vit</p>
              <p className="text-[10px] text-slate-400">User · VIT</p>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleTelegramInstantAuth}
              className="min-h-[42px] px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram Mini-App</span>
            </button>

            <button
              type="button"
              onClick={() => onGoogleLogin(selectedCollege, referredBy)}
              className="min-h-[42px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Chrome className="w-3.5 h-3.5 text-emerald-400" />
              <span>Google Sign-In</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
