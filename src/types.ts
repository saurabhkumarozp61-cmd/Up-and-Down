import { TradeSide, RealMoneyAccessStatus, WalletMode } from './utils/marketMath';

export type MarketCategory =
  | 'All'
  | 'Cricket & Sports'
  | 'Campus Gossip'
  | 'Pop-Culture & Creators'
  | 'Tech & Finance';

export type UserRole = 'user' | 'pending_creator' | 'creator' | 'admin';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  username: string;
  collegeName: string;
  coinBalance: number;
  realMoneyBalance: number;
  walletBalanceInr: number;
  realMoneyStatus: RealMoneyAccessStatus;
  upiId?: string | null;
  realMoneyInviteNote?: string | null;
  role: UserRole;
  // Granular Owner RBAC Permissions
  isCommunityApproved: boolean;
  canCreateEvents: boolean;
  hasPaymentAndTradingAccess: boolean;
  inviteCodeUsed?: string | null;
  referredBy?: string | null;
  lastDailyClaim?: string | null;
  winsCount: number;
  resolvedCount: number;
  createdAt?: string;
}

export interface MarketItem {
  id: number;
  title: string;
  category: string;
  resolutionRules: string;
  status: 'open' | 'resolved' | 'cancelled';
  outcome: 'YES' | 'NO' | null;
  yesPool: number;
  noPool: number;
  totalVolume: number;
  closesAt: string;
  createdBy?: number | null;
  creatorUsername: string;
  createdAt: string;
}

export interface PositionItem {
  id: number;
  userId: number;
  marketId: number;
  side: TradeSide;
  walletType?: WalletMode;
  shares: number;          // Settlement value integer (round(sharesQuantity * 100))
  sharesQuantity: number;  // Exact fractional shares held (Investment / Price)
  investedCoins: number;
  investedAmount: number;
  entryPrice: number;
  exitPrice?: number | null;
  realizedPnl: number;
  exitedEarly: boolean;
  settled: boolean;
  payoutCoins: number;
  createdAt: string;
  marketTitle: string;
  marketCategory: string;
  marketStatus: 'open' | 'resolved' | 'cancelled';
  marketOutcome: 'YES' | 'NO' | null;
  marketYesPool?: number;
  marketNoPool?: number;
  currentPrice: number;
  currentValue: number;    // Estimated executable exit value after pool impact
  unrealizedPnl: number;   // currentValue - investedAmount
  unrealizedPnlPercent: number;
  potentialPayout: number; // Final settlement payout if side wins = sharesQuantity * ₹100
}

export interface WalletTransactionItem {
  id: number;
  userId: number;
  username: string;
  userEmail: string;
  marketId?: number | null;
  type:
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'TRADE_BUY'
    | 'TRADE_SELL'
    | 'EVENT_SETTLEMENT_WIN'
    | 'EVENT_REFUND';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  amountInr: number;
  utrNumber?: string | null;
  upiId?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
  notes: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface TransactionItem {
  id: number;
  userId: number;
  marketId?: number | null;
  type:
    | 'SIGNUP_BONUS'
    | 'REFERRAL_BONUS'
    | 'DAILY_REFILL'
    | 'TRADE_BUY'
    | 'TRADE_SELL'
    | 'MARKET_PAYOUT'
    | 'MARKET_REFUND'
    | 'REAL_DEPOSIT_UPI'
    | 'REAL_WITHDRAW_UPI'
    | 'REAL_TRADE_BUY'
    | 'REAL_TRADE_SELL'
    | 'REAL_MARKET_PAYOUT'
    | 'REAL_MARKET_REFUND';
  amount: number;
  description: string;
  createdAt: string;
}

export interface FlexCardData {
  marketId: number;
  marketTitle: string;
  category: string;
  side: TradeSide;
  entryOdds: number;
  investedCoins: number;
  potentialPayout: number;
  returnPercentage: number;
  username: string;
  collegeName: string;
  isResolvedWin?: boolean;
}

export const INDIAN_COLLEGES = [
  'IIT Bombay',
  'IIT Delhi',
  'IIT Madras',
  'IIT Kanpur',
  'IIT Kharagpur',
  'DU North Campus (SRCC)',
  'DU South Campus (LSR)',
  'BITS Pilani',
  'NIT Trichy',
  'NIT Surathkal',
  'VIT Vellore',
  'Manipal (MIT)',
  'Amity University Noida',
  'LPU Jalandhar',
  'Christ University Bengaluru',
  'Patna University',
  'IIM Ahmedabad',
  'Jadavpur University',
];
