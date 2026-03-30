import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Upload, MessageSquare, RefreshCw, FileDown,
  CheckCircle2, AlertCircle, ImagePlus, Send,
  Medal, Crown, ChevronUp, ChevronDown, Loader2,
  Lock, KeyRound, Eye, EyeOff, ShieldCheck, Pencil,
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
        return;
      }
      setLoadingMatch(true);
      setError('');
      try {
        const detail = await getMatch(selectedMatchId);
        setPlayers(detail.players);
        setStatus(`${APP_TEXT.admin.loadPrefix} ${detail.match_name}.`);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : APP_TEXT.admin.loadMatchError);
        setPlayers([]);
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
type Tab = 'leaderboard' | 'upload';

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
