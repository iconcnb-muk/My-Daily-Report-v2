import { useEffect, useState } from 'react';
import { ArrowRight, Cloud, ShieldCheck } from 'lucide-react';
import { cloudConfigured, cloudSignIn, cloudSignUp, cloudResetPassword, getCloudSession, cloudConsumeRecoveryHash, cloudUpdatePassword } from './cloud';
import { AppWorkspace } from './App';

export default function CloudAuthGate() {
  const [session, setSession] = useState(getCloudSession());
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'setpassword'>('login');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!cloudConfigured) return; cloudConsumeRecoveryHash().then(value => { if (value) { setSession(value); setRecoveryMode(true); setMode('setpassword'); } }).catch(error => setMessage(error instanceof Error ? error.message : 'রিসেট লিংক যাচাই করা যায়নি')); }, []);
  if (!cloudConfigured) return <AppWorkspace />;
  if (session && !recoveryMode) return <AppWorkspace />;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setMessage(''); setBusy(true);
    try {
      if (mode === 'setpassword') { if (password.length < 8) throw new Error('পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।'); if (password !== confirm) throw new Error('দুটি পাসওয়ার্ড মিলছে না।'); await cloudUpdatePassword(password); setRecoveryMode(false); setMode('login'); setPassword(''); setConfirm(''); setMessage('পাসওয়ার্ড পরিবর্তন হয়েছে।'); }
      else if (mode === 'reset') { await cloudResetPassword(email.trim()); setMessage('পাসওয়ার্ড রিসেটের নির্দেশনা ইমেইলে পাঠানো হয়েছে।'); }
      else if (mode === 'signup') {
        if (password.length < 8) throw new Error('পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে।');
        if (password !== confirm) throw new Error('দুটি পাসওয়ার্ড মিলছে না।');
        const signedIn = await cloudSignUp(email.trim(), password);
        if (signedIn) setSession(getCloudSession()); else setMessage('অ্যাকাউন্ট তৈরি হয়েছে। ইমেইল যাচাই করে তারপর লগ ইন করুন।');
      } else { await cloudSignIn(email.trim(), password); setSession(getCloudSession()); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'অনুরোধ সম্পন্ন করা যায়নি।'); }
    finally { setBusy(false); }
  }
  return <main className="auth-screen"><section className="auth-panel"><div className="auth-brand"><span className="brand-mark"><span /><span /><span /><span /></span><span>রিপোর্টবই</span></div><span className="section-kicker"><Cloud size={14} /> নিরাপদ ক্লাউড অ্যাকাউন্ট</span><h1>{mode === 'signup' ? 'নতুন অ্যাকাউন্ট তৈরি করুন।' : mode === 'reset' ? 'পাসওয়ার্ড পুনরুদ্ধার' : mode === 'setpassword' ? 'নতুন পাসওয়ার্ড সেট করুন।' : 'আবার স্বাগতম।'}</h1><p>আপনার রিপোর্ট নিরাপদে সংরক্ষণ ও একাধিক ডিভাইসে সিঙ্ক করতে ইমেইল দিয়ে প্রবেশ করুন।</p><form onSubmit={submit}>{mode !== 'setpassword' && <label>ইমেইল<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>}{mode !== 'reset' && <label>পাসওয়ার্ড<input required type="password" minLength={8} autoComplete={mode === 'signup' || mode === 'setpassword' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="অন্তত ৮ অক্ষর" /></label>}{(mode === 'signup' || mode === 'setpassword') && <label>পাসওয়ার্ড নিশ্চিত করুন<input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}{message && <div className="auth-error" role="status">{message}</div>}<button type="submit" disabled={busy}>{busy ? 'অপেক্ষা করুন...' : mode === 'signup' ? 'অ্যাকাউন্ট তৈরি করুন' : mode === 'reset' ? 'রিসেট লিংক পাঠান' : mode === 'setpassword' ? 'পাসওয়ার্ড পরিবর্তন করুন' : 'লগ ইন করুন'} <ArrowRight size={18} /></button></form><div className="cloud-auth-links">{mode !== 'login' && mode !== 'setpassword' && <button onClick={() => { setMode('login'); setMessage(''); }}>লগ ইন</button>}{mode !== 'signup' && mode !== 'setpassword' && <button onClick={() => { setMode('signup'); setMessage(''); }}>নতুন অ্যাকাউন্ট</button>}{mode !== 'reset' && mode !== 'setpassword' && <button onClick={() => { setMode('reset'); setMessage(''); }}>পাসওয়ার্ড ভুলে গেছেন?</button>}</div><small><ShieldCheck size={14} /> পাসওয়ার্ড Supabase Auth দ্বারা সুরক্ষিত।</small></section><div className="auth-art" aria-hidden="true"><div className="auth-grid" /><span>প্রতিদিনের কাজ,<br />নিজের মতো করে।</span></div></main>;
}
