import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Upload, MessageSquare, RefreshCw, FileDown,
  CheckCircle2, AlertCircle, ImagePlus, Send,
  Medal, Crown, ChevronUp, ChevronDown, Loader2,
  Lock, KeyRound, Eye, EyeOff, ShieldCheck, Pencil,
} from 'lucide-react';
import {
  getStandings, verifyCode, changeCode,
  extractFromImage, confirmUpload, sendChat, exportXlsx,
} from './lib/api';
import type {
  ChatMessage, ExtractedPlayer, StandingsResponse,
} from './lib/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
function rankBadge(rank: number) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-500" />;
  return <span className="text-slate-500 text-sm w-4 text-center">{rank}</span>;
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
          <Trophy className="w-5 h-5 text-yellow-400" /> Standings
        </h2>
        <div className="flex items-center gap-3">
          <a href={exportXlsx()} download="scores.xlsx"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
            <FileDown className="w-3.5 h-3.5" /> Export
          </a>
          <button onClick={() => setSortAsc(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            Total {sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button onClick={onRefresh} disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="text-center py-16 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />Loading standings...
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-800/60">
                <th className="px-3 py-3 text-left text-slate-400 font-medium w-8">#</th>
                <th className="px-3 py-3 text-left text-slate-400 font-medium">Player</th>
                {data.match_headers.map(m => (
                  <th key={m} className="px-3 py-3 text-center text-slate-400 font-medium whitespace-nowrap">{m}</th>
                ))}
                <th className="px-3 py-3 text-center text-white font-semibold">Total</th>
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
                  {data.match_headers.map(m => (
                    <td key={m} className="px-3 py-3 text-center text-slate-300">{p.matches[m] ?? 0}</td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    <span className={`font-bold text-base ${p.rank === 1 ? 'text-yellow-400' : p.rank === 2 ? 'text-slate-200' : p.rank === 3 ? 'text-amber-500' : 'text-indigo-300'}`}>
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

// ─── Upload (with code gate + verify step) ────────────────────────────────────
type UploadStep = 'code' | 'image' | 'verify' | 'done';

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
    setFile(f); setPreview(URL.createObjectURL(f)); setExtractErr('');
  };

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true); setExtractErr('');
    try {
      const { players: p } = await extractFromImage(file);
      setPlayers(p); setStep('verify');
    } catch (e: unknown) { setExtractErr(e instanceof Error ? e.message : 'Extraction failed'); }
    finally { setExtracting(false); }
  };

  const handleConfirm = async () => {
    setSaving(true); setSaveErr('');
    try {
      await confirmUpload(code, players.map(p => ({ username: p.username, points: p.points })));
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
    setPlayers([]); setCodeErr(''); setExtractErr(''); setSaveErr('');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-400" /> Upload Match
        </h2>
        <button onClick={() => setShowChangeCode(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
          <KeyRound className="w-3.5 h-3.5" /> Change Code
        </button>
      </div>

      {/* Change code panel */}
      <AnimatePresence>
        {showChangeCode && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <p className="text-slate-400 text-sm font-medium">Change Admin Code</p>
            <input type="password" value={ccOld} onChange={e => setCcOld(e.target.value)}
              placeholder="Purana / Old code"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60" />
            <input type="password" value={ccNew} onChange={e => setCcNew(e.target.value)}
              placeholder="Naya / New code"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60" />
            <button onClick={handleChangeCode} disabled={ccLoading || !ccOld || !ccNew}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40">
              {ccLoading ? 'Checking…' : 'Update Code'}
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
              <span className="font-medium">Admin Code Required</span>
            </div>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={code} onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                placeholder="Enter admin code…"
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
              {checkingCode ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : <><ShieldCheck className="w-4 h-4" /> Verify Code</>}
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
                <p className="text-slate-400">Drop scoresheet image here</p>
                <p className="text-slate-600 text-sm mt-1">or click to browse</p></>}
          </div>
          {file && <p className="text-slate-400 text-sm text-center">{file.name}</p>}
          {extractErr && <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{extractErr}</div>}
          <button onClick={handleExtract} disabled={!file || extracting}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-40 shadow-lg shadow-indigo-500/20">
            {extracting ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning image…</> : <><Upload className="w-4 h-4" /> Read Image</>}
          </button>
        </div>
      )}

      {/* Step: verify & edit */}
      {step === 'verify' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Pencil className="w-4 h-4 text-indigo-400" />
            Review extracted scores — edit any points if needed, then confirm.
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
                      {p.raw_name === '—' ? <span className="text-slate-600">not found</span> : p.raw_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" min={0}
                        value={players[i].points}
                        onChange={e => {
                          const updated = [...players];
                          updated[i] = { ...updated[i], points: parseInt(e.target.value) || 0 };
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
              ← Re-upload
            </button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-4 h-4" /> Confirm & Save</>}
            </button>
          </div>
        </motion.div>
      )}

      {/* Step: success */}
      {step === 'done' && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <p className="text-emerald-400 font-medium text-lg">Match saved successfully!</p>
          <p className="text-slate-400 text-sm">Leaderboard has been updated.</p>
          <button onClick={reset}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors">
            Upload Another Match
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
type ChatMode = 'normal' | 'awaiting_old_code' | 'awaiting_new_code';

function isChangeCodeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (t.includes('change') && t.includes('code')) ||
    (t.includes('code') && (t.includes('badal') || t.includes('update'))) ||
    t.includes('secret code') ||
    t.includes('admin code') ||
    (t.includes('naya') && t.includes('code')) ||
    t.includes('code change')
  );
}

function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'नमस्ते! 👋 Match points ke baare mein kuch bhi pucho — Hindi ya English mein.\n\nExample: "Match 3 mein sabse zyada points kisne liye?" or "Who is in last place?"\n\nAdmin code change karna ho toh bolo: "change secret code"',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('normal');
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
        addMsg('assistant', '🔐 Admin code change karna chahte ho?\nPehle purana / old code batao:');
        setChatMode('awaiting_old_code');
        return;
      }

      if (chatMode === 'awaiting_old_code') {
        const { valid } = await verifyCode(q);
        if (valid) {
          setPendingOldCode(q);
          setChatMode('awaiting_new_code');
          addMsg('assistant', '✅ Purana code sahi hai!\nAb naya / new code batao:');
        } else {
          addMsg('assistant', '❌ Galat purana code hai. Dobara try karo ya cancel karne ke liye kuch aur pucho.');
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
    <div className="flex flex-col h-[560px]">
      <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-purple-400" /> Ask About Scores
        <span className="text-xs text-slate-500 font-normal ml-1">Hindi / English</span>
      </h2>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
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
          {chatMode === 'awaiting_old_code' ? 'Purana code type karo — it will be hidden' : 'Naya code type karo — it will be hidden'}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type={isSecretStep ? 'password' : 'text'}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={
            chatMode === 'awaiting_old_code' ? 'Purana / old code…' :
            chatMode === 'awaiting_new_code' ? 'Naya / new code…' :
            'Match 2 mein mere kitne points hain? / Who leads?'
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

// ─── App ──────────────────────────────────────────────────────────────────────
type Tab = 'leaderboard' | 'upload' | 'chat';

export default function App() {
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [loadingStandings, setLoadingStandings] = useState(false);

  const fetchStandings = useCallback(async () => {
    setLoadingStandings(true);
    try { setStandings(await getStandings()); }
    catch { /* silent */ }
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
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/8 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 mb-4">
            <Trophy className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-indigo-300">Match Points Tracker</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
            ScoreKeeper
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto">
            Upload scoresheet images, track match points, ask in Hindi or English.
          </p>
        </motion.div>

        {standings && standings.players.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: 'Players', value: standings.players.length },
              { label: 'Matches', value: standings.match_headers.length },
              { label: 'Leader', value: standings.players[0]?.display_name.split(' ')[0] ?? '—' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white truncate">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
            ))}
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
          {tab === 'chat' && <Chat />}
        </motion.div>

        <p className="text-center text-slate-600 text-xs mt-8">Powered by Groq · SQLite · ScoreKeeper</p>
      </div>
    </div>
  );
}
