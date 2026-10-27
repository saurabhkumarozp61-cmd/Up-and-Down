import { TradeSide } from './utils/marketMath';

export type MarketCategory =
  | 'All'
  | 'Cricket & Sports'
  | 'Campus Gossip'
  | 'Pop-Culture & Creators'
  | 'Tech & Finance';

export type UserRole = 'user' | 'creator' | 'admin';

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  username: string;
  collegeName: string;
  coinBalance: number;
  role: UserRole;
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
  shares: number;
  investedCoins: number;
  entryPrice: number;
  settled: boolean;
  payoutCoins: number;
  createdAt: string;
  marketTitle: string;
  marketCategory: string;
  marketStatus: 'open' | 'resolved' | 'cancelled';
  marketOutcome: 'YES' | 'NO' | null;
  currentPrice: number;
  currentValue: number;
  potentialPayout: number;
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
    | 'MARKET_PAYOUT'
    | 'MARKET_REFUND';
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
