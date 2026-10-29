import React, { useState, useEffect } from 'react';
import {
  PlusCircle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  UserCheck,
  Database,
  Copy,
  Check,
  Sparkles,
  User,
  AtSign,
  GraduationCap,
  Gift,
  Share2,
  Clock,
  LogOut,
  Settings,
  Link2,
  Crown,
  Sun,
  Moon,
  RefreshCw,
  Search,
  IndianRupee,
  Calculator,
  Lock,
} from 'lucide-react';
import {
  INDIAN_COLLEGES,
  MarketItem,
  UserProfile,
  UserRole,
  WalletTransactionItem,
} from '../types.ts';
import {
  calculateMarketPrices,
  canUserCreateEvents,
  checkDailyClaimEligibility,
  DEFAULT_OWNER_INVITE_CODE,
  isOwnerEmail,
  isRealMoneyEligible,
  LeaderboardEntryInput,
  OWNER_EMAIL,
  RealMoneyAccessStatus,
} from '../utils/marketMath.ts';

export interface AccountPredictorEntry extends LeaderboardEntryInput {
  email?: string;
  role?: string;
  realMoneyBalance?: number;
  walletBalanceInr?: number;
  realMoneyStatus?: RealMoneyAccessStatus;
  upiId?: string | null;
  realMoneyInviteNote?: string | null;
  isCommunityApproved?: boolean;
  canCreateEvents?: boolean;
  hasPaymentAndTradingAccess?: boolean;
}

interface AdminStudioViewProps {
  user: UserProfile | null;
  markets: MarketItem[];
  predictors?: AccountPredictorEntry[];
  adminWalletTransactions?: WalletTransactionItem[];
  hasCreatorInvite?: boolean;
  themeMode?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onRefreshAccount?: () => Promise<void>;
  isClaimingRefill: boolean;
  onClaimRefill: () => Promise<void>;
  onUpdateProfile: (username: string, collegeName: string) => Promise<void>;
  onRequestCreatorAccess: () => Promise<void>;
  onOpenAuth: () => void;
  onLogout: () => void;
  onCreateMarket: (data: {
    title: string;
    category: string;
    closesAt: string;
    startingYesProbability: number;
    resolutionRules: string;
  }) => Promise<void>;
  onResolveMarket: (
    marketId: number,
    resolution: 'YES' | 'NO' | 'CANCEL'
  ) => Promise<void>;
  onPromoteUser: (targetIdentifier: string, newRole: UserRole) => Promise<void>;
  onOpenUpiWallet: () => void;
  onApproveRealMoney: (
    targetIdentifier: string,
    status: RealMoneyAccessStatus
  ) => Promise<void>;
  onUpdateGranularPermissions?: (
    targetIdentifier: string,
    permissions: {
      isCommunityApproved?: boolean;
      canCreateEvents?: boolean;
      hasPaymentAndTradingAccess?: boolean;
    }
  ) => Promise<void>;
  onReviewDeposit?: (
    transactionId: number,
    decision: 'APPROVED' | 'REJECTED'
  ) => Promise<void>;
  onReviewWithdrawal?: (
    transactionId: number,
    decision: 'COMPLETED' | 'REJECTED',
    payoutUtrNumber?: string
  ) => Promise<void>;
  ownerUpiId?: string;
  onUpdateOwnerUpi?: (newOwnerUpiId: string) => Promise<void>;
  inAppInviteCodes?: Array<{
    code: string;
    label: string;
    isCommunityApproved: boolean;
    canCreateEvents: boolean;
    hasPaymentAndTradingAccess: boolean;
  }>;
  onCreateInviteCode?: (payload: {
    customCode?: string;
    label?: string;
    isCommunityApproved: boolean;
    canCreateEvents: boolean;
    hasPaymentAndTradingAccess: boolean;
  }) => Promise<void>;
}

const CATEGORIES = [
  'Cricket & Sports',
  'Campus Gossip',
  'Pop-Culture & Creators',
  'Tech & Finance',
];

export const AdminStudioView: React.FC<AdminStudioViewProps> = ({
  user,
  markets,
  predictors = [],
  adminWalletTransactions = [],
  hasCreatorInvite = false,
  themeMode = 'light',
  onToggleTheme,
  onRefreshAccount,
  isClaimingRefill,
  onClaimRefill,
  onUpdateProfile,
  onRequestCreatorAccess,
  onOpenAuth,
  onLogout,
  onCreateMarket,
  onResolveMarket,
  onPromoteUser,
  onOpenUpiWallet,
  onApproveRealMoney,
  onUpdateGranularPermissions,
  onReviewDeposit,
  onReviewWithdrawal,
  ownerUpiId = '9931802215@fam',
  onUpdateOwnerUpi,
  inAppInviteCodes = [],
  onCreateInviteCode,
}) => {
  // Profile Custom User ID (@username) & College Edit State
  const [customUsername, setCustomUsername] = useState(user?.username || '');
  const [customCollege, setCustomCollege] = useState(
    user?.collegeName || 'IIT Bombay'
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Copy states
  const [copiedRef, setCopiedRef] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Preferences state
  const [oddsFormat, setOddsFormat] = useState<'percent' | 'coins'>('percent');
  const [instantFlexPopup, setInstantFlexPopup] = useState(true);

  // Event Creation Studio State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [closesAt, setClosesAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [startingProb, setStartingProb] = useState(50);
  const [resolutionRules, setResolutionRules] = useState(
    'Resolves YES based on official announcement or verified campus circular.'
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Owner Creator/Admin & Granular RBAC Invite State
  const [targetHandle, setTargetHandle] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('creator');
  const [inviteCommunity, setInviteCommunity] = useState(true);
  const [inviteCreateEvents, setInviteCreateEvents] = useState(false);
  const [invitePayments, setInvitePayments] = useState(true);
  const [userSearchFilter, setUserSearchFilter] = useState('');

  // Owner Main Receiving UPI ID & Self-Built Invite Code Generator State
  const [ownerUpiInput, setOwnerUpiInput] = useState(
    ownerUpiId || user?.upiId || '9931802215@fam'
  );
  const [newInviteCodeInput, setNewInviteCodeInput] = useState('');
  const [newInviteCodeLabel, setNewInviteCodeLabel] = useState(
    'VIP Campus & Real ₹ UPI Access'
  );

  // SQL Deliverable Viewer State
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlText, setSqlText] = useState<string>('');
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (user) {
      setCustomUsername(user.username);
      setCustomCollege(user.collegeName);
    }
    if (ownerUpiId) {
      setOwnerUpiInput(ownerUpiId);
    }
  }, [user?.username, user?.collegeName, ownerUpiId]);

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center mx-auto text-[#10B981]">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">
              Your Up &amp; Down Account
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              Sign in to customize your{' '}
              <strong className="text-white">@username</strong>, claim your{' '}
              <strong className="text-amber-300">+100 Daily Coin Drop</strong>{' '}
              (1x/day), refer friends for{' '}
              <strong className="text-emerald-300">+500 Coins</strong>, and
              manage your profile settings.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAuth}
            className="w-full min-h-[48px] rounded-2xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all"
          >
            Sign In / Create Account (+1,000 Coins)
          </button>
        </div>
      </div>
    );
  }

  const isOwner = isOwnerEmail(user.email);
  const isAdmin = isOwner || user.role === 'admin';
  const canCreate = canUserCreateEvents(user);
  const realMoneyEligible = isRealMoneyEligible(user);
  const dailyEligibility = checkDailyClaimEligibility(user.lastDailyClaim);
  const openMarkets = markets.filter((m) => m.status === 'open');

  const referralLink = `${window.location.origin}/?ref=${encodeURIComponent(
    user.username
  )}`;
  const creatorInviteLink = `${window.location.origin}/?invite=creator&code=${DEFAULT_OWNER_INVITE_CODE}`;

  const pendingRequests = predictors.filter(
    (p) => p.role === 'pending_creator'
  );
  const pendingRealMoneyRequests = predictors.filter(
    (p) => p.realMoneyStatus === 'pending'
  );
  const pendingUpiDeposits = adminWalletTransactions.filter(
    (t) =>
      t.type === 'DEPOSIT' &&
      (t.status === 'PENDING' || t.status === 'APPROVED')
  );
  const pendingUpiWithdrawals = adminWalletTransactions.filter(
    (t) => t.type === 'WITHDRAWAL' && t.status === 'PENDING'
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSavingProfile(true);
    try {
      await onUpdateProfile(customUsername, customCollege);
      setStatusMessage(
        `Profile updated! Your custom User ID is now @${customUsername
          .trim()
          .replace(/^@+/, '')
          .toLowerCase()}.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not update User ID.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDailyClaimClick = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await onClaimRefill();
      setStatusMessage(
        'Claimed +100 Free Coins! Come back tomorrow for your next daily drop.'
      );
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Daily +100 Coins can only be claimed once per day.'
      );
    }
  };

  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2500);
    } catch {
      setCopiedRef(true);
    }
  };

  const handleShareReferralWhatsApp = () => {
    const text = `Join me on Up & Down and predict campus & IPL markets! Use my invite link to claim 1,500 Free Virtual Coins: ${referralLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.location.href = url;
  };

  const handleCopyCreatorInvite = async () => {
    try {
      await navigator.clipboard.writeText(creatorInviteLink);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2500);
    } catch {
      setCopiedInvite(true);
    }
  };

  const handleShareCreatorInviteWhatsApp = () => {
    const text = `You're invited to Up & Down! Use Invite Code ${DEFAULT_OWNER_INVITE_CODE} or open this link: ${creatorInviteLink}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.location.href = url;
  };

  const handleRequestAccessClick = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onRequestCreatorAccess();
      setStatusMessage(
        `Your request has been sent to the Owner (${OWNER_EMAIL}) for approval!`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to request creator access');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoadSqlSchema = async () => {
    setShowSqlModal(true);
    if (!sqlText) {
      try {
        const res = await fetch('/api/schema-sql');
        const data = await res.json();
        setSqlText(data.sql || '-- supabase/schema.sql');
      } catch {
        setSqlText('-- Error loading supabase/schema.sql');
      }
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(sqlText);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setCopiedSql(true);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    if (!title.trim()) {
      setErrorMessage('Please enter a market question.');
      return;
    }
    setIsBusy(true);
    try {
      await onCreateMarket({
        title: title.trim(),
        category,
        closesAt,
        startingYesProbability: startingProb,
        resolutionRules,
      });
      setTitle('');
      setStatusMessage('Event published live to the Up & Down feed!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create market');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResolveClick = async (
    marketId: number,
    resolution: 'YES' | 'NO' | 'CANCEL'
  ) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onResolveMarket(marketId, resolution);
      setStatusMessage(
        resolution === 'CANCEL'
          ? 'Market cancelled & 100% of invested stakes refunded.'
          : `Market resolved ${resolution}! Winning shares settled at ₹100 per share (Shares Held × ₹100).`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Resolution failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetHandle.trim()) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      if (onUpdateGranularPermissions) {
        await onUpdateGranularPermissions(targetHandle.trim(), {
          isCommunityApproved: inviteCommunity,
          canCreateEvents:
            inviteCreateEvents ||
            targetRole === 'creator' ||
            targetRole === 'admin',
          hasPaymentAndTradingAccess: invitePayments,
        });
      }
      await onPromoteUser(targetHandle.trim(), targetRole);
      setStatusMessage(
        `Updated @${targetHandle
          .trim()
          .replace(/^@+/, '')} with granular RBAC permissions & role ${targetRole.toUpperCase()}!`
      );
      setTargetHandle('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update permissions');
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuickApprove = async (identifier: string, role: UserRole) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onPromoteUser(identifier, role);
      setStatusMessage(
        role === 'user'
          ? `Updated @${identifier} back to regular Member.`
          : `Approved @${identifier} as ${role.toUpperCase()}! They can now create events.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update role');
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuickRealMoneyStatus = async (
    identifier: string,
    status: RealMoneyAccessStatus
  ) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onApproveRealMoney(identifier, status);
      setStatusMessage(
        status === 'approved'
          ? `Approved @${identifier} for Real Money (₹ UPI) Wallet & Trading!`
          : `Updated @${identifier}'s Real Money UPI status to ${status.toUpperCase()}.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update Real Money UPI status');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTogglePermission = async (
    identifier: string,
    patch: {
      isCommunityApproved?: boolean;
      canCreateEvents?: boolean;
      hasPaymentAndTradingAccess?: boolean;
    }
  ) => {
    if (!onUpdateGranularPermissions) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onUpdateGranularPermissions(identifier, patch);
      setStatusMessage(`Updated granular permissions for @${identifier}!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not update permission');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDepositDecision = async (
    tx: WalletTransactionItem,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    if (!onReviewDeposit) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onReviewDeposit(tx.id, decision);
      setStatusMessage(
        decision === 'APPROVED'
          ? `Approved ₹${tx.amountInr.toLocaleString('en-IN')} deposit (UTR: ${
              tx.utrNumber
            }) for @${tx.username}! Instant wallet credit completed.`
          : `Rejected deposit request (UTR: ${tx.utrNumber}) from @${tx.username}.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not review deposit');
    } finally {
      setIsBusy(false);
    }
  };

  const handleWithdrawalDecision = async (
    tx: WalletTransactionItem,
    decision: 'COMPLETED' | 'REJECTED'
  ) => {
    if (!onReviewWithdrawal) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onReviewWithdrawal(tx.id, decision);
      setStatusMessage(
        decision === 'COMPLETED'
          ? `Marked ₹${tx.amountInr.toLocaleString(
              'en-IN'
            )} withdrawal to ${tx.upiId} (@${tx.username}) as COMPLETED!`
          : `Rejected withdrawal and refunded ₹${tx.amountInr.toLocaleString(
              'en-IN'
            )} to @${tx.username}'s wallet.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not review withdrawal');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {statusMessage && (
        <div
          data-testid="account-status-banner"
          className="p-3.5 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/40 text-xs font-semibold text-emerald-200"
        >
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div
          data-testid="account-error-banner"
          className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-200"
        >
          {errorMessage}
        </div>
      )}

      {/* 1. PROFILE & CUSTOM USER ID (@USERNAME) SETTINGS */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/40 flex items-center justify-center text-[#10B981] font-extrabold text-base shrink-0">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-base font-bold text-white truncate">
                  @{user.username}
                </h2>
                <span
                  data-testid="account-role-badge"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase ${
                    isOwner
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                      : isAdmin
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : canCreate
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : user.role === 'pending_creator'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {isOwner
                    ? 'OWNER & SUPER ADMIN'
                    : user.role === 'admin'
                    ? 'APPROVED ADMIN'
                    : canCreate
                    ? 'EVENT CREATOR'
                    : user.role === 'pending_creator'
                    ? 'PENDING APPROVAL'
                    : 'MEMBER'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {user.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="min-h-[36px] px-3 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-rose-300 flex items-center gap-1.5 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Custom User ID & College Editor Form */}
        <form
          onSubmit={handleSaveProfile}
          className="p-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <AtSign className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Custom User ID &amp; Campus Profile</span>
            </span>
            <span className="text-[11px] text-slate-400">
              Choose any available ID
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="account-custom-userid"
                className="block text-[11px] font-medium text-slate-400 mb-1"
              >
                Your Custom User ID (@username)
              </label>
              <div className="relative">
                <span className="text-xs text-slate-400 absolute left-3 top-3">
                  @
                </span>
                <input
                  id="account-custom-userid"
                  type="text"
                  required
                  minLength={3}
                  maxLength={24}
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  placeholder="your_custom_id"
                  className="w-full min-h-[40px] pl-7 pr-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white font-semibold focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="account-custom-college"
                className="block text-[11px] font-medium text-slate-400 mb-1"
              >
                College / City Name
              </label>
              <div className="relative">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  id="account-custom-college"
                  type="text"
                  list="account-college-suggestions"
                  required
                  value={customCollege}
                  onChange={(e) => setCustomCollege(e.target.value)}
                  className="w-full min-h-[40px] pl-8 pr-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
                <datalist id="account-college-suggestions">
                  {INDIAN_COLLEGES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSavingProfile}
            className="w-full min-h-[40px] rounded-xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-50"
          >
            {isSavingProfile
              ? 'Saving User ID...'
              : 'Save Custom User ID & Profile'}
          </button>
        </form>
      </div>

      {/* 1B. UPI REAL MONEY WALLET, BET CALCULATOR & INVITE-ONLY HUB */}
      <div
        data-testid="account-upi-wallet-card"
        className="bg-[#131B2E] border border-emerald-500/40 rounded-2xl p-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <IndianRupee className="w-4 h-4 text-emerald-400" />
                <span>Direct UPI Wallet &amp; ₹100 Share Calculator</span>
              </h3>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                  realMoneyEligible
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : user.realMoneyStatus === 'pending'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                }`}
              >
                {isOwner
                  ? 'OWNER · ACTIVE'
                  : realMoneyEligible
                  ? 'APPROVED · LIVE'
                  : user.realMoneyStatus === 'pending'
                  ? 'PENDING OWNER APPROVAL'
                  : 'INVITE ONLY'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              {realMoneyEligible
                ? 'Scan Owner UPI QR, submit 12-digit UTR for instant verification, and trade ₹100-base shares.'
                : `Real Money UPI Wallet & Trading is enabled for the Owner (${OWNER_EMAIL}) and Invite-Only approved users.`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              UPI Balance
            </p>
            <p
              data-testid="account-upi-balance"
              className="text-lg font-extrabold font-mono-tabular text-emerald-400"
            >
              ₹
              {Number(
                user.walletBalanceInr ?? user.realMoneyBalance ?? 0
              ).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="open-upi-wallet-hub-btn"
          onClick={onOpenUpiWallet}
          className={`w-full min-h-[44px] px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
            realMoneyEligible
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
              : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md'
          }`}
        >
          {realMoneyEligible ? (
            <>
              <Calculator className="w-4 h-4" />
              <span>
                Open Direct UPI QR Wallet, Submit UTR &amp; Calculator
              </span>
            </>
          ) : user.realMoneyStatus === 'pending' ? (
            <>
              <Clock className="w-4 h-4" />
              <span>View Pending Invite-Only Status &amp; Bet Calculator</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Fill Invite-Only Form for Real Money UPI Access</span>
            </>
          )}
        </button>
      </div>

      {/* 2. DAILY 100 COIN DROP (STRICTLY 1 TIME PER DAY / 24H COOLDOWN) */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Daily 100 Coin Vault Drop</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Claim 100 Free Virtual Coins strictly{' '}
              <strong className="text-white">once per day</strong> (24-hour
              cooldown).
            </p>
          </div>
          <span className="text-xs font-mono-tabular font-bold text-amber-300 shrink-0">
            +100 Coins / 24h
          </span>
        </div>

        <button
          type="button"
          data-testid="account-daily-claim-btn"
          disabled={isClaimingRefill || !dailyEligibility.canClaim}
          onClick={handleDailyClaimClick}
          className={`w-full min-h-[46px] px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            dailyEligibility.canClaim
              ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
              : 'bg-[#090D16] border border-[#1E293B] text-slate-400 cursor-not-allowed'
          }`}
        >
          {dailyEligibility.canClaim ? (
            <>
              <Sparkles className="w-4 h-4" />
              <span>
                {isClaimingRefill
                  ? 'Claiming +100 Coins...'
                  : 'Claim Today’s +100 Free Coins'}
              </span>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4 text-amber-400" />
              <span>
                Claimed Today · Next +100 Coins in{' '}
                {dailyEligibility.remainingLabel}
              </span>
            </>
          )}
        </button>
      </div>

      {/* 3. REFER A FRIEND (+500 COINS EACH) */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-[#10B981]" />
              <span>Refer a Friend &amp; Earn +500 Coins</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Share your personal referral link. Both you and your friend get{' '}
              <strong className="text-white">+500 Bonus Coins</strong> on
              signup!
            </p>
          </div>
          <span className="text-xs font-mono-tabular font-bold text-[#10B981] shrink-0">
            +500 Coins
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-[#090D16] border border-[#1E293B] flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-slate-300 truncate">
            {referralLink}
          </span>
          <span className="text-[10px] text-emerald-400 font-semibold shrink-0">
            @{user.username}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleCopyReferral}
            className="min-h-[42px] px-3 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            {copiedRef ? (
              <>
                <Check className="w-4 h-4 text-[#10B981]" />
                <span className="text-[#10B981]">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-300" />
                <span>Copy Referral Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShareReferralWhatsApp}
            className="min-h-[42px] px-3 rounded-xl bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-[#10B981] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Share on WhatsApp</span>
          </button>
        </div>
      </div>

      {/* 4. EVENT CREATOR & OWNER ADMIN ACCESS SECTION */}
      {!canCreate ? (
        /* Regular Users Only See Request Creator Access Card — No Admin Studio! */
        <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-sky-400" />
              <span>Want to Host Events &amp; Markets?</span>
            </h3>
            {onRefreshAccount && (
              <button
                type="button"
                onClick={() => {
                  onRefreshAccount().catch(() => {});
                }}
                className="min-h-[30px] px-2.5 rounded-lg bg-[#090D16] border border-[#1E293B] text-[11px] font-semibold text-sky-400 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Status</span>
              </button>
            )}
          </div>

          {user.role === 'pending_creator' ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1.5">
              <p className="font-bold">Approval Pending with Owner</p>
              <p className="text-slate-300 leading-relaxed">
                Your request to create events has been sent to the Owner (
                <strong className="text-white">{OWNER_EMAIL}</strong>). As soon
                as the Owner enables <code className="text-amber-300">can_create_events</code>,
                the Event Creator Studio will unlock right here automatically!
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-400 leading-relaxed">
                By default ONLY the Owner can create events unless the Owner
                explicitly enables <code className="text-sky-300">can_create_events</code>{' '}
                for your account.{' '}
                {hasCreatorInvite
                  ? 'You opened an Owner Invite Link — tap below to submit your account for approval!'
                  : 'Have an invite from the Owner? Request approval below.'}
              </p>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleRequestAccessClick}
                className="w-full min-h-[42px] rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs transition-colors"
              >
                {isBusy
                  ? 'Submitting Request...'
                  : 'Request Event Creator Approval from Owner'}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Approved Creators & Owner/Admin See Event Creation Studio */
        <div
          data-testid="creator-event-studio"
          className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-[#10B981]" />
              <span>Create New Prediction Event (₹100 Base)</span>
            </h3>
            <span className="text-[11px] text-emerald-400 font-semibold">
              {isOwner ? 'Owner Studio' : 'Approved Creator'}
            </span>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="market-title-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Event Question (YES / NO)
              </label>
              <input
                id="market-title-input"
                type="text"
                required
                placeholder="e.g. Will RCB win today's IPL match?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="market-category-select"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Category
                </label>
                <select
                  id="market-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-[#10B981]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="market-closes-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Closing Date &amp; Time
                </label>
                <input
                  id="market-closes-input"
                  type="datetime-local"
                  required
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            {/* Starting Probability Slider */}
            <div className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B]">
              <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                <label
                  htmlFor="starting-prob-slider"
                  className="text-slate-300 truncate"
                >
                  Starting Share Price (YES + NO = ₹100)
                </label>
                <span className="font-mono-tabular font-bold text-[#10B981] whitespace-nowrap shrink-0">
                  YES ₹{startingProb} / NO ₹{100 - startingProb}
                </span>
              </div>
              <input
                id="starting-prob-slider"
                type="range"
                min={10}
                max={90}
                value={startingProb}
                onChange={(e) => setStartingProb(Number(e.target.value))}
                className="w-full accent-[#10B981]"
              />
            </div>

            <div>
              <label
                htmlFor="market-rules-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Resolution Source &amp; Rules Note
              </label>
              <textarea
                id="market-rules-input"
                rows={2}
                value={resolutionRules}
                onChange={(e) => setResolutionRules(e.target.value)}
                className="w-full p-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="w-full min-h-[46px] rounded-xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-50"
            >
              {isBusy ? 'Publishing Event...' : 'Publish Live Prediction Event'}
            </button>
          </form>
        </div>
      )}

      {/* 5. OWNER & ADMIN EXCLUSIVE CONTROLS (ONLY VISIBLE TO OWNER saurabhhkumarr2023@gmail.com OR APPROVED ADMIN) */}
      {isAdmin && (
        <>
          <div
            data-testid="owner-admin-control-center"
            className="bg-[#131B2E] border border-amber-400/40 rounded-2xl p-4 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>
                    Owner Admin Panel: UPI UTR Approvals &amp; Granular RBAC
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Owner Invite Code:{' '}
                  <strong className="font-mono text-amber-300">
                    {DEFAULT_OWNER_INVITE_CODE}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSqlSchema}
                className="min-h-[34px] px-2.5 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-[11px] font-semibold text-emerald-400 flex items-center gap-1 shrink-0"
              >
                <Database className="w-3 h-3" />
                <span>SQL</span>
              </button>
            </div>

            {/* SECTION 0: OWNER MAIN RECEIVING UPI ID & SELF-BUILT IN-APP INVITE CODE SYSTEM */}
            <div
              data-testid="owner-main-upi-config-box"
              className="p-3 rounded-xl bg-[#090D16] border border-amber-400/35 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Owner Main Receiving UPI ID (All User Payments Go Here)
                  </span>
                </p>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-mono font-bold text-emerald-300">
                  {ownerUpiId}
                </span>
              </div>

              {onUpdateOwnerUpi && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setErrorMessage(null);
                    setStatusMessage(null);
                    setIsBusy(true);
                    try {
                      await onUpdateOwnerUpi(ownerUpiInput);
                      setStatusMessage(
                        `Updated Owner Main Receiving UPI ID to ${ownerUpiInput}! All user deposits now go to this UPI ID.`
                      );
                    } catch (err: any) {
                      setErrorMessage(
                        err.message || 'Could not update Owner Main UPI ID'
                      );
                    } finally {
                      setIsBusy(false);
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    required
                    value={ownerUpiInput}
                    onChange={(e) => setOwnerUpiInput(e.target.value)}
                    placeholder="9931802215@fam or saurabh@okaxis"
                    className="flex-1 min-h-[36px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs font-mono font-bold text-white"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="min-h-[36px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shrink-0"
                  >
                    Save My UPI ID
                  </button>
                </form>
              )}

              {/* Self-Built In-App Invite Code System */}
              <div
                data-testid="owner-inapp-invite-codes-box"
                className="pt-2 border-t border-[#1E293B] space-y-2"
              >
                <p className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>Self-Built In-App Invite Codes</span>
                  <span className="text-[10px] text-emerald-400">
                    Unlocks Community + Real ₹ UPI
                  </span>
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {(inAppInviteCodes.length > 0
                    ? inAppInviteCodes
                    : [
                        {
                          code: 'UPDOWN2026',
                          label: 'Community + Real ₹ UPI Trading',
                          isCommunityApproved: true,
                          canCreateEvents: false,
                          hasPaymentAndTradingAccess: true,
                        },
                        {
                          code: 'SAURABHVIP',
                          label: 'Full VIP (Community + Real ₹ UPI + Creator)',
                          isCommunityApproved: true,
                          canCreateEvents: true,
                          hasPaymentAndTradingAccess: true,
                        },
                      ]
                  ).map((ic) => (
                    <button
                      key={ic.code}
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(ic.code).catch(() => {});
                        setStatusMessage(
                          `Copied In-App Invite Code ${ic.code} (${ic.label})!`
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#131B2E] border border-emerald-500/40 text-[11px] font-mono font-bold text-emerald-300 hover:bg-emerald-500/15"
                    >
                      {ic.code} · Copy
                    </button>
                  ))}
                </div>

                {onCreateInviteCode && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setErrorMessage(null);
                      setStatusMessage(null);
                      setIsBusy(true);
                      try {
                        await onCreateInviteCode({
                          customCode: newInviteCodeInput || undefined,
                          label: newInviteCodeLabel,
                          isCommunityApproved: true,
                          canCreateEvents: inviteCreateEvents,
                          hasPaymentAndTradingAccess: true,
                        });
                        setNewInviteCodeInput('');
                        setStatusMessage(
                          'Generated new self-system In-App Invite Code!'
                        );
                      } catch (err: any) {
                        setErrorMessage(
                          err.message || 'Could not generate invite code'
                        );
                      } finally {
                        setIsBusy(false);
                      }
                    }}
                    className="flex items-center gap-2 pt-1"
                  >
                    <input
                      type="text"
                      value={newInviteCodeInput}
                      onChange={(e) =>
                        setNewInviteCodeInput(e.target.value.toUpperCase())
                      }
                      placeholder="Custom code (e.g. CAMPUSVIP) or leave blank"
                      className="flex-1 min-h-[36px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs font-mono text-white uppercase"
                    />
                    <button
                      type="submit"
                      disabled={isBusy}
                      data-testid="generate-inapp-invite-code-btn"
                      className="min-h-[36px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shrink-0"
                    >
                      + Create Code
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* SECTION A: OWNER UPI DEPOSITS & UTR AUDIT QUEUE */}
            <div
              data-testid="owner-pending-deposits-section"
              className="p-3 rounded-xl bg-[#090D16] border border-emerald-500/40 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    1. Owner UPI Deposits ({pendingUpiDeposits.length})
                  </span>
                </p>
                <span className="text-[10px] text-slate-400">
                  Paid to {ownerUpiId}
                </span>
              </div>

              {pendingUpiDeposits.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No UPI deposits recorded yet. When any user adds funds to your
                  Main UPI ID ({ownerUpiId}), the amount is credited to their
                  wallet and appears here.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {pendingUpiDeposits.map((dep) => (
                    <div
                      key={dep.id}
                      data-testid={`admin-pending-deposit-row-${dep.id}`}
                      className="p-2.5 rounded-xl bg-[#131B2E] border border-emerald-500/30 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">
                          @{dep.username} ·{' '}
                          <span className="text-emerald-400 font-mono-tabular">
                            +₹{dep.amountInr.toLocaleString('en-IN')}
                          </span>{' '}
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                            {dep.status}
                          </span>
                        </p>
                        <p className="text-[11px] font-mono text-amber-300">
                          UTR: {dep.utrNumber}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          To Owner UPI: {dep.upiId || ownerUpiId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {dep.status === 'PENDING' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            data-testid={`approve-deposit-btn-${dep.id}`}
                            onClick={() =>
                              handleDepositDecision(dep, 'APPROVED')
                            }
                            className="min-h-[34px] px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-[11px]"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          data-testid={`reject-deposit-btn-${dep.id}`}
                          onClick={() => handleDepositDecision(dep, 'REJECTED')}
                          className="min-h-[34px] px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-[11px]"
                        >
                          {dep.status === 'APPROVED' ? 'Reverse' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION B: PENDING UPI WITHDRAWAL PAYOUT REQUESTS */}
            <div
              data-testid="owner-pending-withdrawals-section"
              className="p-3 rounded-xl bg-[#090D16] border border-sky-500/40 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-sky-300">
                  2. Pending UPI Withdrawal Payout Requests (
                  {pendingUpiWithdrawals.length})
                </p>
                <span className="text-[10px] text-slate-400">
                  Manual UPI Payout
                </span>
              </div>

              {pendingUpiWithdrawals.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No pending withdrawal requests right now.
                </p>
              ) : (
                <div className="space-y-2">
                  {pendingUpiWithdrawals.map((wtx) => (
                    <div
                      key={wtx.id}
                      data-testid={`admin-pending-withdrawal-row-${wtx.id}`}
                      className="p-2.5 rounded-xl bg-[#131B2E] border border-sky-500/30 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">
                          @{wtx.username} ·{' '}
                          <span className="text-sky-300 font-mono-tabular">
                            ₹{Math.abs(wtx.amountInr).toLocaleString('en-IN')}
                          </span>
                        </p>
                        <p className="text-[11px] font-mono text-emerald-300 truncate">
                          Send to UPI: {wtx.upiId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          data-testid={`complete-withdrawal-btn-${wtx.id}`}
                          onClick={() =>
                            handleWithdrawalDecision(wtx, 'COMPLETED')
                          }
                          className="min-h-[34px] px-2.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold text-[11px]"
                        >
                          Mark Completed
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleWithdrawalDecision(wtx, 'REJECTED')
                          }
                          className="min-h-[34px] px-2 rounded-lg bg-rose-500/20 text-rose-300 font-bold text-[11px]"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Share Invite Link */}
            <div className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-2">
              <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  3. Share Invite Link (Code: {DEFAULT_OWNER_INVITE_CODE})
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyCreatorInvite}
                  className="min-h-[38px] px-3 rounded-xl bg-[#131B2E] hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                >
                  {copiedInvite ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#10B981]" />
                      <span className="text-[#10B981]">Invite Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-400" />
                      <span>Copy Invite Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleShareCreatorInviteWhatsApp}
                  className="min-h-[38px] px-3 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Send on WhatsApp</span>
                </button>
              </div>
            </div>

            {/* Pending Creator & Real-Money Applications */}
            {(pendingRequests.length > 0 ||
              pendingRealMoneyRequests.length > 0) && (
              <div className="space-y-2">
                {pendingRequests.map((reqUser) => (
                  <div
                    key={reqUser.id}
                    className="p-3 rounded-xl bg-[#090D16] border border-amber-400/40 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        @{reqUser.username} (Creator Request)
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {reqUser.email || reqUser.collegeName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleQuickApprove(reqUser.username, 'creator')
                        }
                        className="min-h-[34px] px-2.5 rounded-lg bg-[#10B981] text-slate-950 font-bold text-[11px]"
                      >
                        Approve Creator
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleQuickApprove(reqUser.username, 'user')
                        }
                        className="min-h-[34px] px-2 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}

                {pendingRealMoneyRequests.map((reqUser) => (
                  <div
                    key={`rm-${reqUser.id}`}
                    data-testid={`pending-real-money-row-${reqUser.username}`}
                    className="p-3 rounded-xl bg-[#090D16] border border-emerald-500/40 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        @{reqUser.username} ·{' '}
                        <span className="text-emerald-400">
                          {reqUser.upiId || 'No UPI ID'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-300 truncate">
                        {reqUser.realMoneyInviteNote || reqUser.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        data-testid={`approve-real-money-btn-${reqUser.username}`}
                        onClick={() =>
                          handleQuickRealMoneyStatus(
                            reqUser.username,
                            'approved'
                          )
                        }
                        className="min-h-[34px] px-2.5 rounded-lg bg-emerald-500 text-slate-950 font-extrabold text-[11px]"
                      >
                        Approve ₹ UPI
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          handleQuickRealMoneyStatus(
                            reqUser.username,
                            'rejected'
                          )
                        }
                        className="min-h-[34px] px-2 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SECTION C: INVITE OR PRE-APPROVE ANY USER WITH GRANULAR RBAC PERMISSIONS */}
            <form
              onSubmit={handlePromoteSubmit}
              className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-2.5"
            >
              <label
                htmlFor="owner-approve-input"
                className="block text-xs font-bold text-slate-200"
              >
                4. Invite / Whitelist User by Email, @username, or Phone:
              </label>
              <input
                id="owner-approve-input"
                type="text"
                required
                placeholder="Enter @username or email (e.g. friend@gmail.com or kabir_vit)"
                value={targetHandle}
                onChange={(e) => setTargetHandle(e.target.value)}
                className="w-full min-h-[38px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />

              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <label className="flex items-center gap-1.5 p-2 rounded-lg bg-[#131B2E] border border-[#1E293B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inviteCommunity}
                    onChange={(e) => setInviteCommunity(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Community</span>
                </label>
                <label className="flex items-center gap-1.5 p-2 rounded-lg bg-[#131B2E] border border-[#1E293B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inviteCreateEvents}
                    onChange={(e) => setInviteCreateEvents(e.target.checked)}
                    className="accent-sky-400"
                  />
                  <span>Create Events</span>
                </label>
                <label className="flex items-center gap-1.5 p-2 rounded-lg bg-[#131B2E] border border-[#1E293B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invitePayments}
                    onChange={(e) => setInvitePayments(e.target.checked)}
                    className="accent-amber-400"
                  />
                  <span>₹ UPI Trading</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Select role to grant"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as UserRole)}
                  className="min-h-[38px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white"
                >
                  <option value="user">Role: Member</option>
                  <option value="creator">Role: Event Creator</option>
                  <option value="admin">Role: Admin</option>
                </select>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
                >
                  Save RBAC &amp; Invite
                </button>
              </div>
            </form>

            {/* SECTION D: GRANULAR RBAC USER DIRECTORY (3 PERMISSION TOGGLES PER USER) */}
            <div className="pt-2 border-t border-[#1E293B] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-200">
                  5. Granular RBAC User Directory ({predictors.length} Users)
                </p>
                <span className="text-[10px] text-slate-400">
                  Toggle 3 Permissions
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                <input
                  type="search"
                  aria-label="Filter users to approve"
                  placeholder="Search registered users by @username or email..."
                  value={userSearchFilter}
                  onChange={(e) => setUserSearchFilter(e.target.value)}
                  className="w-full min-h-[36px] pl-8 pr-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
                />
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                {predictors
                  .filter((member) => {
                    if (!userSearchFilter.trim()) return true;
                    const q = userSearchFilter.trim().toLowerCase();
                    return (
                      member.username.toLowerCase().includes(q) ||
                      (member.email &&
                        member.email.toLowerCase().includes(q)) ||
                      member.collegeName.toLowerCase().includes(q)
                    );
                  })
                  .map((member) => {
                    const memberIsOwner = isOwnerEmail(member.email);
                    const commApproved =
                      memberIsOwner || Boolean(member.isCommunityApproved);
                    const createApproved =
                      memberIsOwner ||
                      Boolean(member.canCreateEvents) ||
                      member.role === 'creator' ||
                      member.role === 'admin';
                    const payApproved =
                      memberIsOwner ||
                      Boolean(member.hasPaymentAndTradingAccess) ||
                      member.realMoneyStatus === 'approved';

                    return (
                      <div
                        key={member.id}
                        data-testid={`user-directory-row-${member.username}`}
                        className="p-2.5 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-bold text-white truncate">
                              @{member.username}
                            </span>{' '}
                            <span className="text-[11px] text-slate-400">
                              ({member.email || member.collegeName})
                            </span>
                          </div>
                          <span className="font-mono-tabular text-[11px] text-emerald-400 shrink-0">
                            ₹
                            {Number(
                              member.walletBalanceInr ??
                                member.realMoneyBalance ??
                                0
                            ).toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* 3 Granular Permission Toggle Buttons */}
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy || memberIsOwner}
                            data-testid={`rbac-community-${member.username}`}
                            onClick={() =>
                              handleTogglePermission(member.username, {
                                isCommunityApproved: !commApproved,
                              })
                            }
                            className={`min-h-[30px] px-2 rounded-lg font-bold text-[10px] border transition-colors ${
                              commApproved
                                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                            }`}
                          >
                            {commApproved
                              ? '1. Community: ON'
                              : '1. Community: OFF'}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy || memberIsOwner}
                            data-testid={`rbac-events-${member.username}`}
                            onClick={() =>
                              handleTogglePermission(member.username, {
                                canCreateEvents: !createApproved,
                              })
                            }
                            className={`min-h-[30px] px-2 rounded-lg font-bold text-[10px] border transition-colors ${
                              createApproved
                                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            {createApproved
                              ? '2. Events: ON'
                              : '2. Events: OFF'}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy || memberIsOwner}
                            data-testid={` dir-grant-upi-${member.username}`}
                            onClick={() =>
                              handleTogglePermission(member.username, {
                                hasPaymentAndTradingAccess: !payApproved,
                              })
                            }
                            className={`min-h-[30px] px-2 rounded-lg font-bold text-[10px] border transition-colors ${
                              payApproved
                                ? 'bg-amber-400/20 border-amber-400/40 text-amber-300'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            {payApproved
                              ? '3. ₹ UPI Trade: ON'
                              : '3. ₹ UPI Trade: OFF'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Market Resolution Engine (Owner & Approved Admins Only) */}
          <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>
                  Final Event Settlement Engine ({openMarkets.length} Open)
                </span>
              </h3>
              <span className="text-[11px] text-amber-300 font-semibold">
                ₹100 / Winning Share
              </span>
            </div>

            <p className="text-xs text-slate-400">
              Resolving an event as YES or NO settles winning shares at{' '}
              <strong className="text-white">
                ₹100 per share (Shares Held × ₹100)
              </strong>{' '}
              and losing shares at ₹0, automatically crediting winners&apos;
              wallets.
            </p>

            <div className="space-y-2.5">
              {openMarkets.map((m) => {
                const { yesPrice, noPrice } = calculateMarketPrices(
                  m.yesPool,
                  m.noPool
                );
                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-white leading-snug">
                        {m.title}
                      </p>
                      <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                        YES ₹{yesPrice} / NO ₹{noPrice}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolveClick(m.id, 'YES')}
                        className="min-h-[38px] px-2 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-[#10B981] font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolve YES</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolveClick(m.id, 'NO')}
                        className="min-h-[38px] px-2 rounded-lg bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 border border-[#F43F5E]/40 text-[#F43F5E] font-bold text-xs flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Resolve NO</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResolveClick(m.id, 'CANCEL')}
                        className="min-h-[38px] px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Refund</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 6. POLYMARKET-STYLE ACCOUNT SETTINGS & SIGN OUT */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Account Preferences &amp; Security</span>
        </h3>

        <div className="divide-y divide-[#1E293B] text-xs">
          {onToggleTheme && (
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-200">
                  Color Theme (Light / Dark)
                </p>
                <p className="text-[11px] text-slate-400">
                  Switch between Polymarket Daylight &amp; Midnight themes
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleTheme}
                className="min-h-[34px] px-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-emerald-400 font-semibold flex items-center gap-1.5"
              >
                {themeMode === 'light' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light Theme</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-sky-400" />
                    <span>Dark Theme</span>
                  </>
                )}
              </button>
            </div>
          )}

          <div className="py-2.5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-200">Odds Display Format</p>
              <p className="text-[11px] text-slate-400">
                Show market prices as % probability or ₹ Share Price
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setOddsFormat((prev) =>
                  prev === 'percent' ? 'coins' : 'percent'
                )
              }
              className="min-h-[34px] px-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-emerald-400 font-semibold"
            >
              {oddsFormat === 'percent'
                ? 'Probability (%) / ₹'
                : 'Virtual Coins'}
            </button>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-200">
                Post-Trade Story Flex Card
              </p>
              <p className="text-[11px] text-slate-400">
                Open shareable card after placing a prediction
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInstantFlexPopup((prev) => !prev)}
              className={`min-h-[34px] px-3 rounded-xl border font-semibold ${
                instantFlexPopup
                  ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#10B981]'
                  : 'bg-[#090D16] border-[#1E293B] text-slate-400'
              }`}
            >
              {instantFlexPopup ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="w-full min-h-[44px] rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of @{user.username}</span>
        </button>
      </div>

      {/* Modal for viewing/copying supabase/schema.sql */}
      {showSqlModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sql-modal-title"
        >
          <div className="w-full max-w-[430px] max-h-[85vh] bg-[#131B2E] border border-[#1E293B] rounded-3xl p-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div>
                <h3
                  id="sql-modal-title"
                  className="text-sm font-bold text-white"
                >
                  supabase/schema.sql
                </h3>
                <p className="text-[11px] text-slate-400">
                  Complete PostgreSQL Schema, RPCs &amp; Audit Ledger
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="min-h-[36px] px-3 rounded-xl bg-[#10B981] text-slate-950 font-bold text-xs flex items-center gap-1"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy SQL</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSqlModal(false)}
                  className="min-h-[36px] px-3 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <pre className="mt-3 p-3 rounded-xl bg-[#090D16] border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-auto flex-1 leading-relaxed">
              {sqlText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
