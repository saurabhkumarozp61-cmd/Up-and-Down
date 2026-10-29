export interface PredictorProfileSummary {
  id: string | number;
  username: string;
  collegeName: string;
  coinBalance: number;
  activePortfolioValue: number;
  winsCount: number;
  resolvedCount: number;
}

/**
 * Public predictor responses expose only virtual-game standings. Sensitive
 * profile, payment, and wallet fields are returned separately to owner sessions.
 */
export function buildPredictorPayload<T extends PredictorProfileSummary>(
  profiles: T[],
  includeAdminPredictors = false
) {
  const predictors = profiles.map((profile) => ({
    id: String(profile.id),
    username: profile.username,
    collegeName: profile.collegeName,
    coinBalance: profile.coinBalance,
    activePortfolioValue: profile.activePortfolioValue,
    winsCount: profile.winsCount,
    resolvedCount: profile.resolvedCount,
  }));

  return {
    predictors,
    ...(includeAdminPredictors ? { adminPredictors: profiles } : {}),
  };
}
