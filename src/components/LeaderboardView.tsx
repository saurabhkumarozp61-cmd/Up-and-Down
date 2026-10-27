import React, { useState, useMemo } from 'react';
import { Trophy, GraduationCap, Users, Medal } from 'lucide-react';
import {
  LeaderboardEntryInput,
  rankPredictors,
  aggregateCollegeWars,
} from '../utils/marketMath.ts';

interface LeaderboardViewProps {
  predictors: LeaderboardEntryInput[];
  currentUsername?: string;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  predictors,
  currentUsername,
}) => {
  const [subTab, setSubTab] = useState<'predictors' | 'colleges'>('predictors');

  const rankedUsers = useMemo(() => rankPredictors(predictors), [predictors]);
  const rankedColleges = useMemo(
    () => aggregateCollegeWars(predictors),
    [predictors]
  );

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>National Campus Standings</span>
          </h2>
          <span className="text-xs text-slate-400 font-mono-tabular">
            {rankedUsers.length} Predictors
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Ranked by Total Net Worth (Available Virtual Coins + Active Portfolio Value)
        </p>

        {/* Sub-Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#090D16] rounded-xl border border-[#1E293B] mt-3.5">
          <button
            type="button"
            onClick={() => setSubTab('predictors')}
            className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              subTab === 'predictors'
                ? 'bg-[#131B2E] text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Medal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Top Predictors</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('colleges')}
            className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              subTab === 'colleges'
                ? 'bg-[#131B2E] text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
            <span>College Wars</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Top Predictors */}
      {subTab === 'predictors' ? (
        <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl divide-y divide-[#1E293B] overflow-hidden">
          {rankedUsers.map((user) => {
            const isCurrentUser =
              currentUsername &&
              user.username.toLowerCase() === currentUsername.toLowerCase();

            return (
              <div
                key={user.id}
                className={`p-3.5 flex items-center justify-between gap-3 ${
                  isCurrentUser ? 'bg-emerald-500/10' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg font-mono-tabular text-xs font-bold flex items-center justify-center shrink-0 ${
                      user.rank === 1
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : user.rank === 2
                        ? 'bg-slate-300/20 text-slate-200 border border-slate-400/40'
                        : user.rank === 3
                        ? 'bg-amber-700/25 text-amber-400 border border-amber-600/40'
                        : 'bg-[#090D16] text-slate-400 border border-slate-800'
                    }`}
                  >
                    #{user.rank}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-white truncate">
                        @{user.username}
                      </p>
                      {isCurrentUser && (
                        <span className="text-[11px] text-[#10B981] font-medium">
                          · You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {user.collegeName} · {user.winRate}% Win Rate
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono-tabular text-[#10B981]">
                    {user.netWorth.toLocaleString()} Coins
                  </p>
                  <p className="text-[11px] font-mono-tabular text-slate-400">
                    {user.coinBalance.toLocaleString()} Cash ·{' '}
                    {user.activePortfolioValue.toLocaleString()} Active
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tab 2: College Wars */
        <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl divide-y divide-[#1E293B] overflow-hidden">
          {rankedColleges.map((college) => (
            <div
              key={college.collegeName}
              className="p-4 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl font-mono-tabular text-xs font-bold flex items-center justify-center shrink-0 ${
                    college.rank === 1
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                      : college.rank === 2
                      ? 'bg-slate-300/20 text-slate-200 border border-slate-400/40'
                      : college.rank === 3
                      ? 'bg-amber-700/25 text-amber-400 border border-amber-600/40'
                      : 'bg-[#090D16] text-slate-400 border border-slate-800'
                  }`}
                >
                  #{college.rank}
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {college.collegeName}
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                    <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      {college.activePredictors} Predictor
                      {college.activePredictors > 1 ? 's' : ''} · MVP @
                      {college.topPredictor}
                    </span>
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-bold font-mono-tabular text-amber-300">
                  {college.totalNetWorth.toLocaleString()} Coins
                </p>
                <p className="text-[11px] font-mono-tabular text-slate-400">
                  Avg Win Rate {college.avgWinRate}%
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
