import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Upload, MessageSquare, RefreshCw,
  CheckCircle2, AlertCircle, ImagePlus, Send,
  Medal, Crown, ChevronUp, ChevronDown, Loader2, FileDown,
} from 'lucide-react';
import { getStandings, uploadMatch, sendChat, exportXlsx } from './lib/api';
import type { ChatMessage, StandingsResponse, UploadResponse } from './lib/types';

// ─── Medal colours ───────────────────────────────────────────────────────────
function rankBadge(rank: number) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
  return <span className="text-slate-500 text-sm font-mono w-4 text-center">{rank}</span>;
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
function Leaderboard({ data, onRefresh, loading }: {
  data: StandingsResponse | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [sortAsc, setSortAsc] = useState(false);

  const players = data
    ? [...data.players].sort((a, b) => sortAsc ? a.total - b.total : b.total - a.total)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          Standings
        </h2>
        <div className="flex items-center gap-3">
          <a
            href={exportXlsx()}
            download="scores.xlsx"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors"
          >
            <FileDown className="w-3.5 h-3.5" /> Export
          </a>
          <button
            onClick={() => setSortAsc(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Total {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="text-center py-16 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
          Loading standings...
        </div>
      )}

      {!loading && data && players.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No match data yet.</p>
          <p className="text-sm mt-1">Upload a match image to get started.</p>
        </div>
      )}

      {data && players.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60">
                <th className="px-4 py-3 text-left text-slate-400 font-medium w-10">#</th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">Player</th>
                {data.match_headers.map(m => (
                  <th key={m} className="px-4 py-3 text-center text-slate-400 font-medium whitespace-nowrap">
                    {m}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-white font-semibold whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <motion.tr
                  key={p.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`border-b border-slate-800/60 transition-colors hover:bg-slate-800/30 ${
                    p.rank === 1 ? 'bg-yellow-500/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">{rankBadge(p.rank)}</div>
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  {data.match_headers.map(m => (
                    <td key={m} className="px-4 py-3 text-center text-slate-300">
                      {p.matches[m] ?? '—'}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold text-base ${
                      p.rank === 1 ? 'text-yellow-400' :
                      p.rank === 2 ? 'text-slate-200' :
                      p.rank === 3 ? 'text-amber-500' : 'text-indigo-300'
                    }`}>
                      {p.total}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Upload ───────────────────────────────────────────────────────────────────
function UploadMatch({ onSuccess }: { onSuccess: (r: UploadResponse) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError('');
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const r = await uploadMatch(file);
      setResult(r);
      onSuccess(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2">
        <Upload className="w-5 h-5 text-indigo-400" />
        Upload Match Image
      </h2>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-slate-700 hover:border-indigo-500/60 hover:bg-slate-800/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {preview ? (
          <img src={preview} alt="preview" className="max-h-56 mx-auto rounded-xl object-contain" />
        ) : (
          <>
            <ImagePlus className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Drop a match scoresheet image here</p>
            <p className="text-slate-600 text-sm mt-1">or click to browse — JPEG, PNG, WebP</p>
          </>
        )}
      </div>

      {file && (
        <p className="text-slate-400 text-sm text-center">
          Selected: <span className="text-slateigo-300 text-white">{file.name}</span>
        </p>
      )}

      {/* Upload button */}
      <button
        onClick={handleSubmit}
        disabled={!file || uploading}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
      >
        {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning image & updating sheet…</> : <><Upload className="w-4 h-4" /> Upload & Add Match</>}
      </button>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Success result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <CheckCircle2 className="w-5 h-5" />
              {result.message}
            </div>
            <div className="space-y-1">
              {Object.entries(result.extracted).map(([name, pts]) => (
                <div key={name} className="flex justify-between text-sm text-slate-300 bg-slate-800/40 rounded-lg px-3 py-1.5">
                  <span>{name}</span>
                  <span className="text-indigo-300 font-medium">{pts} pts</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'नमस्ते! 👋 Ask me anything about player points or match standings — in Hindi or English.\n\nExample: "4th match mein sabse zyada points kisne liye?" or "Who is leading overall?"',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const { answer } = await sendChat(q);
      setMessages(m => [...m, { role: 'assistant', content: answer }]);
    } catch (e: unknown) {
      setMessages(m => [...m, { role: 'assistant', content: `❌ ${e instanceof Error ? e.message : 'Something went wrong'}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[560px]">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-purple-400" />
        Ask About Scores
        <span className="text-xs text-slate-500 font-normal ml-1">Hindi / English</span>
      </h2>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700/50'
              }`}
            >
              {m.content}
            </div>
          </motion.div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Match 3 mein mere kitne points hain? / Who won match 2?"
          className="flex-1 bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 transition-colors"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
type Tab = 'leaderboard' | 'upload' | 'chat';

export default function App() {
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [loadingStandings, setLoadingStandings] = useState(false);

  const fetchStandings = useCallback(async () => {
    setLoadingStandings(true);
    try {
      const data = await getStandings();
      setStandings(data);
    } catch { /* silent */ }
    finally { setLoadingStandings(false); }
  }, []);

  useEffect(() => { fetchStandings(); }, [fetchStandings]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="w-4 h-4" /> },
    { id: 'upload',      label: 'Upload Match', icon: <Upload className="w-4 h-4" /> },
    { id: 'chat',        label: 'Ask AI',        icon: <MessageSquare className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/8 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 mb-4">
            <Trophy className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-indigo-300">Match Points Tracker</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
            ScoreKeeper
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Upload match scoresheets, auto-update your leaderboard, and ask questions in Hindi or English.
          </p>
        </motion.div>

        {/* Stats bar */}
        {standings && standings.players.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-4 mb-8"
          >
            {[
              { label: 'Players', value: standings.players.length },
              { label: 'Matches', value: standings.match_headers.length },
              { label: 'Leader', value: standings.players[0]?.name.split(' ')[0] ?? '—' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 mb-8">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === t.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 md:p-8"
        >
          {tab === 'leaderboard' && (
            <Leaderboard data={standings} onRefresh={fetchStandings} loading={loadingStandings} />
          )}
          {tab === 'upload' && (
            <UploadMatch onSuccess={() => { fetchStandings(); setTab('leaderboard'); }} />
          )}
          {tab === 'chat' && <Chat />}
        </motion.div>

        <p className="text-center text-slate-600 text-xs mt-8">
          Powered by Groq · Google Sheets · ScoreKeeper
        </p>
      </div>
    </div>
  );
}
