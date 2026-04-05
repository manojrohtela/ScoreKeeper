import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Upload, MessageSquare, RefreshCw, FileDown,
  CheckCircle2, AlertCircle, ImagePlus, Send,
  Medal, Crown, ChevronUp, ChevronDown, Loader2,
  Lock, KeyRound, Eye, EyeOff, ShieldCheck, Pencil, LineChart as LineChartIcon, Sparkles,
  SlidersHorizontal, ArrowUpRight, ArrowDownRight,
  Trash2, RotateCcw, X,
} from 'lucide-react';
import {
  getStandings, verifyCode, changeCode,
  extractFromImage, confirmUpload, sendChat, exportXlsx,
  listMatches, getMatch, updateMatch, deleteMatch, resetData,
} from './lib/api';
import { APP_LIMITS, APP_TEXT, CHAT_INTENTS } from './lib/constants';
import type {
  AdminMatchPlayer, ChatMessage, ExtractedPlayer, StandingsResponse,
} from './lib/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
function rankBadge(rank: number) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-500" />;
  return <span className="text-slate-500 text-sm w-4 text-center">{rank}</span>;
}

const PLAYER_EMOJIS = ['🎮', '🦊', '🐸', '🤖', '🦄', '🐙', '⚡', '🥷'];
const GRAPH_PALETTE = ['#818cf8', '#34d399', '#f59e0b', '#f472b6', '#38bdf8', '#c084fc', '#fb7185', '#facc15'];

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function playerEmoji(username: string) {
  return PLAYER_EMOJIS[hashString(username) % PLAYER_EMOJIS.length];
}

const SIMULATION_RANGE = 500;

type ForecastPlayer = StandingsResponse['players'][number] & {
  delta: number;
  projectedTotal: number;
  projectedRank: number;
  rankDelta: number;
};

function formatDelta(delta: number) {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function buildForecastPlayers(players: StandingsResponse['players'], deltas: Record<string, number>): ForecastPlayer[] {
  const projectedTotals = players.map((player) => ({
    ...player,
    delta: deltas[player.username] ?? 0,
    projectedTotal: player.total + (deltas[player.username] ?? 0),
  }));

  const sorted = [...projectedTotals].sort((a, b) => {
    if (b.projectedTotal !== a.projectedTotal) return b.projectedTotal - a.projectedTotal;
    if (a.total !== b.total) return b.total - a.total;
    return a.username.localeCompare(b.username);
  });

  const projectedRankByUsername: Record<string, number> = {};
  let currentRank = 0;
  let previousValue: number | null = null;

  sorted.forEach((player, index) => {
    if (previousValue === null || player.projectedTotal !== previousValue) currentRank = index + 1;
    projectedRankByUsername[player.username] = currentRank;
    previousValue = player.projectedTotal;
  });

  return projectedTotals
    .map((player) => {
      const projectedRank = projectedRankByUsername[player.username];
      return {
        ...player,
        projectedRank,
        rankDelta: player.rank - projectedRank,
      };
    })
    .sort((a, b) => a.projectedRank - b.projectedRank || a.rank - b.rank);
}

function ProjectedTotalsChart({ players }: { players: ForecastPlayer[] }) {
  const maxTotal = Math.max(...players.map((player) => player.projectedTotal), 1);

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
      <div className="border-b border-slate-700/50 bg-slate-800/60 px-4 py-3">
        <h3 className="text-sm font-medium text-slate-200">{APP_TEXT.simulator.chartTitle}</h3>
        <p className="text-xs text-slate-500">A quick visual read of who is ahead right now.</p>
      </div>
      <div className="space-y-2 px-4 py-4">
        {players.map((player, index) => {
          const barWidth = `${Math.max((player.projectedTotal / maxTotal) * 100, 8)}%`;
          return (
            <motion.div
              key={player.username}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.04 }}
              className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-300 mb-1">
                  <span className="truncate">{player.display_name}</span>
                  <span className={`font-medium ${player.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatDelta(player.delta)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: barWidth }}
                    transition={{ duration: 0.45, delay: 0.05 + index * 0.04 }}
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400"
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-white">{player.projectedTotal}</div>
                <div className="text-[11px] text-slate-500">#{player.projectedRank}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
function Leaderboard({ data, onRefresh, loading }: {
  data: StandingsResponse | null; onRefresh: () => void; loading: boolean;
}) {
  const [sortAsc, setSortAsc] = useState(false);
  const players = data
    ? [...data.players].sort((a, b) => sortAsc ? a.total - b.total : b.total - a.total)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" /> {APP_TEXT.leaderboard.title}
        </h2>
        <div className="flex items-center gap-3">
          <a href={exportXlsx()} download="scores.xlsx"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
            <FileDown className="w-3.5 h-3.5" /> {APP_TEXT.leaderboard.export}
          </a>
          <button onClick={() => setSortAsc(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            {APP_TEXT.leaderboard.total} {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button onClick={onRefresh} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="text-center py-16 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />{APP_TEXT.leaderboard.loading}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60">
                <th className="px-3 py-3 text-left text-slate-400 font-medium w-8">#</th>
<th className="px-3 py-3 text-left text-slate-400 font-medium">Player</th>
<th className="px-3 py-3 text-center text-white font-semibold">Total</th>
{data.match_headers.map(m => (
  <th key={m} className="px-3 py-3 text-center text-slate-400 font-medium whitespace-nowrap">{m}</th>
))}
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <motion.tr key={p.username}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${p.rank === 1 ? 'bg-yellow-500/5' : ''}`}>
                  <td className="px-3 py-3"><div className="flex justify-center">{rankBadge(p.rank)}</div></td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-white leading-tight">{p.display_name}</div>
                    <div className="text-xs text-slate-500">@{p.username}</div>
                  </td>
                  <td className="px-3 py-3 text-center">
  <span className={`font-bold text-base ${p.rank === 1 ? 'text-yellow-400' : p.rank === 2 ? 'text-slate-200' : p.rank === 3 ? 'text-amber-500' : 'text-indigo-300'}`}>
    {p.total}
  </span>
</td>
{data.match_headers.map(m => (
  <td key={m} className="px-3 py-3 text-center text-slate-300">{p.matches[m] ?? 0}</td>
))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type RankPoint = { match: string } & Record<string, number | string>;

function rankMapForValues(items: { username: string; value: number }[]) {
  const sorted = [...items].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.username.localeCompare(b.username);
  });

  const rankByUsername: Record<string, number> = {};
  let currentRank = 0;
  let previousValue: number | null = null;

  sorted.forEach((item, index) => {
    if (previousValue === null || item.value !== previousValue) currentRank = index + 1;
    rankByUsername[item.username] = currentRank;
    previousValue = item.value;
  });

  return rankByUsername;
}

function buildMatchWiseRankData(data: StandingsResponse): RankPoint[] {
  return data.match_headers.map((match) => {
    const rankByUsername = rankMapForValues(data.players.map((player) => ({
      username: player.username,
      value: player.matches[match] ?? 0,
    })));
    return data.players.reduce<RankPoint>((acc, player) => {
      acc[player.username] = rankByUsername[player.username];
      return acc;
    }, { match });
  });
}

function buildCumulativeRankData(data: StandingsResponse): RankPoint[] {
  const cumulative: Record<string, number> = Object.fromEntries(data.players.map((player) => [player.username, 0]));

  return data.match_headers.map((match) => {
    data.players.forEach((player) => { cumulative[player.username] += player.matches[match] ?? 0; });
    const rankByUsername = rankMapForValues(data.players.map((player) => ({
      username: player.username,
      value: cumulative[player.username],
    })));
    return data.players.reduce<RankPoint>((acc, player) => {
      acc[player.username] = rankByUsername[player.username];
      return acc;
    }, { match });
  });
}

function RankLineGraph({
  graphData,
  players,
  standings,
  maxRank,
}: {
  graphData: RankPoint[];
  players: { username: string; name: string }[];
  standings: StandingsResponse;
  maxRank: number;
}) {
  const width = 860;
  const height = 290;
  const margin = { top: 16, right: 30, bottom: 46, left: 34 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xStep = graphData.length > 1 ? innerWidth / (graphData.length - 1) : 0;
  const yForRank = (rank: number) => margin.top + ((rank - 1) / Math.max(maxRank - 1, 1)) * innerHeight;
  const xForIndex = (index: number) => margin.left + (graphData.length === 1 ? innerWidth / 2 : index * xStep);
  const matchPoints = Object.fromEntries(standings.players.map((player) => [player.username, player.matches]));

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[640px]">
        <defs>
          {players.map((player, playerIndex) => {
            const color = GRAPH_PALETTE[playerIndex % GRAPH_PALETTE.length];
            return (
              <linearGradient id={`line-${player.username}`} key={player.username} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={color} stopOpacity="1" />
                <stop offset="50%" stopColor={color} stopOpacity="1" />
                <stop offset="100%" stopColor={color} stopOpacity="1" />
              </linearGradient>
            );
          })}
          <filter id="graphGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.6" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 10 -3"
            />
          </filter>
        </defs>

        {Array.from({ length: maxRank }, (_, idx) => idx + 1).map((rank) => (
          <g key={`grid-${rank}`}>
            <motion.line
              x1={margin.left}
              y1={yForRank(rank)}
              x2={width - margin.right}
              y2={yForRank(rank)}
              stroke="#334155"
              strokeDasharray="4 4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: rank * 0.02 }}
            />
            <text x={margin.left - 10} y={yForRank(rank) + 4} fill="#94a3b8" fontSize="11" textAnchor="end">{rank}</text>
          </g>
        ))}

        {graphData.map((point, index) => (
          <text
            key={`match-${point.match}`}
            x={xForIndex(index)}
            y={height - 16}
            fill="#94a3b8"
            fontSize="11"
            textAnchor="middle"
          >
            {point.match as string}
          </text>
        ))}

        {players.map((player, playerIndex) => {
          const path = graphData.map((point, index) => {
            const rank = Number(point[player.username] ?? maxRank);
            return `${index === 0 ? 'M' : 'L'} ${xForIndex(index)} ${yForRank(rank)}`;
          }).join(' ');
          const color = GRAPH_PALETTE[playerIndex % GRAPH_PALETTE.length];

          return (
            <g key={player.username}>
              <motion.path
                d={path}
                fill="none"
                stroke={`url(#line-${player.username})`}
                strokeWidth="3.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#graphGlow)"
                initial={{ pathLength: 0, opacity: 0.8 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.05, ease: 'easeOut', delay: playerIndex * 0.12 }}
              />
              {graphData.map((point, index) => {
                const rank = Number(point[player.username] ?? maxRank);
                const points = Number(matchPoints[player.username]?.[point.match] ?? 0);
                return (
                  <motion.circle
                    key={`${player.username}-${point.match}`}
                    cx={xForIndex(index)}
                    cy={yForRank(rank)}
                    r="4"
                    fill="#0f172a"
                    stroke={color}
                    strokeWidth="2"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.32, delay: 0.14 + playerIndex * 0.08 + index * 0.04 }}
                  >
                    <title>{`${player.name} • Match #${index + 1} (${point.match}) • Points ${points} • Rank ${rank}`}</title>
                  </motion.circle>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-3 mt-4 text-xs">
        {players.map((player, index) => (
          <motion.div
            key={`${player.username}-legend`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + index * 0.06 }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/80 px-2.5 py-1 text-slate-300"
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
              style={{ backgroundColor: `${GRAPH_PALETTE[index % GRAPH_PALETTE.length]}22` }}
            >
              {playerEmoji(player.username)}
            </span>
            <span className="max-w-[11rem] truncate">{player.name}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function RankingAnalytics({ data }: { data: StandingsResponse | null }) {
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

  useEffect(() => {
    if (!data || data.players.length === 0) {
      setSelectedPlayers([]);
      return;
    }
    setSelectedPlayers((current) => {
      const next = current.filter((username) => data.players.some((player) => player.username === username));
      return next.length > 0 ? next : data.players.map((player) => player.username);
    });
  }, [data]);

  if (!data || data.match_headers.length === 0 || data.players.length === 0) {
    return <p className="text-slate-400 text-sm">{APP_TEXT.analytics.empty}</p>;
  }

  const playerMeta = data.players.map((player) => ({ username: player.username, name: player.display_name }));
  const filteredPlayers = playerMeta.filter((player) => selectedPlayers.includes(player.username));
  const matchWiseRankData = buildMatchWiseRankData(data);
  const cumulativeRankData = buildCumulativeRankData(data);
  const selectedCount = filteredPlayers.length;
  const togglePlayer = (username: string) => {
    setSelectedPlayers((current) => (
      current.includes(username)
        ? current.filter((player) => player !== username)
        : [...current, username]
    ));
  };
  const selectAll = () => setSelectedPlayers(playerMeta.map((player) => player.username));
  const clearAll = () => setSelectedPlayers([]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <LineChartIcon className="w-5 h-5 text-indigo-400" />
            {APP_TEXT.analytics.title}
          </h2>
          <p className="text-sm text-slate-400">{APP_TEXT.analytics.selectionHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200">
            <Sparkles className="w-3.5 h-3.5" />
            {selectedCount} {APP_TEXT.analytics.selectedCount}
          </span>
          <button
            onClick={selectAll}
            className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
          >
            {APP_TEXT.analytics.selectAll}
          </button>
          <button
            onClick={clearAll}
            className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-rose-500/40 hover:text-white"
          >
            {APP_TEXT.analytics.clearAll}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {playerMeta.map((player, index) => {
          const checked = selectedPlayers.includes(player.username);
          return (
            <motion.label
              key={player.username}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              whileHover={{ y: -2 }}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-all ${
                checked
                  ? 'border-indigo-400/40 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                  : 'border-slate-700/60 bg-slate-900/40 hover:border-slate-500/70'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => togglePlayer(player.username)}
                className="sr-only"
                aria-label={`Toggle ${player.name}`}
              />
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg transition-transform ${
                  checked ? 'scale-105 bg-gradient-to-br from-indigo-400 to-fuchsia-400' : 'bg-slate-800'
                }`}
              >
                {playerEmoji(player.username)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-white">{player.name}</span>
                <span className="block truncate text-xs text-slate-500">@{player.username}</span>
              </span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                  checked ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-slate-600 text-transparent'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            </motion.label>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {filteredPlayers.length > 0 ? (
          <motion.div key="graphs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="space-y-4">
            {[{
              title: APP_TEXT.analytics.matchRankTitle,
              dataSource: matchWiseRankData,
            }, {
              title: APP_TEXT.analytics.cumulativeRankTitle,
              dataSource: cumulativeRankData,
            }].map((graph, index) => (
              <motion.div
                key={graph.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className="rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium text-slate-200">{graph.title}</h3>
                    <p className="text-xs text-slate-500">{selectedCount} players active</p>
                  </div>
                  <span className="rounded-full border border-slate-700/60 bg-slate-950/40 px-3 py-1 text-xs text-slate-400">
                    {APP_TEXT.analytics.legendHint}
                  </span>
                </div>
                <RankLineGraph graphData={graph.dataSource} players={filteredPlayers} standings={data} maxRank={data.players.length} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-950/30 px-6 py-10 text-center text-slate-400"
          >
            {APP_TEXT.analytics.noPlayersSelected}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WhatIfSimulator({ data }: { data: StandingsResponse | null }) {
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!data || data.players.length === 0) {
      setDeltas({});
      return;
    }

    setDeltas((current) => {
      const next: Record<string, number> = {};
      data.players.forEach((player) => {
        next[player.username] = current[player.username] ?? 0;
      });
      return next;
    });
  }, [data]);

  if (!data || data.players.length === 0) {
    return <p className="text-slate-400 text-sm">{APP_TEXT.analytics.empty}</p>;
  }

  const forecastPlayers = buildForecastPlayers(data.players, deltas);
  const forecastByUsername = Object.fromEntries(forecastPlayers.map((player) => [player.username, player]));
  const projectedLeader = forecastPlayers[0];
  const biggestMover = [...forecastPlayers].sort((a, b) => {
    const rankMove = Math.abs(b.rankDelta) - Math.abs(a.rankDelta);
    if (rankMove !== 0) return rankMove;
    return Math.abs(b.delta) - Math.abs(a.delta);
  })[0];

  const setPreset = (username: string, value: number) => {
    setDeltas((current) => ({ ...current, [username]: value }));
  };

  const setAll = (value: number) => {
    setDeltas(Object.fromEntries(data.players.map((player) => [player.username, value])));
  };

  const resetSimulation = () => {
    const next: Record<string, number> = {};
    data.players.forEach((player) => {
      next[player.username] = 0;
    });
    setDeltas(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
            {APP_TEXT.simulator.title}
          </h2>
          <p className="text-sm text-slate-400">{APP_TEXT.simulator.description}</p>
        </div>
        <button
          onClick={resetSimulation}
          className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
        >
          <RotateCcw className="w-4 h-4" />
          {APP_TEXT.simulator.reset}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setAll(50)}
          className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
        >
          {APP_TEXT.simulator.presetBoost}
        </button>
        <button
          onClick={() => setAll(100)}
          className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
        >
          {APP_TEXT.simulator.presetBig}
        </button>
        <button
          onClick={() => setAll(150)}
          className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
        >
          {APP_TEXT.simulator.presetHuge}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
          <p className="text-xs uppercase tracking-wide text-indigo-200/80">{APP_TEXT.simulator.leader}</p>
          <div className="mt-2 text-lg font-semibold text-white">
            {projectedLeader ? `${playerEmoji(projectedLeader.username)} ${projectedLeader.display_name}` : '—'}
          </div>
          <p className="text-sm text-indigo-100/80 mt-1">Rank #{projectedLeader?.projectedRank ?? '—'} · {projectedLeader ? projectedLeader.projectedTotal : '—'} pts</p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">{APP_TEXT.simulator.biggestMover}</p>
          <div className="mt-2 text-lg font-semibold text-white">
            {biggestMover ? `${playerEmoji(biggestMover.username)} ${biggestMover.display_name}` : '—'}
          </div>
          <p className="text-sm text-slate-300 mt-1">
            {biggestMover ? `${biggestMover.rankDelta > 0 ? '+' : ''}${biggestMover.rankDelta} rank change` : '—'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/45 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">{APP_TEXT.simulator.note}</p>
          <div className="mt-2 text-lg font-semibold text-white">8 fixed players</div>
          <p className="text-sm text-slate-300 mt-1">{APP_TEXT.simulator.sliderHint}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/45 overflow-hidden">
        <div className="border-b border-slate-700/50 bg-slate-800/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-medium text-slate-200">{APP_TEXT.simulator.title}</h3>
              <p className="text-xs text-slate-500">{APP_TEXT.simulator.sliderHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAll(5)}
                className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
              >
                {APP_TEXT.simulator.presetBoost}
              </button>
              <button
                onClick={() => setAll(10)}
                className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
              >
                {APP_TEXT.simulator.presetBig}
              </button>
              <button
                onClick={() => setAll(15)}
                className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
              >
                {APP_TEXT.simulator.presetHuge}
              </button>
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-800/50">
          {forecastPlayers.map((player, index) => {
            const delta = deltas[player.username] ?? 0;
            const overtakeTarget = index > 0 ? forecastPlayers[index - 1] : null;
            const pointsToOvertake = overtakeTarget
              ? Math.max(1, Math.ceil(overtakeTarget.projectedTotal - player.projectedTotal + 1))
              : 0;

            return (
              <motion.div
                key={player.username}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`grid gap-4 px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)_160px] lg:items-center ${
                  delta === 0 ? 'bg-transparent' : 'bg-indigo-500/5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-lg">
                    {playerEmoji(player.username)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex-shrink-0">{rankBadge(player.projectedRank)}</span>
                      <div className="truncate font-medium text-white">{player.display_name}</div>
                    </div>
                    <div className="text-xs text-slate-500">@{player.username}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {APP_TEXT.simulator.actualRank} #{player.rank} · {player.total} pts
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{APP_TEXT.simulator.delta}: {formatDelta(delta)} pts</span>
                    <span>{APP_TEXT.simulator.projectedTotal}: {player.projectedTotal} pts</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={SIMULATION_RANGE}
                    step={5}
                    value={delta}
                    onChange={e => {
                      const next = Number(e.target.value);
                      setDeltas(current => ({ ...current, [player.username]: next }));
                    }}
                    className="w-full accent-indigo-400"
                  />
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>0</span>
                    <span>{Math.round(SIMULATION_RANGE / 2)}</span>
                    <span>{SIMULATION_RANGE}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPreset(player.username, 50)}
                      className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
                    >
                      +50
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreset(player.username, 100)}
                      className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
                    >
                      +100
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreset(player.username, 150)}
                      className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:border-indigo-500/40 hover:text-white"
                    >
                      +150
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreset(player.username, 0)}
                      className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:border-rose-500/40 hover:text-white"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700/50 bg-slate-950/35 px-3 py-2 text-[11px] text-slate-300">
                  <div className={`inline-flex items-center gap-1 text-xs font-medium ${
                    player.rankDelta > 0 ? 'text-emerald-400' : player.rankDelta < 0 ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {player.rankDelta > 0 && <ArrowUpRight className="w-3.5 h-3.5" />}
                    {player.rankDelta < 0 && <ArrowDownRight className="w-3.5 h-3.5" />}
                    {player.rankDelta === 0 ? APP_TEXT.simulator.holding : `${player.rankDelta > 0 ? '+' : ''}${player.rankDelta} ${APP_TEXT.simulator.projectedRank.toLowerCase()}`}
                  </div>
                  <div className="mt-2">
                    {overtakeTarget ? (
                      <>
                        {APP_TEXT.simulator.overtake} <span className="text-white font-medium">{overtakeTarget.display_name}</span>
                        <span className="block mt-1 text-slate-400">
                          Need {pointsToOvertake} more pts.
                        </span>
                      </>
                    ) : (
                      <>
                        {APP_TEXT.simulator.holding} <span className="text-white font-medium">#1</span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <ProjectedTotalsChart players={forecastPlayers} />

      <div className="rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="bg-slate-800/60 border-b border-slate-700/50 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-slate-200">Projected leaderboard</h3>
            <p className="text-xs text-slate-500">Ranks update live as you move the sliders.</p>
          </div>
          <span className="text-xs text-slate-400">{forecastPlayers.length} players</span>
        </div>
        <div className="divide-y divide-slate-800/50">
          {forecastPlayers.map((player, index) => (
            <motion.div
              key={player.username}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="grid grid-cols-[56px_minmax(0,1fr)_96px_112px_92px] items-center gap-3 px-4 py-3 text-sm"
            >
              <div className="flex justify-center">{rankBadge(player.projectedRank)}</div>
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{player.display_name}</div>
                <div className="truncate text-xs text-slate-500">@{player.username}</div>
              </div>
              <div className="text-center text-slate-300">
                <div className="text-xs text-slate-500">Actual</div>
                <div className="font-medium">{player.total}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-500">Delta</div>
                <div className={`font-medium ${player.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatDelta(player.delta)}
                </div>
              </div>
              <div className={`text-center font-semibold ${
                player.rankDelta > 0 ? 'text-emerald-400' : player.rankDelta < 0 ? 'text-rose-400' : 'text-slate-200'
              }`}>
                {player.projectedTotal}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Upload (with code gate + verify step) ────────────────────────────────────
type UploadStep = 'code' | 'image' | 'verify' | 'done';
const MAX_UPLOAD_BYTES = APP_LIMITS.maxUploadBytes;

function UploadMatch({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<UploadStep>('code');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [codeErr, setCodeErr] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState('');

  const [players, setPlayers] = useState<ExtractedPlayer[]>([]);
  const [matchTitle, setMatchTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  // ── change code modal ──
  const [showChangeCode, setShowChangeCode] = useState(false);
  const [ccOld, setCcOld] = useState('');
  const [ccNew, setCcNew] = useState('');
  const [ccMsg, setCcMsg] = useState('');
  const [ccLoading, setCcLoading] = useState(false);

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setCheckingCode(true); setCodeErr('');
    try {
      const { valid } = await verifyCode(code.trim());
      if (valid) setStep('image');
      else setCodeErr('Galat code hai! / Wrong code.');
    } catch { setCodeErr('Server error. Try again.'); }
    finally { setCheckingCode(false); }
  };

  const handleFile = (f: File) => {
    if (f.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setPreview(null);
      setExtractErr('Image is too large. Please use a photo under 3 MB.');
      return;
    }
    setFile(f); setPreview(URL.createObjectURL(f)); setExtractErr('');
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true); setExtractErr('');
    try {
      const { players: p, match_title } = await extractFromImage(file);
      setPlayers(p); setStep('verify');
      setMatchTitle(match_title?.trim() ?? '');
    } catch (e: unknown) { setExtractErr(e instanceof Error ? e.message : 'Extraction failed'); }
    finally { setExtracting(false); }
  };

  const handleConfirm = async () => {
    setSaving(true); setSaveErr('');
    try {
      await confirmUpload(
        code,
        players.map(p => ({ username: p.username, points: p.points })),
        matchTitle.trim() || undefined,
      );
      setStep('done'); onSuccess();
    } catch (e: unknown) { setSaveErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleChangeCode = async () => {
    setCcLoading(true); setCcMsg('');
    try {
      const { success, message } = await changeCode(ccOld, ccNew);
      setCcMsg(message);
      if (success) { setCcOld(''); setCcNew(''); setTimeout(() => { setShowChangeCode(false); setCcMsg(''); }, 1500); }
    } catch { setCcMsg('Server error.'); }
    finally { setCcLoading(false); }
  };

  const reset = () => {
    setStep('code'); setCode(''); setFile(null); setPreview(null);
    setPlayers([]); setMatchTitle(''); setCodeErr(''); setExtractErr(''); setSaveErr('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-400" /> {APP_TEXT.upload.title}
        </h2>
        <button onClick={() => setShowChangeCode(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <KeyRound className="w-3.5 h-3.5" /> {APP_TEXT.upload.changeCode}
        </button>
      </div>

      {/* Change code panel */}
      <AnimatePresence>
        {showChangeCode && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <p className="text-slate-400 text-sm font-medium">{APP_TEXT.upload.changeCodeTitle}</p>
            <input type="password" value={ccOld} onChange={e => setCcOld(e.target.value)}
              placeholder={APP_TEXT.upload.oldCodePlaceholder}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60" />
            <input type="password" value={ccNew} onChange={e => setCcNew(e.target.value)}
              placeholder={APP_TEXT.upload.newCodePlaceholder}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60" />
            <button onClick={handleChangeCode} disabled={ccLoading || !ccOld || !ccNew}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40">
              {ccLoading ? 'Checking…' : APP_TEXT.upload.updateCode}
            </button>
            {ccMsg && <p className={`text-sm ${ccMsg.includes('success') || ccMsg.includes('changed') ? 'text-emerald-400' : 'text-red-400'}`}>{ccMsg}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step: enter code */}
      {step === 'code' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-300">
              <Lock className="w-5 h-5 text-indigo-400" />
              <span className="font-medium">{APP_TEXT.upload.adminRequired}</span>
            </div>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={code} onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                placeholder={APP_TEXT.upload.enterCodePlaceholder}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 text-sm"
              />
              <button onClick={() => setShowCode(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {codeErr && <p className="text-red-400 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" />{codeErr}</p>}
            <button onClick={handleVerifyCode} disabled={checkingCode || !code.trim()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-40">
              {checkingCode ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : <><ShieldCheck className="w-4 h-4" /> {APP_TEXT.upload.verifyCode}</>}
            </button>
          </div>
        </div>
      )}

      {/* Step: upload image */}
      {step === 'image' && (
        <div className="space-y-4">
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 hover:border-indigo-500/60 hover:bg-slate-800/40'}`}>
              <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            {preview
              ? <img src={preview} alt="preview" className="max-h-56 mx-auto rounded-xl object-contain" />
              : <><ImagePlus className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">{APP_TEXT.upload.selectFile}</p>
                <p className="text-slate-600 text-sm mt-1">{APP_TEXT.upload.browseFile}</p></>}
          </div>
          {file && <p className="text-slate-400 text-sm text-center">{file.name}</p>}
          {extractErr && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{extractErr}</div>}
          <button onClick={handleExtract} disabled={!file || extracting}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-40 shadow-lg shadow-indigo-500/20">
            {extracting ? <><Loader2 className="w-4 h-4 animate-spin" /> {APP_TEXT.upload.scanning}</> : <><Upload className="w-4 h-4" /> {APP_TEXT.upload.readImage}</>}
          </button>
        </div>
      )}

      {/* Step: verify & edit */}
          {step === 'verify' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Pencil className="w-4 h-4 text-indigo-400" />
            {APP_TEXT.upload.review}
          </div>

          {matchTitle && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
              <span className="text-indigo-200 font-medium">Match:</span> {matchTitle}
            </div>
          )}
          <div className="space-y-2 rounded-xl border border-slate-700/50 bg-slate-900/45 p-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
              Match title
            </label>
            <input
              value={matchTitle}
              onChange={e => setMatchTitle(e.target.value)}
              placeholder="SRH vs RCB"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60"
            />
            <p className="text-xs text-slate-500">
              You can fix this before saving if the screenshot title is clipped or blurry.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/60 border-b border-slate-700/50">
                  <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Player</th>
                  <th className="px-4 py-2.5 text-left text-slate-400 font-medium">Read as</th>
                  <th className="px-4 py-2.5 text-center text-slate-400 font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.username} className="border-b border-slate-800/50">
                    <td className="px-4 py-2.5">
                      <div className="text-white font-medium leading-tight">{p.display_name}</div>
                      <div className="text-xs text-slate-500">@{p.username}</div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs italic">
                      {p.raw_name === '—' ? <span className="text-slate-600">{APP_TEXT.upload.notFound}</span> : p.raw_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={0}
                        step="0.5"
                        value={players[i].points}
                        onChange={e => {
                          const updated = [...players];
                          updated[i] = { ...updated[i], points: parseFloat(e.target.value) || 0 };
                          setPlayers(updated);
                        }}
                        className="w-20 mx-auto block bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-center text-white text-sm focus:outline-none focus:border-indigo-500/60"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {saveErr && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{saveErr}</div>}

          <div className="flex gap-3">
            <button onClick={() => setStep('image')}
              className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-sm font-medium transition-colors">
              {APP_TEXT.upload.backToUpload}
            </button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {APP_TEXT.upload.saving}</> : <><CheckCircle2 className="w-4 h-4" /> {APP_TEXT.upload.confirmSave}</>}
            </button>
          </div>
        </motion.div>
      )}

      {/* Step: success */}
      {step === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <p className="text-emerald-400 font-medium text-lg">{APP_TEXT.upload.saveSuccess}</p>
          <p className="text-slate-400 text-sm">{APP_TEXT.upload.leaderboardUpdated}</p>
          <button onClick={reset}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            {APP_TEXT.upload.uploadAnother}
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
type ChatMode = 'normal' | 'awaiting_old_code' | 'awaiting_new_code';

type ChatModeV2 = ChatMode | 'awaiting_admin_code';

function isChangeCodeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (CHAT_INTENTS.changeCode[0] && t.includes(CHAT_INTENTS.changeCode[0])) ||
    (CHAT_INTENTS.changeCode[1] && t.includes(CHAT_INTENTS.changeCode[1])) ||
    (t.includes('code') && (t.includes('badal') || t.includes('update'))) ||
    t.includes(APP_TEXT.chat.changeCodePrompt) ||
    t.includes('admin code') ||
    (t.includes('naya') && t.includes('code')) ||
    t.includes('code change')
  );
}

function isAdminUnlockIntent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    CHAT_INTENTS.adminUnlock.some(phrase => t.includes(phrase)) ||
    t.includes('admin panel')
  );
}

function Chat({ onUnlockAdmin }: { onUnlockAdmin: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: APP_TEXT.chat.greeting,
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatModeV2>('normal');
  const [pendingOldCode, setPendingOldCode] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const isSecretStep = chatMode !== 'normal';

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const addMsg = (role: 'user' | 'assistant', content: string) =>
    setMessages(m => [...m, { role, content }]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');

    // Show user message (mask if it's a secret code step)
    addMsg('user', isSecretStep ? '••••••••' : q);
    setLoading(true);

    try {
      // ── Change-code flow ──────────────────────────────────────────────
      if (chatMode === 'normal' && isChangeCodeIntent(q)) {
        addMsg('assistant', APP_TEXT.chat.adminCodeChangePrompt);
        setChatMode('awaiting_old_code');
        return;
      }

      if (chatMode === 'normal' && isAdminUnlockIntent(q)) {
        addMsg('assistant', APP_TEXT.chat.adminUnlockPrompt);
        setChatMode('awaiting_admin_code');
        return;
      }

      if (chatMode === 'awaiting_old_code') {
        const { valid } = await verifyCode(q);
        if (valid) {
          setPendingOldCode(q);
          setChatMode('awaiting_new_code');
          addMsg('assistant', APP_TEXT.chat.oldCodeOk);
        } else {
          addMsg('assistant', APP_TEXT.chat.oldCodeWrong);
          setChatMode('normal');
        }
        return;
      }

      if (chatMode === 'awaiting_new_code') {
        const { success, message } = await changeCode(pendingOldCode, q);
        addMsg('assistant', success ? `✅ ${message}` : `❌ ${message}`);
        setChatMode('normal');
        setPendingOldCode('');
        return;
      }

      if (chatMode === 'awaiting_admin_code') {
        const { valid } = await verifyCode(q);
        if (valid) {
          onUnlockAdmin();
          addMsg('assistant', APP_TEXT.chat.adminUnlocked);
        } else {
          addMsg('assistant', APP_TEXT.chat.adminCodeWrong);
        }
        setChatMode('normal');
        return;
      }

      // ── Normal chat ───────────────────────────────────────────────────
      const { answer } = await sendChat(q);
      addMsg('assistant', answer);

    } catch (e: unknown) {
      addMsg('assistant', `❌ ${e instanceof Error ? e.message : 'Something went wrong'}`);
      setChatMode('normal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-purple-400" /> {APP_TEXT.chat.title}
        <span className="text-xs text-slate-500 font-normal ml-1">{APP_TEXT.chat.languageHint}</span>
      </h2>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 mb-4">
        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700/50'}`}>
              {m.content}
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 150, 300].map(d => <span key={d} className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Hint bar when in code-change mode */}
      {isSecretStep && (
        <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          {chatMode === 'awaiting_old_code' ? APP_TEXT.chat.hintOldCode : APP_TEXT.chat.hintNewCode}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type={isSecretStep ? 'password' : 'text'}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={
            chatMode === 'awaiting_old_code' ? APP_TEXT.chat.placeholderOldCode :
            chatMode === 'awaiting_new_code' ? APP_TEXT.chat.placeholderNewCode :
            APP_TEXT.chat.placeholderNormal
          }
          className="flex-1 bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
        />
        <button onClick={send} disabled={!input.trim() || loading}
          className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl transition-colors disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Admin tools ─────────────────────────────────────────────────────────────
function AdminPanel({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [matches, setMatches] = useState<{ id: number; name: string }[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [matchName, setMatchName] = useState('');
  const [players, setPlayers] = useState<AdminMatchPlayer[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const refreshMatches = useCallback(async (preferredMatchId?: number | null) => {
    setLoadingMatches(true);
    setError('');
    try {
      const { matches: nextMatches } = await listMatches();
      setMatches(nextMatches);
      setSelectedMatchId(prev => {
        const desired = preferredMatchId ?? prev ?? nextMatches[0]?.id ?? null;
        if (desired != null && nextMatches.some(m => m.id === desired)) return desired;
        return nextMatches[0]?.id ?? null;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : APP_TEXT.admin.loadMatchesError);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => {
    void refreshMatches();
  }, [refreshMatches]);

  useEffect(() => {
    const loadSelectedMatch = async () => {
      if (selectedMatchId == null) {
        setPlayers([]);
        setMatchName('');
        return;
      }
      setLoadingMatch(true);
      setError('');
      try {
        const detail = await getMatch(selectedMatchId);
        setPlayers(detail.players);
        setMatchName(detail.match_name);
        setStatus(`${APP_TEXT.admin.loadPrefix} ${detail.match_name}.`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : APP_TEXT.admin.loadMatchError);
        setPlayers([]);
        setMatchName('');
      } finally {
        setLoadingMatch(false);
      }
    };
    void loadSelectedMatch();
  }, [selectedMatchId]);

  const requireCode = () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError(APP_TEXT.admin.codeRequired);
      return null;
    }
    return trimmed;
  };

  const handleSave = async () => {
    if (selectedMatchId == null) return;
    const adminCode = requireCode();
    if (!adminCode) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const res = await updateMatch(
        selectedMatchId,
        adminCode,
        players.map(p => ({ username: p.username, points: p.points })),
        matchName.trim() || undefined,
      );
      setStatus(res.message);
      await refreshMatches(selectedMatchId);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : APP_TEXT.admin.updateMatchError);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedMatchId == null) return;
    const adminCode = requireCode();
    if (!adminCode) return;
    if (!window.confirm(APP_TEXT.admin.confirmDelete)) return;
    setMutating(true);
    setError('');
    setStatus('');
    try {
      const res = await deleteMatch(selectedMatchId, adminCode);
      setStatus(res.message);
      await refreshMatches(null);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : APP_TEXT.admin.deleteMatchError);
    } finally {
      setMutating(false);
    }
  };

  const handleReset = async () => {
    const adminCode = requireCode();
    if (!adminCode) return;
    if (!window.confirm(APP_TEXT.admin.confirmReset)) return;
    setMutating(true);
    setError('');
    setStatus('');
    try {
      const res = await resetData(adminCode);
      setStatus(res.message);
      await refreshMatches(null);
      setPlayers([]);
      setMatchName('');
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : APP_TEXT.admin.resetDataError);
    } finally {
      setMutating(false);
    }
  };

  const selectedMatch = matches.find(m => m.id === selectedMatchId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" /> {APP_TEXT.admin.title}
          </h2>
          <p className="text-slate-400 text-sm mt-1">{APP_TEXT.admin.description}</p>
        </div>
        <button
          onClick={() => refreshMatches(selectedMatchId)}
          disabled={loadingMatches}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loadingMatches ? 'animate-spin' : ''}`} />
          {APP_TEXT.admin.refresh}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <label className="block text-sm text-slate-400">{APP_TEXT.admin.adminCodeLabel}</label>
          <input
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder={APP_TEXT.admin.adminCodePlaceholder}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 text-sm"
          />
          <p className="text-xs text-slate-500">
            {APP_TEXT.admin.adminCodeNote}
          </p>
        </div>

        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <label className="block text-sm text-slate-400">{APP_TEXT.admin.savedMatches}</label>
          <select
            value={selectedMatchId ?? ''}
            onChange={e => setSelectedMatchId(e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500/60 text-sm"
          >
            <option value="">{APP_TEXT.admin.selectMatch}</option>
            {matches.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            {selectedMatch ? `Editing ${selectedMatch.name}` : APP_TEXT.admin.noMatchSelected}
          </p>
        </div>
      </div>

      {selectedMatchId != null && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <label className="block text-sm text-slate-400">Match Title</label>
          <input
            type="text"
            value={matchName}
            onChange={e => setMatchName(e.target.value)}
            placeholder="SRH vs RCB"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 text-sm"
          />
          <p className="text-xs text-slate-500">
            Rename the saved match here if you want the admin panel and standings to show the exact matchup title.
          </p>
        </div>
      )}

      {status && (
        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-emerald-400 text-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {status}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loadingMatch && (
        <div className="text-center py-10 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          {APP_TEXT.admin.loadMatch}
        </div>
      )}

      {!loadingMatch && selectedMatchId != null && (
        <div className="rounded-xl border border-slate-700/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700/50">
                <th className="px-4 py-2.5 text-left text-slate-400 font-medium">{APP_TEXT.admin.player}</th>
                <th className="px-4 py-2.5 text-center text-slate-400 font-medium">{APP_TEXT.admin.points}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.username} className="border-b border-slate-800/50">
                  <td className="px-4 py-2.5">
                    <div className="text-white font-medium leading-tight">{p.display_name}</div>
                    <div className="text-xs text-slate-500">@{p.username}</div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={players[i].points}
                      onChange={e => {
                        const updated = [...players];
                        updated[i] = { ...updated[i], points: parseFloat(e.target.value) || 0 };
                        setPlayers(updated);
                      }}
                      className="w-24 mx-auto block bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-center text-white text-sm focus:outline-none focus:border-indigo-500/60"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <button
          onClick={handleSave}
          disabled={saving || selectedMatchId == null}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> {APP_TEXT.admin.saving}</> : <><Pencil className="w-4 h-4" /> {APP_TEXT.admin.saveChanges}</>}
        </button>
        <button
          onClick={handleDelete}
          disabled={mutating || selectedMatchId == null}
          className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
        >
          {mutating ? <><Loader2 className="w-4 h-4 animate-spin" /> {APP_TEXT.admin.working}</> : <><Trash2 className="w-4 h-4" /> {APP_TEXT.admin.deleteMatch}</>}
        </button>
        <button
          onClick={handleReset}
          disabled={mutating}
          className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
        >
          <RotateCcw className="w-4 h-4" /> {APP_TEXT.admin.resetAllData}
        </button>
      </div>
    </div>
  );
}

function ChatWidget({ open, onOpenChange, onUnlockAdmin }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlockAdmin: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100vh-6rem))] rounded-3xl border border-slate-700/70 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/70 bg-slate-900/80">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <MessageSquare className="w-4 h-4 text-purple-400" />
                {APP_TEXT.chat.title}
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-[calc(100%-52px)] p-4">
              <Chat onUnlockAdmin={onUnlockAdmin} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => onOpenChange(!open)}
        className="flex items-center justify-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 transition-colors h-14 px-5 border border-indigo-400/30"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="text-sm font-medium">{open ? APP_TEXT.chat.close : APP_TEXT.chat.open}</span>
      </button>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
type Tab = 'leaderboard' | 'upload' | 'analytics' | 'simulator';

export default function App() {
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [chatOpen, setChatOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [loadingStandings, setLoadingStandings] = useState(false);

  const fetchStandings = useCallback(async () => {
    setLoadingStandings(true);
    try { setStandings(await getStandings()); }
    catch { /* silent */ }
    finally { setLoadingStandings(false); }
  }, []);

  useEffect(() => { fetchStandings(); }, [fetchStandings]);

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'leaderboard', label: APP_TEXT.tabs.leaderboard, icon: <Trophy className="w-4 h-4" /> },
    { id: 'upload',      label: APP_TEXT.tabs.upload, icon: <Upload className="w-4 h-4" /> },
    { id: 'analytics',   label: APP_TEXT.tabs.analytics, icon: <LineChartIcon className="w-4 h-4" /> },
    { id: 'simulator',   label: APP_TEXT.tabs.simulator, icon: <SlidersHorizontal className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/8 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 mb-4">
            <Trophy className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-indigo-300">{APP_TEXT.hero.badge}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
            {APP_TEXT.hero.title}
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            {APP_TEXT.hero.description}
          </p>
        </motion.div>

        {standings && standings.players.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: APP_TEXT.hero.players, value: standings.players.length },
              { label: APP_TEXT.hero.matches, value: standings.match_headers.length },
              { label: APP_TEXT.hero.leader, value: standings.players[0]?.display_name.split(' ')[0] ?? '—' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white truncate">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </motion.div>
        )}

        {adminUnlocked && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6"
          >
            <AdminPanel onSuccess={fetchStandings} />
          </motion.div>
        )}

        <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 mb-8">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}>
              {t.icon}<span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 md:p-8">
          {tab === 'leaderboard' && <Leaderboard data={standings} onRefresh={fetchStandings} loading={loadingStandings} />}
          {tab === 'upload' && <UploadMatch onSuccess={() => { fetchStandings(); setTimeout(() => setTab('leaderboard'), 1500); }} />}
          {tab === 'analytics' && <RankingAnalytics data={standings} />}
          {tab === 'simulator' && <WhatIfSimulator data={standings} />}
        </motion.div>

        <p className="text-center text-slate-600 text-xs mt-8">Powered by Groq · SQLite · {APP_TEXT.hero.title}</p>
      </div>

      <ChatWidget
        open={chatOpen}
        onOpenChange={setChatOpen}
        onUnlockAdmin={() => {
          setAdminUnlocked(true);
          setChatOpen(true);
        }}
      />
    </div>
  );
}
