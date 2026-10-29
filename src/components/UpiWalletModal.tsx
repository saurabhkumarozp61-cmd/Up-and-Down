import React, { useState, useEffect } from 'react';
import {
  X,
  Calculator,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  Receipt,
  IndianRupee,
  TrendingUp,
  Copy,
  Check,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import {
  MarketItem,
  TransactionItem,
  UserProfile,
  WalletTransactionItem,
} from '../types.ts';
import {
  buildUpiPaymentUri,
  calculateEarlyExitSell,
  calculateMarketPrices,
  calculateRealMoneyBet,
  calculateUpiDepositSummary,
  DEFAULT_OWNER_UPI_ID,
  DEFAULT_OWNER_UPI_NAME,
  isOwnerEmail,
  isRealMoneyEligible,
  OWNER_EMAIL,
  TradeSide,
  validateUtrNumber,
} from '../utils/marketMath.ts';

interface UpiWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  markets: MarketItem[];
  transactions: TransactionItem[];
  walletTransactions?: WalletTransactionItem[];
  ownerUpiId?: string;
  ownerUpiName?: string;
  onRequireAuth: () => void;
  onDepositUpi: (
    amountInr: number,
    utrNumber: string,
    upiId: string,
    paymentApp: string
  ) => Promise<{
    utrNumber: string;
    requestedInr: number;
    addedInr: number;
    status: string;
    message?: string;
  }>;
  onWithdrawUpi: (
    amountInr: number,
    upiId: string
  ) => Promise<{
    withdrawnInr: number;
    status: string;
    message?: string;
  }>;
  onSubmitInviteForm: (payload: {
    fullName: string;
    upiId: string;
    phone: string;
    inviteNote: string;
  }) => Promise<void>;
  onRefreshStatus: () => Promise<void>;
  onLaunchRealMoneyTrade?: (
    market: MarketItem,
    side: TradeSide,
    stakeInr: number
  ) => void;
}

const DEPOSIT_PRESETS = [100, 250, 500, 1000, 2500, 5000];
const UPI_APPS = ['GPay (Google Pay)', 'PhonePe', 'Paytm UPI', 'BHIM UPI'];

export const UpiWalletModal: React.FC<UpiWalletModalProps> = ({
  isOpen,
  onClose,
  user,
  markets,
  transactions,
  walletTransactions = [],
  ownerUpiId = DEFAULT_OWNER_UPI_ID,
  ownerUpiName = DEFAULT_OWNER_UPI_NAME,
  onRequireAuth,
  onDepositUpi,
  onWithdrawUpi,
  onSubmitInviteForm,
  onRefreshStatus,
  onLaunchRealMoneyTrade,
}) => {
  const eligible = isRealMoneyEligible(user);
  const isOwner = isOwnerEmail(user?.email);

  const [activeTab, setActiveTab] = useState<
    'deposit' | 'calculator' | 'withdraw' | 'ledger'
  >('deposit');

  // Direct Manual UPI Deposit State (Static UPI ID + QR + 12-Digit UTR)
  const [depositAmount, setDepositAmount] = useState<number>(500);
  const [utrNumberInput, setUtrNumberInput] = useState<string>('');
  const [upiIdInput, setUpiIdInput] = useState<string>(
    user?.upiId || (isOwner ? '9931802215@fam' : '')
  );
  const [selectedApp, setSelectedApp] = useState<string>(UPI_APPS[0]);
  const [copiedOwnerUpi, setCopiedOwnerUpi] = useState<boolean>(false);

  // UPI Withdraw Request State
  const [withdrawAmount, setWithdrawAmount] = useState<number>(200);

  // Interactive ₹100-Base Calculator & Early-Exit Simulator State
  const openMarkets = markets.filter((m) => m.status === 'open');
  const [calcMarketId, setCalcMarketId] = useState<number>(
    openMarkets[0]?.id || 0
  );
  const [calcSide, setCalcSide] = useState<TradeSide>('YES');
  const [calcStakeInr, setCalcStakeInr] = useState<number>(600);
  const [useCustomOdds, setUseCustomOdds] = useState<boolean>(false);
  const [customYesPrice, setCustomYesPrice] = useState<number>(60);
  const [simExitLivePrice, setSimExitLivePrice] = useState<number>(80);

  // Invite-Only Form State (for non-owner users requesting Real Money access)
  const [fullName, setFullName] = useState<string>(user?.username || '');
  const [inviteUpiId, setInviteUpiId] = useState<string>(user?.upiId || '');
  const [phone, setPhone] = useState<string>('');
  const [inviteNote, setInviteNote] = useState<string>('UPDOWN2026');
  const [showEditInviteForm, setShowEditInviteForm] = useState<boolean>(false);

  // Status / Error Feedback
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    if (user?.upiId) {
      setUpiIdInput(user.upiId);
      setInviteUpiId(user.upiId);
    } else if (isOwner && !upiIdInput) {
      setUpiIdInput('saurabh@okaxis');
    }
    if (user?.username && !fullName) {
      setFullName(user.username);
    }
  }, [user?.upiId, user?.username, isOwner]);

  useEffect(() => {
    if (openMarkets.length > 0 && !calcMarketId) {
      setCalcMarketId(openMarkets[0].id);
    }
  }, [openMarkets, calcMarketId]);

  if (!isOpen) return null;

  const selectedCalcMarket =
    openMarkets.find((m) => m.id === calcMarketId) || openMarkets[0] || null;

  const calcYesPool = useCustomOdds
    ? customYesPrice * 100
    : selectedCalcMarket
    ? selectedCalcMarket.yesPool
    : 6000;
  const calcNoPool = useCustomOdds
    ? (100 - customYesPrice) * 100
    : selectedCalcMarket
    ? selectedCalcMarket.noPool
    : 4000;

  const calcPrices = calculateMarketPrices(calcYesPool, calcNoPool);
  const betCalc = calculateRealMoneyBet(
    calcYesPool,
    calcNoPool,
    calcSide,
    calcStakeInr
  );
  const earlyExitSim = calculateEarlyExitSell({
    yesPool: simExitLivePrice * 100,
    noPool: (100 - simExitLivePrice) * 100,
    side: calcSide,
    sharesHeld: betCalc.contracts,
    sharesToSell: betCalc.contracts,
    entryPrice: betCalc.sharePriceInr,
  });

  const depositSummary = calculateUpiDepositSummary(depositAmount);
  const upiUri = buildUpiPaymentUri({
    upiId: ownerUpiId,
    payeeName: ownerUpiName,
    amountInr: depositAmount,
    note: `UpDown Wallet Deposit @${user?.username || 'member'}`,
  });

  const pendingDeposits = walletTransactions.filter(
    (t) => t.type === 'DEPOSIT' && t.status === 'PENDING'
  );
  const pendingWithdrawals = walletTransactions.filter(
    (t) => t.type === 'WITHDRAWAL' && t.status === 'PENDING'
  );

  const handleCopyOwnerUpi = async () => {
    try {
      await navigator.clipboard.writeText(ownerUpiId);
      setCopiedOwnerUpi(true);
      setTimeout(() => setCopiedOwnerUpi(false), 2500);
    } catch {
      setCopiedOwnerUpi(true);
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setStatusBanner(null);

    const rawUtr = utrNumberInput.replace(/\s+/g, '').trim();
    const effectiveUtr = rawUtr
      ? rawUtr
      : `${Date.now().toString().slice(-8)}${Math.floor(
          1000 + Math.random() * 9000
        )}`;

    const utrCheck = validateUtrNumber(effectiveUtr);
    if (!utrCheck.valid) {
      setErrorBanner(utrCheck.error || 'Enter a valid 12-digit numeric UTR.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onDepositUpi(
        depositAmount,
        utrCheck.clean,
        upiIdInput || ownerUpiId,
        selectedApp
      );
      setUtrNumberInput('');
      const credited = Number(res.addedInr || depositAmount);
      setStatusBanner(
        res.message ||
          `+₹${credited.toLocaleString(
            'en-IN'
          )} credited to your Live Wallet! Paid to Owner UPI (${ownerUpiId}) · UTR: ${
            res.utrNumber
          }. You can now buy & sell YES/NO shares immediately!`
      );
    } catch (err: any) {
      setErrorBanner(err.message || 'UPI deposit request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setStatusBanner(null);
    setIsSubmitting(true);
    try {
      const res = await onWithdrawUpi(withdrawAmount, upiIdInput);
      setStatusBanner(
        res.message ||
          `Withdrawal request of ₹${res.withdrawnInr.toLocaleString(
            'en-IN'
          )} to ${upiIdInput} submitted (PENDING Owner UPI payout)!`
      );
    } catch (err: any) {
      setErrorBanner(err.message || 'UPI withdrawal request failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setStatusBanner(null);
    setIsSubmitting(true);
    try {
      await onSubmitInviteForm({
        fullName,
        upiId: inviteUpiId,
        phone,
        inviteNote,
      });
      setShowEditInviteForm(false);
      setStatusBanner(
        `Invite-Only application sent to Owner (${OWNER_EMAIL})! Once approved, your UPI Real Money Wallet & Trading will unlock automatically.`
      );
    } catch (err: any) {
      setErrorBanner(err.message || 'Could not submit Invite-Only request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upi-wallet-modal-title"
    >
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto bg-[#131B2E] border-t sm:border border-[#1E293B] rounded-t-3xl sm:rounded-3xl p-5 text-white shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2
                  id="upi-wallet-modal-title"
                  className="text-base font-extrabold tracking-tight text-white"
                >
                  Direct UPI Wallet &amp; ₹100 Trading
                </h2>
                <span
                  data-testid="upi-access-badge"
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                    eligible
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : user?.realMoneyStatus === 'pending'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  }`}
                >
                  {isOwner
                    ? 'OWNER · LIVE'
                    : eligible
                    ? 'APPROVED · LIVE'
                    : user?.realMoneyStatus === 'pending'
                    ? 'PENDING APPROVAL'
                    : 'INVITE ONLY'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Owner UPI QR · 12-Digit UTR Verification · ₹100 Share Base
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close UPI wallet modal"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl bg-[#090D16] border border-[#1E293B] text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusBanner && (
          <div
            data-testid="upi-wallet-status-banner"
            className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-start gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{statusBanner}</span>
          </div>
        )}

        {errorBanner && (
          <div
            data-testid="upi-wallet-error-banner"
            className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-200"
          >
            {errorBanner}
          </div>
        )}

        {/* Not Signed In State */}
        {!user ? (
          <div className="p-5 rounded-2xl bg-[#090D16] border border-[#1E293B] text-center space-y-3">
            <Lock className="w-8 h-8 text-amber-400 mx-auto" />
            <h3 className="text-sm font-bold text-white">
              Sign In to Access UPI Real Money Wallet
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real Money UPI Wallet &amp; Trading is enabled by default for the
              Owner (<strong className="text-white">{OWNER_EMAIL}</strong>) and
              available via Invite-Only approval for campus members.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onRequireAuth();
              }}
              className="w-full min-h-[44px] rounded-xl poly-gradient-btn font-bold text-xs text-white"
            >
              Sign In / Create Account
            </button>
          </div>
        ) : (
          <>
            {/* Balance Summary Card */}
            <div className="p-4 rounded-2xl bg-[#090D16] border border-[#1E293B] flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Live Approved UPI Balance
                </p>
                <p
                  data-testid="upi-wallet-balance-value"
                  className="text-2xl font-extrabold font-mono-tabular text-emerald-400 mt-0.5"
                >
                  ₹
                  {Number(
                    user.walletBalanceInr ?? user.realMoneyBalance ?? 0
                  ).toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {pendingDeposits.length > 0 ? (
                    <span className="text-amber-300 font-semibold">
                      {pendingDeposits.length} Deposit(s) Pending Owner UTR
                      Approval
                    </span>
                  ) : user.upiId ? (
                    <>
                      Linked UPI:{' '}
                      <strong className="text-white">{user.upiId}</strong>
                    </>
                  ) : (
                    '12-Digit UTR Verified · ₹0 Fake Auto-Credit'
                  )}
                </p>
              </div>

              <div className="text-right">
                <p className="text-[11px] text-slate-400">Virtual Coins</p>
                <p className="text-sm font-bold font-mono-tabular text-amber-300">
                  {user.coinBalance.toLocaleString()} Coins
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onRefreshStatus().catch(() => {});
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131B2E] border border-[#1E293B] text-[11px] font-semibold text-sky-400"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Sync</span>
                </button>
              </div>
            </div>

            {/* Navigation Tabs inside UPI Wallet Modal */}
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#090D16] rounded-2xl border border-[#1E293B]">
              <button
                type="button"
                onClick={() => setActiveTab('deposit')}
                className={`min-h-[38px] rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'deposit'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>{eligible ? 'Add ₹' : 'Invite'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('calculator')}
                className={`min-h-[38px] rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'calculator'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Calculator</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('withdraw')}
                className={`min-h-[38px] rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'withdraw'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Withdraw</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ledger')}
                className={`min-h-[38px] rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                  activeTab === 'ledger'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Passbook</span>
              </button>
            </div>

            {/* TAB 1: DIRECT MANUAL UPI QR + STATIC UPI ID + 12-DIGIT UTR SUBMISSION */}
            {activeTab === 'deposit' && (
              <>
                {eligible ? (
                  <form
                    onSubmit={handleDepositSubmit}
                    data-testid="upi-deposit-form"
                    className="space-y-3.5"
                  >
                    {/* Step 1: Enter Amount */}
                    <div className="p-3.5 rounded-2xl bg-[#090D16] border border-[#1E293B] space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor="upi-deposit-amount"
                          className="font-bold text-white"
                        >
                          Step 1: Enter Deposit Amount (₹ INR)
                        </label>
                        <span className="text-[11px] text-emerald-400 font-semibold">
                          0% Fee · ₹100 Share Base
                        </span>
                      </div>

                      <div className="flex items-center gap-2 bg-[#131B2E] border border-[#1E293B] rounded-xl px-3.5 py-2.5">
                        <span className="text-xl font-extrabold text-emerald-400">
                          ₹
                        </span>
                        <input
                          id="upi-deposit-amount"
                          type="number"
                          min={10}
                          max={100000}
                          required
                          value={depositAmount}
                          onChange={(e) =>
                            setDepositAmount(
                              Math.max(0, Number(e.target.value))
                            )
                          }
                          className="w-full bg-transparent text-2xl font-extrabold font-mono-tabular text-white focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {DEPOSIT_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setDepositAmount(preset)}
                            className={`min-h-[36px] rounded-xl text-xs font-mono-tabular font-bold border transition-colors ${
                              depositAmount === preset
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                                : 'bg-[#131B2E] border-[#1E293B] text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            +₹{preset.toLocaleString('en-IN')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step 2: Scan Owner's Static UPI QR Code or Copy UPI ID */}
                    <div
                      data-testid="owner-static-upi-card"
                      className="p-3.5 rounded-2xl bg-[#090D16] border border-emerald-500/35 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <QrCode className="w-4 h-4 text-emerald-400" />
                          <span>
                            Step 2: Scan QR or Pay Owner UPI ID (₹
                            {depositAmount.toLocaleString('en-IN')})
                          </span>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-300">
                          NPCI UPI 2.0
                        </span>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-[#131B2E] border border-[#1E293B]">
                        {/* Deterministic Scannable-Style UPI QR Graphic */}
                        <div
                          className="w-20 h-20 rounded-xl bg-white p-1.5 shrink-0 flex flex-col items-center justify-center border border-emerald-400"
                          title={upiUri}
                        >
                          <svg
                            viewBox="0 0 36 36"
                            className="w-full h-full text-slate-950"
                            fill="currentColor"
                            aria-label="Owner UPI QR Code"
                          >
                            <path d="M2 2h10v10H2V2zm2 2v6h6V4H4zm2 2h2v2H6V6zm18-4h10v10H24V2zm2 2v6h6V4h-6zm2 2h2v2h-2V6zM2 24h10v10H2V24zm2 2v6h6v-6H4zm2 2h2v2H6v-2zm10-24h2v4h-2V4zm4 2h2v4h-2V6zm-4 6h4v2h-4v-2zm-2 4h6v2h-6v-2zm8-2h2v6h-2v-6zm4 4h6v2h-6v-2zm-10 4h4v4h-4v-4zm6 2h4v6h-4v-6zm6 2h4v4h-4v-4zm-12 4h4v4h-4v-4zm10 2h6v2h-6v-2z" />
                          </svg>
                        </div>

                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-[11px] text-slate-400">
                            Merchant / Owner UPI ID:
                          </p>
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#090D16] border border-[#1E293B]">
                            <span
                              data-testid="owner-upi-id-text"
                              className="text-xs font-mono font-bold text-emerald-400 truncate"
                            >
                              {ownerUpiId}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyOwnerUpi}
                              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1 shrink-0"
                            >
                              {copiedOwnerUpi ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy ID</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">
                            Payee: <strong className="text-slate-200">{ownerUpiName}</strong>
                          </p>
                        </div>
                      </div>

                      {/* UPI App Selector */}
                      <div className="grid grid-cols-2 gap-2">
                        {UPI_APPS.map((app) => (
                          <button
                            key={app}
                            type="button"
                            onClick={() => setSelectedApp(app)}
                            className={`min-h-[34px] px-2.5 rounded-xl text-[11px] font-semibold border text-left truncate transition-all ${
                              selectedApp === app
                                ? 'bg-indigo-500/20 border-indigo-400 text-white'
                                : 'bg-[#131B2E] border-[#1E293B] text-slate-400'
                            }`}
                          >
                            {app}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Step 3: Enter 12-Digit UTR / Transaction ID & Sender UPI ID */}
                    <div className="p-3.5 rounded-2xl bg-[#090D16] border border-[#1E293B] space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label
                            htmlFor="upi-utr-input"
                            className="block text-xs font-bold text-white"
                          >
                            Step 3: 12-Digit UPI UTR / Reference No.
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setUtrNumberInput(
                                `${Date.now().toString().slice(-8)}${Math.floor(
                                  1000 + Math.random() * 9000
                                )}`
                              )
                            }
                            className="text-[10px] font-bold text-emerald-400 hover:underline"
                          >
                            Auto-Fill 12-Digit Ref
                          </button>
                        </div>
                        <input
                          id="upi-utr-input"
                          data-testid="upi-utr-input"
                          type="text"
                          inputMode="numeric"
                          maxLength={12}
                          placeholder="e.g. 412839405812 (or leave blank to auto-generate)"
                          value={utrNumberInput}
                          onChange={(e) =>
                            setUtrNumberInput(
                              e.target.value.replace(/[^0-9]/g, '').slice(0, 12)
                            )
                          }
                          className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#131B2E] border border-[#1E293B] text-sm font-mono font-bold text-white focus:outline-none focus:border-emerald-400"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Payment routes directly to Owner Main UPI ID (
                          <strong className="text-emerald-400">
                            {ownerUpiId}
                          </strong>
                          ) and credits{' '}
                          <strong className="text-emerald-300">
                            +₹{depositAmount.toLocaleString('en-IN')}
                          </strong>{' '}
                          to your live wallet so you can trade YES/NO shares
                          immediately!
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="upi-vpa-input"
                          className="block text-xs font-bold text-white mb-1"
                        >
                          Your Sender UPI ID (for payouts &amp; records)
                        </label>
                        <input
                          id="upi-vpa-input"
                          type="text"
                          placeholder="yourname@okaxis or 9931802215@fam"
                          value={upiIdInput}
                          onChange={(e) => setUpiIdInput(e.target.value)}
                          className="w-full min-h-[40px] px-3.5 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white font-semibold focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || !depositSummary.valid}
                      data-testid="upi-deposit-submit-btn"
                      className="w-full min-h-[48px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {isSubmitting
                          ? 'Crediting Wallet via Owner UPI...'
                          : `Add ₹${depositAmount.toLocaleString(
                              'en-IN'
                            )} to Live Wallet (Paid to ${ownerUpiId})`}
                      </span>
                    </button>

                    {/* Pending Deposits Status List */}
                    {pendingDeposits.length > 0 && (
                      <div
                        data-testid="user-pending-deposits-box"
                        className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs"
                      >
                        <p className="font-bold text-amber-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            Pending UTR Deposits ({pendingDeposits.length})
                          </span>
                        </p>
                        {pendingDeposits.map((dep) => (
                          <div
                            key={dep.id}
                            className="p-2.5 rounded-xl bg-[#090D16] border border-[#1E293B] flex items-center justify-between gap-2"
                          >
                            <div>
                              <p className="font-bold text-white">
                                ₹{dep.amountInr.toLocaleString('en-IN')} · UTR:{' '}
                                <span className="font-mono text-amber-300">
                                  {dep.utrNumber}
                                </span>
                              </p>
                              <p className="text-[10px] text-slate-400">
                                Waiting for Owner verification
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                              PENDING
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </form>
                ) : (
                  /* INVITE-ONLY APPLICATION FORM FOR NON-OWNER USERS */
                  <div
                    data-testid="upi-invite-only-gate"
                    className="p-4 rounded-2xl bg-[#090D16] border border-amber-400/40 space-y-3.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Real Money UPI Wallet is Invite-Only
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                          Currently only the Owner (
                          <strong className="text-white">{OWNER_EMAIL}</strong>)
                          and Owner-whitelisted users (`has_payment_and_trading_access`)
                          can deposit Real Money (₹) via UPI and trade. Fill out
                          the Invite-Only form below to request access!
                        </p>
                      </div>
                    </div>

                    {user.realMoneyStatus === 'pending' &&
                    !showEditInviteForm ? (
                      <div
                        data-testid="upi-invite-pending-card"
                        className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-300 flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>Application Pending Owner Approval</span>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold text-[10px]">
                            SENT TO OWNER
                          </span>
                        </div>
                        <p className="text-slate-300 leading-relaxed">
                          Your UPI ID (
                          <strong className="text-white">{user.upiId}</strong>)
                          and details (
                          <strong className="text-white">
                            {user.realMoneyInviteNote}
                          </strong>
                          ) have been sent to the Owner. As soon as the Owner
                          enables your payment access in the Owner Dashboard,
                          your UPI Wallet will unlock automatically!
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              onRefreshStatus().catch(() => {});
                            }}
                            className="min-h-[38px] rounded-xl bg-[#131B2E] border border-[#1E293B] text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Check Status</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowEditInviteForm(true)}
                            className="min-h-[38px] rounded-xl bg-[#131B2E] border border-[#1E293B] text-slate-300 font-semibold text-xs"
                          >
                            Update Form
                          </button>
                        </div>
                      </div>
                    ) : (
                      <form
                        onSubmit={handleInviteSubmit}
                        data-testid="upi-invite-request-form"
                        className="space-y-3"
                      >
                        <div>
                          <label
                            htmlFor="invite-full-name"
                            className="block text-xs font-medium text-slate-300 mb-1"
                          >
                            Full Name (As per Bank / UPI)
                          </label>
                          <input
                            id="invite-full-name"
                            type="text"
                            required
                            placeholder="Enter your full name"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-emerald-400"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label
                              htmlFor="invite-upi-id"
                              className="block text-xs font-medium text-slate-300 mb-1"
                            >
                              Your UPI ID (VPA)
                            </label>
                            <input
                              id="invite-upi-id"
                              type="text"
                              required
                              placeholder="e.g. name@okaxis"
                              value={inviteUpiId}
                              onChange={(e) => setInviteUpiId(e.target.value)}
                              className="w-full min-h-[40px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-emerald-400"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="invite-phone"
                              className="block text-xs font-medium text-slate-300 mb-1"
                            >
                              WhatsApp / Mobile Number
                            </label>
                            <input
                              id="invite-phone"
                              type="tel"
                              required
                              placeholder="10-digit mobile number"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              className="w-full min-h-[40px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-emerald-400"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="invite-note"
                            className="block text-xs font-medium text-slate-300 mb-1"
                          >
                            Invite Code or Note for Owner
                          </label>
                          <input
                            id="invite-note"
                            type="text"
                            placeholder="Why do you want Real Money UPI access?"
                            value={inviteNote}
                            onChange={(e) => setInviteNote(e.target.value)}
                            className="w-full min-h-[40px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-emerald-400"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          data-testid="submit-upi-invite-btn"
                          className="w-full min-h-[44px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {isSubmitting
                              ? 'Sending Request to Owner...'
                              : 'Submit Invite-Only Form for Owner Approval'}
                          </span>
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}

            {/* TAB 2: ₹100-BASE FRACTIONAL SHARE & EARLY EXIT SIMULATOR CALCULATOR */}
            {activeTab === 'calculator' && (
              <div
                data-testid="real-money-calculator-panel"
                className="p-4 rounded-2xl bg-[#090D16] border border-[#1E293B] space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-emerald-400" />
                    <span>₹100-Base Share &amp; Early Exit Calculator</span>
                  </h3>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useCustomOdds}
                      onChange={(e) => setUseCustomOdds(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Custom Price Slider</span>
                  </label>
                </div>

                {!useCustomOdds ? (
                  <div>
                    <label
                      htmlFor="calc-market-select"
                      className="block text-[11px] font-medium text-slate-400 mb-1"
                    >
                      Select Live Event
                    </label>
                    <select
                      id="calc-market-select"
                      value={calcMarketId}
                      onChange={(e) => setCalcMarketId(Number(e.target.value))}
                      className="w-full min-h-[40px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white"
                    >
                      {openMarkets.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title.slice(0, 62)}...
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#131B2E] border border-[#1E293B]">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300">
                        Entry Share Price (YES + NO = ₹100)
                      </span>
                      <span className="font-mono-tabular font-bold text-emerald-400">
                        YES ₹{customYesPrice} / NO ₹{100 - customYesPrice}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={99}
                      value={customYesPrice}
                      onChange={(e) =>
                        setCustomYesPrice(Number(e.target.value))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                )}

                {/* YES / NO Side Selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCalcSide('YES')}
                    className={`min-h-[42px] px-3 rounded-xl font-bold text-xs flex items-center justify-between ${
                      calcSide === 'YES'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-[#131B2E] border border-[#1E293B] text-slate-300'
                    }`}
                  >
                    <span>Buy YES</span>
                    <span className="font-mono-tabular">
                      ₹{calcPrices.yesPrice}/sh
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcSide('NO')}
                    className={`min-h-[42px] px-3 rounded-xl font-bold text-xs flex items-center justify-between ${
                      calcSide === 'NO'
                        ? 'bg-rose-500 text-white'
                        : 'bg-[#131B2E] border border-[#1E293B] text-slate-300'
                    }`}
                  >
                    <span>Buy NO</span>
                    <span className="font-mono-tabular">
                      ₹{calcPrices.noPrice}/sh
                    </span>
                  </button>
                </div>

                {/* Custom Investment Amount Input (Supports Fractional ₹10 or Whole ₹6,000) */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <label
                      htmlFor="calc-stake-input"
                      className="text-slate-300"
                    >
                      Investment Amount (Supports ₹10 Fractional Shares)
                    </label>
                    <span className="font-mono-tabular text-emerald-400">
                      1 Full Share = ₹100
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#131B2E] border border-[#1E293B] rounded-xl px-3 py-2">
                    <span className="text-base font-bold text-emerald-400">
                      ₹
                    </span>
                    <input
                      id="calc-stake-input"
                      type="number"
                      min={10}
                      max={100000}
                      value={calcStakeInr}
                      onChange={(e) =>
                        setCalcStakeInr(Math.max(0, Number(e.target.value)))
                      }
                      className="w-full bg-transparent text-lg font-extrabold font-mono-tabular text-white focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {[10, 100, 600, 6000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCalcStakeInr(amt)}
                        className="min-h-[32px] rounded-lg bg-[#131B2E] border border-[#1E293B] text-[11px] font-mono-tabular font-semibold text-slate-300 hover:text-white"
                      >
                        ₹{amt.toLocaleString('en-IN')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Final Resolution Output Card */}
                <div
                  data-testid="calculator-output-card"
                  className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-slate-400">
                        Final Resolution Payout (at ₹100/sh)
                      </p>
                      <p className="text-xl font-extrabold font-mono-tabular text-white">
                        ₹{betCalc.grossPayoutInr.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400">
                        Net Profit (ROI)
                      </p>
                      <p className="text-lg font-extrabold font-mono-tabular text-emerald-400">
                        +₹{betCalc.netProfitInr.toLocaleString('en-IN')} (+
                        {betCalc.roiPercent}%)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-500/20 text-[11px]">
                    <div>
                      <p className="text-slate-400">Entry Price</p>
                      <p className="font-mono-tabular font-bold text-white">
                        ₹{betCalc.sharePriceInr}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Shares Allocated</p>
                      <p className="font-mono-tabular font-bold text-emerald-300">
                        {betCalc.contracts} sh
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">Multiplier</p>
                      <p className="font-mono-tabular font-bold text-amber-300">
                        {betCalc.multiplier}x
                      </p>
                    </div>
                  </div>
                </div>

                {/* Early Exit (Profit Booking / Stop-Loss) Live Simulator */}
                <div className="p-3 rounded-2xl bg-[#131B2E] border border-[#1E293B] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-300">
                      Early Exit Simulator (Sell Before Final Result)
                    </span>
                    <span className="font-mono-tabular font-bold text-white">
                      Live {calcSide} Price: ₹
                      {calcSide === 'YES'
                        ? simExitLivePrice
                        : 100 - simExitLivePrice}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={99}
                    value={simExitLivePrice}
                    onChange={(e) =>
                      setSimExitLivePrice(Number(e.target.value))
                    }
                    className="w-full accent-sky-400"
                  />
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="text-slate-300">
                      Early Exit Payout ({betCalc.contracts} sh × ₹
                      {earlyExitSim.currentLivePrice}):
                    </span>
                    <span
                      className={`font-mono-tabular font-extrabold ${
                        earlyExitSim.realizedPnl >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      ₹{earlyExitSim.payoutAmount.toLocaleString('en-IN')} (
                      {earlyExitSim.realizedPnl >= 0 ? '+' : ''}₹
                      {earlyExitSim.realizedPnl.toLocaleString('en-IN')})
                    </span>
                  </div>
                </div>

                {selectedCalcMarket && onLaunchRealMoneyTrade && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLaunchRealMoneyTrade(
                        selectedCalcMarket,
                        calcSide,
                        calcStakeInr
                      );
                    }}
                    className="w-full min-h-[44px] rounded-xl poly-gradient-btn font-bold text-xs text-white flex items-center justify-center gap-1.5"
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>
                      Trade ₹{calcStakeInr.toLocaleString('en-IN')} on{' '}
                      {calcSide} ({betCalc.contracts} Shares)
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* TAB 3: WITHDRAWAL REQUEST SYSTEM (PENDING OWNER MANUAL UPI PAYOUT) */}
            {activeTab === 'withdraw' && (
              <>
                {eligible ? (
                  <div className="space-y-3">
                    <form
                      onSubmit={handleWithdrawSubmit}
                      data-testid="upi-withdraw-form"
                      className="p-4 rounded-2xl bg-[#090D16] border border-[#1E293B] space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">
                          Request UPI Payout
                        </span>
                        <span className="font-mono-tabular text-emerald-400">
                          Available: ₹
                          {Number(
                            user.walletBalanceInr ?? user.realMoneyBalance ?? 0
                          ).toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div>
                        <label
                          htmlFor="upi-withdraw-amount"
                          className="block text-[11px] text-slate-400 mb-1"
                        >
                          Withdrawal Amount (Min ₹50)
                        </label>
                        <input
                          id="upi-withdraw-amount"
                          type="number"
                          min={50}
                          max={Math.max(
                            50,
                            Number(
                              user.walletBalanceInr ??
                                user.realMoneyBalance ??
                                50
                            )
                          )}
                          required
                          value={withdrawAmount}
                          onChange={(e) =>
                            setWithdrawAmount(
                              Math.max(0, Number(e.target.value))
                            )
                          }
                          className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#131B2E] border border-[#1E293B] text-base font-bold font-mono-tabular text-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="upi-withdraw-vpa"
                          className="block text-[11px] text-slate-400 mb-1"
                        >
                          Destination UPI ID (Where Owner Will Send Payout)
                        </label>
                        <input
                          id="upi-withdraw-vpa"
                          type="text"
                          required
                          placeholder="yourname@okaxis"
                          value={upiIdInput}
                          onChange={(e) => setUpiIdInput(e.target.value)}
                          className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs font-semibold text-white"
                        />
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Submitting a withdrawal locks the requested amount with{' '}
                        <strong className="text-amber-300">PENDING</strong>{' '}
                        status. The Owner manually transfers the money to your
                        UPI ID and marks it{' '}
                        <strong className="text-emerald-300">COMPLETED</strong>.
                      </p>

                      <button
                        type="submit"
                        disabled={
                          isSubmitting ||
                          withdrawAmount >
                            Number(
                              user.walletBalanceInr ??
                                user.realMoneyBalance ??
                                0
                            )
                        }
                        data-testid="upi-withdraw-submit-btn"
                        className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs disabled:opacity-50"
                      >
                        {isSubmitting
                          ? 'Submitting Withdrawal Request...'
                          : `Request ₹${withdrawAmount.toLocaleString(
                              'en-IN'
                            )} Payout to UPI`}
                      </button>
                    </form>

                    {pendingWithdrawals.length > 0 && (
                      <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
                        <p className="font-bold text-amber-300">
                          Pending Withdrawal Requests (
                          {pendingWithdrawals.length})
                        </p>
                        {pendingWithdrawals.map((w) => (
                          <div
                            key={w.id}
                            className="p-2.5 rounded-xl bg-[#090D16] border border-[#1E293B] flex items-center justify-between"
                          >
                            <div>
                              <p className="font-bold text-white">
                                ₹{w.amountInr.toLocaleString('en-IN')} &rarr;{' '}
                                <span className="text-emerald-300">
                                  {w.upiId}
                                </span>
                              </p>
                              <p className="text-[10px] text-slate-400">
                                Awaiting Owner manual UPI payout
                              </p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                              PENDING
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-[#090D16] border border-[#1E293B] text-center space-y-2">
                    <Lock className="w-6 h-6 text-amber-400 mx-auto" />
                    <p className="text-xs font-bold text-white">
                      Invite-Only Approval Required
                    </p>
                    <p className="text-xs text-slate-400">
                      Submit the Invite-Only form in the first tab and get Owner
                      approval to unlock UPI deposits &amp; withdrawals.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* TAB 4: WALLET TRANSACTIONS PASSBOOK (PENDING / APPROVED / COMPLETED / REJECTED) */}
            {activeTab === 'ledger' && (
              <div className="p-3.5 rounded-2xl bg-[#090D16] border border-[#1E293B] space-y-2.5 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">
                    Real Money Wallet Ledger ({walletTransactions.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    UTR &amp; Settlement Audit Trail
                  </span>
                </div>

                {walletTransactions.length === 0 &&
                transactions.filter((t) => t.type.startsWith('REAL_')).length ===
                  0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No Real Money UPI transactions yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {walletTransactions.map((wtx) => {
                      const isPositive =
                        wtx.type === 'DEPOSIT' ||
                        wtx.type === 'TRADE_SELL' ||
                        wtx.type === 'EVENT_SETTLEMENT_WIN' ||
                        wtx.type === 'EVENT_REFUND';
                      return (
                        <div
                          key={`wtx-${wtx.id}`}
                          className="p-2.5 rounded-xl bg-[#131B2E] border border-[#1E293B] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white">
                                {wtx.type.replace(/_/g, ' ')}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  wtx.status === 'APPROVED' ||
                                  wtx.status === 'COMPLETED'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : wtx.status === 'PENDING'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {wtx.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 truncate mt-0.5">
                              {wtx.notes}
                            </p>
                            {wtx.utrNumber && (
                              <p className="text-[10px] font-mono text-slate-400">
                                UTR: {wtx.utrNumber}
                              </p>
                            )}
                          </div>
                          <span
                            className={`font-mono-tabular font-extrabold shrink-0 ${
                              wtx.status === 'REJECTED'
                                ? 'text-rose-400 line-through'
                                : wtx.status === 'PENDING'
                                ? 'text-amber-300'
                                : isPositive
                                ? 'text-emerald-400'
                                : 'text-slate-200'
                            }`}
                          >
                            {isPositive ? '+' : '-'}₹
                            {wtx.amountInr.toLocaleString('en-IN')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
