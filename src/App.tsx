import { Fragment, useEffect, useRef, useState } from 'react';
import { AlarmClock, ArrowRight, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Download, FileText, Link2, NotebookPen, Plus, Printer, Share2, Smartphone, Trash2, UserRound, X } from 'lucide-react';
import { benchmarks, evaluateBenchmarks, reviewMessage } from './benchmarks';
import CloudAuthGate from './CloudAuthGate';
import { cloudConfigured, cloudLoadSnapshot, cloudSaveSnapshot, cloudRole, cloudAdminUsers, cloudUpdateUserRole, cloudSignOut, cloudUpdatePassword, cloudUserId } from './cloud';

type Column = { key: string; label: string; kind: 'check' | 'number' | 'text' };
type ReportData = Record<string, Record<string, string>>;
type NoteRow = { name: string; assigned: string; contacted: string };
type NotesData = Record<string, NoteRow[]>;
type MonthlyNotes = Record<string, NotesData>;
type VisitData = Record<string, Record<string, Record<string, number>>>;
type PersonalProfile = { username: string; name: string; phone: string; email: string; address: string; occupation: string; family: string; photo: string; unit: string; ward: string };
type LocalAuth = { username: string; salt: string; hash: string };
type Page = 'report' | 'summary' | 'notes' | 'admin' | 'developer';
function ShieldIcon() { return <span aria-hidden="true">◆</span>; }
const DEFAULT_USER_ID = 'default';
const ACTIVE_USER_KEY = 'report-book-active-user-v1';
const AUTH_KEY = 'report-book-single-auth-v1';
const SESSION_KEY = 'report-book-single-session-v1';
const emptyProfile: PersonalProfile = { username: '', name: '', phone: '', email: '', address: '', occupation: '', family: '', photo: '', unit: '', ward: '' };

// The date and remarks are columns too: the printed monthly sheet has 17 in all.
const columns: Column[] = [
  { key: 'date', label: 'তারিখ', kind: 'text' },
  { key: 'quran', label: 'কুরআন অধ্যয়ন (দিন)', kind: 'check' },
  { key: 'hadith', label: 'হাদীস অধ্যয়ন (সংখ্যা)', kind: 'number' },
  { key: 'book', label: 'ইসলামী বই অধ্যয়ন (পৃষ্ঠা)', kind: 'number' },
  { key: 'literature', label: 'জামায়াতে নামাজ (ওয়াক্ত সংখ্যা)', kind: 'number' },
  { key: 'dawah', label: 'দাওয়াতি টার্গেট সাক্ষাত (কতবার)', kind: 'number' },
  { key: 'worker', label: 'কর্মী টার্গেট সাক্ষাত (কতবার)', kind: 'number' },
  { key: 'member', label: 'সদস্য (রুকন) টার্গেট সাক্ষাত (কতবার)', kind: 'number' },
  { key: 'contact', label: 'কর্মী যোগাযোগ (কতবার)', kind: 'number' },
  { key: 'booksGiven', label: 'বই বিলি (কতটি)', kind: 'number' },
  { key: 'papersGiven', label: 'পারিবারিক বৈঠক (টিক)', kind: 'check' },
  { key: 'social', label: 'সামাজিক কাজ (সংখ্যা)', kind: 'number' },
  { key: 'time', label: 'সময় দান (ঘণ্টা)', kind: 'number' },
  { key: 'collection', label: 'সফর সংখ্যা', kind: 'number' },
  { key: 'report', label: 'রিপোর্ট রাখা (দিন)', kind: 'check' },
  { key: 'regular', label: 'আত্নসমালোচনা (দিন)', kind: 'check' },
  { key: 'remarks', label: 'মন্তব্য', kind: 'text' },
];
const groups = [
  { key: 'dawah', title: 'দাওয়াতি টার্গেট', count: 5 },
  { key: 'worker', title: 'কর্মী টার্গেট', count: 4 },
  { key: 'member', title: 'সদস্য (রুকন) টার্গেট', count: 3 },
];
const visitGroups: Record<string, string> = { dawah: 'dawah', worker: 'worker', member: 'member' };
const bengali = (n: number) => new Intl.NumberFormat('bn-BD', { useGrouping: false }).format(n);
const monthName = (date: Date) => new Intl.DateTimeFormat('bn-BD', { month: 'long' }).format(date);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const localDayKey = (date: Date) => `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
const asciiDigits = (value: string) => value.replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));
function reportInputValue(column: Column, value: string): string {
  if (column.kind !== 'number') return value;
  const digits = value.replace(/[^0-9০-৯]/g, '');
  if (!digits) return digits;
  if (column.key === 'literature') return bengali(Math.min(5, Number(asciiDigits(digits))));
  if (column.key === 'time') return bengali(Math.min(24, Number(asciiDigits(digits))));
  return digits;
}
function isoDate(value: string): string {
  const plain = asciiDigits(value);
  const parts = plain.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  const iso = parts ? `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : plain;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? iso : '';
}
function displayDate(value: string): string {
  const iso = isoDate(value);
  if (!iso) return value;
  const [year, month, day] = iso.split('-').map(Number);
  return `${bengali(day).padStart(2, '০')}/${bengali(month).padStart(2, '০')}/${bengali(year)}`;
}
function DateField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const picker = useRef<HTMLInputElement>(null);
  return <span className="formatted-date-field"><span className={value ? 'date-value' : 'date-placeholder'}>{value ? displayDate(value) : 'দিন/মাস/বছর'}</span><CalendarDays size={15} aria-hidden="true" /><input ref={picker} type="date" aria-label={label} value={isoDate(value)} onChange={event => onChange(event.target.value)} onClick={() => { if (typeof picker.current?.showPicker === 'function') picker.current.showPicker(); }} /></span>;
}
function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
async function passwordHash(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(salt.match(/.{2}/g) || [], part => parseInt(part, 16)), iterations: 150000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}
const makeSalt = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
const userKey = (id: string, key: string) => `report-book-user-${id}-${key}`;
function readUserStored<T>(id: string, key: string, legacyKey: string, fallback: T): T {
  const scopedKey = userKey(id, key);
  if (localStorage.getItem(scopedKey) !== null) return readStored(scopedKey, fallback);
  return id === DEFAULT_USER_ID ? readStored(legacyKey, fallback) : fallback;
}
function initialNotes(id: string): MonthlyNotes {
  const stored = readUserStored<MonthlyNotes>(id, 'monthly-notes', 'report-book-monthly-notes-v2', {});
  if (localStorage.getItem(userKey(id, 'monthly-notes')) !== null || Object.keys(stored).length) return stored;
  const legacy = id === DEFAULT_USER_ID ? readStored<NotesData>('report-book-notes-v1', {}) : {};
  return Object.keys(legacy).length ? { [monthKey(new Date())]: legacy } : {};
}
function carryNotes(month: string, all: MonthlyNotes): NotesData {
  const previousKey = Object.keys(all).filter(key => key < month).sort().at(-1);
  if (!previousKey) return {};
  return Object.fromEntries(Object.entries(all[previousKey]).map(([group, rows]) => [group, rows.map(row => ({ name: row.name, assigned: row.assigned, contacted: '' }))]));
}
function validContactDays(value: string, days: number): string {
  const seen = new Set<number>();
  return value.split(/[,，،]/).map(part => Number(part.trim().replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit))))).filter(day => {
    if (!Number.isInteger(day) || day < 1 || day > days || seen.has(day)) return false;
    seen.add(day);
    return true;
  }).map(bengali).join(', ');
}
function playReminderSound() {
  try {
    const context = new AudioContext();
    void context.resume().then(() => {
      [0, 0.32, 0.64].forEach(offset => {
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 760;
        volume.gain.setValueAtTime(0.0001, context.currentTime + offset);
        volume.gain.exponentialRampToValueAtTime(0.22, context.currentTime + offset + 0.02);
        volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.22);
        oscillator.connect(volume).connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + 0.23);
      });
      window.setTimeout(() => void context.close(), 1300);
    });
  } catch { /* Audio may be blocked until the user interacts with the app. */ }
}
function initialReport(id: string): ReportData {
  const existing = readUserStored<ReportData>(id, 'sheet', 'report-book-sheet-v1', {});
  if (localStorage.getItem(userKey(id, 'sheet')) !== null || Object.keys(existing).length) return Object.fromEntries(Object.entries(existing).map(([date, row]) => [date, {
    ...row,
    ...(row.literature ? { literature: reportInputValue(columns[4], row.literature) } : {}),
    ...(row.time ? { time: reportInputValue(columns[12], row.time) } : {}),
  }]));
  const old = id === DEFAULT_USER_ID ? readStored<Record<string, { completed?: string[]; note?: string }>>('report-book-entries', {}) : {};
  const migrated: ReportData = {};
  Object.entries(old).forEach(([day, value]) => {
    const row: Record<string, string> = {};
    if (value.completed?.includes('quran')) row.quran = '✓';
    if (value.completed?.includes('study')) row.book = '১';
    if (value.completed?.includes('dawah')) row.dawah = '১';
    if (value.completed?.includes('member')) row.member = '১';
    if (value.completed?.includes('work')) row.social = '১';
    if (value.note) row.remarks = value.note;
    if (Object.keys(row).length) migrated[day] = row;
  });
  return migrated;
}

export function AppWorkspace() {
  const [page, setPage] = useState<Page>('report');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  // Keep the previously selected local record when upgrading from the old multi-profile version.
  const localLegacyUserId = readStored<string>(ACTIVE_USER_KEY, DEFAULT_USER_ID);
  const [activeUserId] = useState(() => cloudUserId() || localLegacyUserId);
  // On first cloud sign-in, seed the new account from this browser's prior local profile unless cloud data already exists.
  const legacyDataUserId = cloudConfigured ? localLegacyUserId : activeUserId;
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [auth, setAuth] = useState<LocalAuth | null>(() => readStored(AUTH_KEY, null));
  const [loggedIn, setLoggedIn] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'yes');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [report, setReport] = useState<ReportData>(() => initialReport(legacyDataUserId));
  const [monthlyNotes, setMonthlyNotes] = useState<MonthlyNotes>(() => initialNotes(legacyDataUserId));
  const [visits, setVisits] = useState<VisitData>(() => readUserStored(legacyDataUserId, 'visits', 'report-book-visits-v1', {}));
  const [visitPicker, setVisitPicker] = useState<{ day: number; group: string } | null>(null);
  const [dues, setDues] = useState<Record<string, string>>(() => readUserStored(legacyDataUserId, 'dues', 'report-book-dues-v1', {}));
  const [duesDates, setDuesDates] = useState<Record<string, string>>(() => readUserStored(legacyDataUserId, 'dues-dates', 'report-book-dues-dates-v1', {}));
  const [profile, setProfile] = useState<PersonalProfile>(() => ({ ...emptyProfile, ...readUserStored(legacyDataUserId, 'profile', 'report-book-profile-v1', emptyProfile) }));
  const [profileDraft, setProfileDraft] = useState<PersonalProfile>(profile);
  const [newPassword, setNewPassword] = useState('');
  const [candidateType, setCandidateType] = useState(() => {
    const saved = readUserStored<string>(legacyDataUserId, 'candidate-type', 'report-book-candidate-type-v1', 'সদস্য (রুকন)');
    return saved === 'সদস্য (রুকন) প্রার্থী' ? saved : 'সদস্য (রুকন)';
  });
  const [notesComment, setNotesComment] = useState(() => readUserStored(legacyDataUserId, 'notes-comment', 'report-book-notes-comment-v1', ''));
  const [signature, setSignature] = useState(() => readUserStored(legacyDataUserId, 'signature', 'report-book-signature-v1', ''));
  const [signatureDates, setSignatureDates] = useState<Record<string, string>>(() => readUserStored(legacyDataUserId, 'signature-dates', 'report-book-signature-dates-v1', {}));
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [quickDay, setQuickDay] = useState(new Date().getDate());
  const [reminders, setReminders] = useState<string[]>(() => readUserStored(legacyDataUserId, 'reminders', 'report-book-reminders-v1', []));
  const [reminderDraft, setReminderDraft] = useState('20:00');
  const [reminderSettingsOpen, setReminderSettingsOpen] = useState(false);
  const [ringingReminder, setRingingReminder] = useState<string | null>(null);
  const [submittedDays, setSubmittedDays] = useState<Record<string, boolean>>(() => readUserStored(legacyDataUserId, 'submitted-days', 'report-book-submitted-days-v1', {}));
  const [benchmarkExtras, setBenchmarkExtras] = useState<Record<string, Record<string, string>>>(() => readStored(userKey(legacyDataUserId, 'benchmark-extras'), {}));
  const [reviewNotice, setReviewNotice] = useState<{ title: string; message: string } | null>(null);
  const [cloudLoaded, setCloudLoaded] = useState(!cloudConfigured);
  const [cloudStatus, setCloudStatus] = useState(cloudConfigured ? 'সিঙ্ক হচ্ছে…' : 'লোকাল মোড');
  const [accountRole, setAccountRole] = useState('user');
  const [adminUsers, setAdminUsers] = useState<Array<{ id: string; email: string; role: string; created_at: string }>>([]);
  const [adminError, setAdminError] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const currentMonth = monthKey(month);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const notes = monthlyNotes[currentMonth] || carryNotes(currentMonth, monthlyNotes);

  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'sheet'), JSON.stringify(report)); }, [report, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'monthly-notes'), JSON.stringify(monthlyNotes)); }, [monthlyNotes, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'visits'), JSON.stringify(visits)); }, [visits, activeUserId]);
  useEffect(() => {
    setMonthlyNotes(previous => previous[currentMonth] ? previous : { ...previous, [currentMonth]: carryNotes(currentMonth, previous) });
  }, [currentMonth]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'dues'), JSON.stringify(dues)); }, [dues, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'dues-dates'), JSON.stringify(duesDates)); }, [duesDates, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'profile'), JSON.stringify(profile)); }, [profile, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'candidate-type'), JSON.stringify(candidateType)); }, [candidateType, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'notes-comment'), JSON.stringify(notesComment)); }, [notesComment, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'signature'), JSON.stringify(signature)); }, [signature, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'signature-dates'), JSON.stringify(signatureDates)); }, [signatureDates, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'reminders'), JSON.stringify(reminders)); }, [reminders, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'submitted-days'), JSON.stringify(submittedDays)); }, [submittedDays, activeUserId]);
  useEffect(() => { localStorage.setItem(userKey(activeUserId, 'benchmark-extras'), JSON.stringify(benchmarkExtras)); }, [benchmarkExtras, activeUserId]);
  useEffect(() => {
    if (!cloudConfigured) return;
    let alive = true;
    (async () => {
      try {
        const saved = await cloudLoadSnapshot();
        if (saved && alive) {
          if (saved.report) setReport(saved.report as ReportData);
          if (saved.monthlyNotes) setMonthlyNotes(saved.monthlyNotes as MonthlyNotes);
          if (saved.visits) setVisits(saved.visits as VisitData);
          if (saved.dues) setDues(saved.dues as Record<string, string>);
          if (saved.duesDates) setDuesDates(saved.duesDates as Record<string, string>);
          if (saved.profile) setProfile(saved.profile as PersonalProfile);
          if (saved.candidateType) setCandidateType(saved.candidateType as string);
          if (saved.notesComment !== undefined) setNotesComment(saved.notesComment as string);
          if (saved.signature !== undefined) setSignature(saved.signature as string);
          if (saved.signatureDates) setSignatureDates(saved.signatureDates as Record<string, string>);
          if (saved.reminders) setReminders(saved.reminders as string[]);
          if (saved.submittedDays) setSubmittedDays(saved.submittedDays as Record<string, boolean>);
          if (saved.benchmarkExtras) setBenchmarkExtras(saved.benchmarkExtras as Record<string, Record<string, string>>);
        }
        if (alive) { setCloudLoaded(true); setCloudStatus('ক্লাউডে সংযুক্ত'); }
      } catch (error) { if (alive) setCloudStatus(error instanceof Error ? `সিঙ্ক ত্রুটি: ${error.message}` : 'সিঙ্ক ত্রুটি'); }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (cloudConfigured) cloudRole().then(setAccountRole).catch(() => setAccountRole('user')); }, []);
  useEffect(() => { if (!cloudConfigured || (page !== 'admin') || !['admin','developer'].includes(accountRole)) return; let active = true; setAdminLoading(true); cloudAdminUsers().then(rows => { if (active) setAdminUsers(rows); }).catch(error => { if (active) setAdminError(error instanceof Error ? error.message : 'তালিকা আনা যায়নি'); }).finally(() => { if (active) setAdminLoading(false); }); return () => { active = false; }; }, [page, accountRole]);
  useEffect(() => {
    if (!cloudConfigured || !cloudLoaded) return;
    const timer = window.setTimeout(() => {
      setCloudStatus('ক্লাউডে সংরক্ষণ হচ্ছে…');
      cloudSaveSnapshot({ report, monthlyNotes, visits, dues, duesDates, profile, candidateType, notesComment, signature, signatureDates, reminders, submittedDays, benchmarkExtras })
        .then(() => setCloudStatus('সর্বশেষ পরিবর্তন ক্লাউডে সংরক্ষিত'))
        .catch(error => setCloudStatus(error instanceof Error ? `সিঙ্ক ত্রুটি: ${error.message}` : 'সিঙ্ক ত্রুটি'));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [cloudLoaded, report, monthlyNotes, visits, dues, duesDates, profile, candidateType, notesComment, signature, signatureDates, reminders, submittedDays, benchmarkExtras]);
  useEffect(() => {
    if (!reminders.length) return;
    const checkReminders = () => {
      const now = new Date();
      const dateKey = localDayKey(now);
      const minute = now.getHours() * 60 + now.getMinutes();
      const fired = readUserStored<Record<string, boolean>>(activeUserId, 'reminder-fired', 'report-book-reminder-fired-v1', {});
      let changed = false;
      reminders.forEach(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const due = hours * 60 + minutes;
        const reminderKey = `${dateKey}|${time}`;
        if (minute < due || minute > due + 2 || fired[reminderKey]) return;
        fired[reminderKey] = true;
        changed = true;
        // Any saved entry for today counts as an already-written daily report.
        if (submittedDays[dateKey] || Object.values(report[dateKey] || {}).some((value: string) => value?.trim())) return;
        setRingingReminder(time);
        playReminderSound();
        if ('Notification' in window && Notification.permission === 'granted') {
          const notification = { body: 'আজকের রিপোর্ট এখনও লেখা হয়নি।', icon: '/icon.svg', tag: reminderKey };
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            void navigator.serviceWorker.ready.then(registration => registration.showNotification('রিপোর্ট লেখার সময়', notification)).catch(() => {});
          } else {
            try { new Notification('রিপোর্ট লেখার সময়', notification); } catch { /* In-app alert remains available. */ }
          }
        }
      });
      if (changed) localStorage.setItem(userKey(activeUserId, 'reminder-fired'), JSON.stringify(Object.fromEntries(Object.entries(fired).filter(([key]) => key.slice(0, 10) >= dateKey))));
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 15000);
    document.addEventListener('visibilitychange', checkReminders);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', checkReminders); };
  }, [reminders, report, submittedDays, activeUserId]);
  useEffect(() => {
    if (!loggedIn) return;
    const checkStandards = () => {
      const now = new Date();
      const day = now.getDate();
      if (day !== 20 && day !== 25 || now.getHours() < 20) return;
      const stamp = `${localDayKey(now)}-standards`;
      const firedKey = userKey(activeUserId, 'benchmark-notified');
      const fired = readStored<Record<string, boolean>>(firedKey, {});
      if (fired[stamp]) return;
      localStorage.setItem(firedKey, JSON.stringify({ ...fired, [stamp]: true }));
      const currentKey = monthKey(now);
      const rows = { ...report };
      Object.entries(submittedDays).forEach(([key, saved]) => {
        if (saved) rows[key] = { ...rows[key], report: rows[key]?.report || '✓' };
      });
      const results = evaluateBenchmarks(new Date(now.getFullYear(), now.getMonth(), 1), day, rows, benchmarkExtras[currentKey] || {});
      const { comment, advice } = reviewMessage(results);
      const title = `${bengali(day)} তারিখের মানদণ্ড পর্যালোচনা`;
      setReviewNotice({ title, message: `${comment} ${advice}` });
      if ('Notification' in window && Notification.permission === 'granted') {
        const notification = { body: `${comment} ${advice}`.slice(0, 180), icon: '/icon.svg', tag: stamp };
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          void navigator.serviceWorker.ready.then(registration => registration.showNotification(title, notification)).catch(() => {});
        } else {
          try { new Notification(title, notification); } catch { /* The in-app review is still shown. */ }
        }
      }
    };
    checkStandards();
    const timer = window.setInterval(checkStandards, 30000);
    document.addEventListener('visibilitychange', checkStandards);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', checkStandards); };
  }, [activeUserId, loggedIn, report, submittedDays, benchmarkExtras]);
  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function changeMonth(amount: number) {
    setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + amount, 1));
    setQuickDay(1);
  }
  function openQuickEntry() {
    const now = new Date();
    setQuickDay(now.getFullYear() === month.getFullYear() && now.getMonth() === month.getMonth() ? now.getDate() : 1);
    setQuickEntryOpen(true);
  }
  async function handleAuthSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAuthError('');
    if (!auth && (authPassword.length < 6 || authPassword !== authConfirm)) {
      setAuthError('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে এবং দুবার একইভাবে লিখতে হবে।');
      return;
    }
    setAuthBusy(true);
    try {
      if (!auth) {
        const username = authUsername.trim();
        if (!username) { setAuthError('ইউজার নেম লিখুন।'); return; }
        const salt = makeSalt();
        const record = { username, salt, hash: await passwordHash(authPassword, salt) };
        localStorage.setItem(AUTH_KEY, JSON.stringify(record));
        setAuth(record);
        setProfile(previous => ({ ...previous, username }));
      } else if (authUsername.trim() !== auth.username || await passwordHash(authPassword, auth.salt) !== auth.hash) {
        setAuthError('ইউজার নেম বা পাসওয়ার্ড সঠিক নয়।');
        return;
      }
      sessionStorage.setItem(SESSION_KEY, 'yes');
      setLoggedIn(true);
      setAuthPassword('');
      setAuthConfirm('');
    } catch { setAuthError('লগ ইন করা যায়নি। নিরাপদ HTTPS সংযোগে আবার চেষ্টা করুন।'); }
    finally { setAuthBusy(false); }
  }
  function logout() {
    if (cloudConfigured) { void cloudSignOut().finally(() => window.location.reload()); return; }
    sessionStorage.removeItem(SESSION_KEY);
    setLoggedIn(false);
    setAuthUsername('');
    setAuthPassword('');
    setProfileEditorOpen(false);
  }
  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setToast('একটি ছবি নির্বাচন করুন'); return; }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(); });
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 480 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      setProfileDraft(previous => ({ ...previous, photo: canvas.toDataURL('image/jpeg', 0.75) }));
    } catch { setToast('ছবিটি যোগ করা যায়নি'); }
    finally { URL.revokeObjectURL(url); }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const username = profileDraft.username.trim();
    if (!username) { setToast('ইউজার নেম লিখুন'); return; }
    if (newPassword && newPassword.length < (cloudConfigured ? 8 : 6)) { setToast(`নতুন পাসওয়ার্ড অন্তত ${cloudConfigured ? 8 : 6} অক্ষরের হতে হবে`); return; }
    try {
      if (cloudConfigured && newPassword) await cloudUpdatePassword(newPassword);
      if (auth && !cloudConfigured) {
        const salt = newPassword ? makeSalt() : auth.salt;
        const record = { username, salt, hash: newPassword ? await passwordHash(newPassword, salt) : auth.hash };
        localStorage.setItem(AUTH_KEY, JSON.stringify(record));
        setAuth(record);
      }
      setProfile({ ...profileDraft, username });
      setNewPassword('');
      setProfileEditorOpen(false);
      setToast('প্রোফাইল সংরক্ষিত হয়েছে');
    } catch { setToast('প্রোফাইল সংরক্ষণ করা যায়নি'); }
  }
  async function addReminder() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminderDraft)) return;
    if (reminders.includes(reminderDraft)) { setToast('এই সময়ের এলার্ম আগে থেকেই আছে'); return; }
    setReminders(previous => [...previous, reminderDraft].sort());
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* In-app alarm still works. */ }
    }
    setToast('এলার্ম সেট হয়েছে');
  }
  function updateBenchmarkExtra(key: string, value: string) {
    const digits = value.replace(/[^0-9০-৯]/g, '');
    const normalized = key === 'income' || !digits ? digits : bengali(Math.min(100, Number(asciiDigits(digits))));
    setBenchmarkExtras(previous => ({ ...previous, [currentMonth]: { ...previous[currentMonth], [key]: normalized } }));
  }
  async function enableReviewNotifications() {
    if (!('Notification' in window)) { setToast('এই ব্রাউজারে নোটিফিকেশন সমর্থিত নয়'); return; }
    try {
      const permission = await Notification.requestPermission();
      setToast(permission === 'granted' ? 'পর্যালোচনার নোটিফিকেশন চালু হয়েছে' : 'নোটিফিকেশন অনুমতি দেওয়া হয়নি');
    } catch { setToast('নোটিফিকেশন চালু করা যায়নি'); }
  }
  function updateCell(day: number, key: string, value: string) {
    const dateKey = `${currentMonth}-${String(day).padStart(2, '0')}`;
    setReport(previous => ({ ...previous, [dateKey]: { ...previous[dateKey], [key]: value } }));
  }
  function updateNote(group: string, index: number, field: keyof NoteRow, value: string) {
    setMonthlyNotes(previous => {
      const current = previous[currentMonth] || carryNotes(currentMonth, previous);
      const rows = [...(current[group] || [])];
      rows[index] = { ...(rows[index] || { name: '', assigned: '', contacted: '' }), [field]: value };
      return { ...previous, [currentMonth]: { ...current, [group]: rows } };
    });
  }
  function changeVisit(day: number, group: string, index: number, direction: number) {
    const dateKey = `${currentMonth}-${String(day).padStart(2, '0')}`;
    const groupVisits: Record<string, number> = visits[dateKey]?.[group] || {};
    const nextCount = Math.max(0, (groupVisits[index] || 0) + direction);
    const nextGroupVisits: Record<string, number> = { ...groupVisits, [index]: nextCount };
    const total = Object.values(nextGroupVisits).reduce((sum, count) => sum + count, 0);
    setVisits(previous => ({ ...previous, [dateKey]: { ...previous[dateKey], [group]: nextGroupVisits } }));
    setReport(previous => ({ ...previous, [dateKey]: { ...previous[dateKey], [group]: total ? bengali(total) : '' } }));
    setMonthlyNotes(previous => {
      const current = previous[currentMonth] || carryNotes(currentMonth, previous);
      const rows = [...(current[group] || [])];
      const row = rows[index] || { name: '', assigned: '', contacted: '' };
      const recordedDays = validContactDays(row.contacted, days).split(', ').filter(Boolean).map(value => Number(asciiDigits(value)));
      const updatedDays = nextCount ? [...recordedDays, day] : recordedDays.filter(value => value !== day);
      rows[index] = { ...row, contacted: [...new Set(updatedDays)].sort((a, b) => a - b).map(bengali).join(', ') };
      return { ...previous, [currentMonth]: { ...current, [group]: rows } };
    });
  }
  const monthlyRows = Array.from({ length: 31 }, (_, i) => report[`${currentMonth}-${String(i + 1).padStart(2, '0')}`] || {});
  const totals = columns.map(column => column.kind === 'number'
    ? monthlyRows.reduce((sum, row) => sum + (Number(row[column.key]?.replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))) || 0), 0)
    : monthlyRows.filter(row => !!row[column.key]).length);
  const now = new Date();
  const elapsed = currentMonth < monthKey(now) ? days : currentMonth === monthKey(now) ? Math.min(now.getDate(), days) : 0;
  const reviewRows = { ...report };
  Object.entries(submittedDays).forEach(([key, saved]) => {
    if (saved) reviewRows[key] = { ...reviewRows[key], report: reviewRows[key]?.report || '✓' };
  });
  const assessment = evaluateBenchmarks(month, elapsed, reviewRows, benchmarkExtras[currentMonth] || {});
  const finalReview = reviewMessage(assessment, true);
  const income = Number(asciiDigits(benchmarkExtras[currentMonth]?.income || '')) || 0;
  const paid = Number(asciiDigits(dues[currentMonth] || '')) || 0;
  const paidDate = isoDate(duesDates[currentMonth] || '');
  const lastThreeMonths = Array.from({ length: 3 }, (_, offset) => monthKey(new Date(month.getFullYear(), month.getMonth() - offset, 1)));
  const threeMonthsOverdue = lastThreeMonths.every(key => Object.keys(report).some(day => day.startsWith(key)) && !dues[key]);
  const duesMessages: string[] = [];
  if (threeMonthsOverdue) duesMessages.push('তিন মাসের ইয়ানত বাকি আছে; দ্রুত নিয়মিত করুন।');
  if (!paid) duesMessages.push('এই মাসের ইয়ানত আদায়ের তথ্য যোগ করুন।');
  else if (!paidDate) duesMessages.push('ইয়ানত আদায়ের তারিখ যোগ করুন।');
  else if (Number(paidDate.slice(-2)) > 7) duesMessages.push('ইয়ানত মাসের প্রথম সপ্তাহে আদায়ের চেষ্টা করুন।');
  if (income && paid < income * 0.05) duesMessages.push('ইয়ানত আয়ের অন্তত ৫% রাখার চেষ্টা করুন।');
  const duesAdvice = duesMessages.join(' ') || 'ইয়ানত আদায়ের ধারাবাহিকতা বজায় রাখুন।';
  const reportText = `আমার ব্যক্তিগত\n${candidateType} রিপোর্ট\nনাম: ${profile.name}\nইউজার নেম: ${profile.username}\nইউনিট: ${profile.unit}  ওয়ার্ড: ${profile.ward}\nমাস: ${monthName(month)}  সন: ${bengali(month.getFullYear())}\n\n${columns.map(c => c.label).join(' | ')}\n${Array.from({ length: days }, (_, i) => [bengali(i + 1), ...columns.slice(1).map(c => monthlyRows[i][c.key] || '')].join(' | ')).join('\n')}\nমোট: ${totals.slice(1).map(bengali).join(' | ')}\nমাসিক ইয়ানত আদায়: ${dues[currentMonth] || ''}\nআদায়ের তারিখ: ${displayDate(duesDates[currentMonth] || '')}`;

  async function copyLink() {
    try { await navigator.clipboard.writeText(location.href); setToast('অ্যাপের লিংক কপি হয়েছে'); }
    catch { setToast('লিংক কপি করা যায়নি'); }
    setMenuOpen(false);
  }
  async function shareReport() {
    try {
      if (navigator.share) await navigator.share({ title: `${monthName(month)} মাসের রিপোর্ট`, text: reportText });
      else { await navigator.clipboard.writeText(reportText); setToast('রিপোর্ট কপি হয়েছে'); }
    } catch (error) { if ((error as Error).name !== 'AbortError') setToast('শেয়ার করা যায়নি'); }
  }
  async function sharePdf() {
    if (creatingPdf) return;
    const isSummary = page === 'summary';
    const paper = isSummary
      ? document.querySelector<HTMLElement>('.summary-form')
      : document.getElementById('full-report-paper');
    if (!paper) { setToast('রিপোর্ট পাওয়া যায়নি, আবার চেষ্টা করুন'); return; }

    // Open within the click gesture so mobile browsers do not block the PDF viewer.
    const viewer = window.open('', '_blank');
    if (viewer) {
      viewer.document.title = 'PDF তৈরি হচ্ছে';
      viewer.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px">PDF তৈরি হচ্ছে...</p>';
    }
    setCreatingPdf(true);

    let captureRoot: HTMLElement = paper;
    let temporaryStage: HTMLElement | null = null;
    try {
      if (isSummary) {
        // The summary PDF must contain both the monthly totals and benchmark review.
        temporaryStage = document.createElement('div');
        temporaryStage.className = 'pdf-export-stage';
        const summary = document.querySelector<HTMLElement>('.summary-form');
        const benchmarks = document.querySelector<HTMLElement>('.benchmark-section');
        if (!summary || !benchmarks) throw new Error('Summary sections are missing');
        for (const source of [summary, benchmarks]) {
          const clone = source.cloneNode(true) as HTMLElement;
          const originals = source.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea');
          const copies = clone.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea');
          originals.forEach((control, index) => {
            const copy = copies[index];
            if (!copy) return;
            if (control instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
              copy.value = control.value;
              copy.setAttribute('value', control.value);
              copy.checked = control.checked;
            } else if (control instanceof HTMLSelectElement && copy instanceof HTMLSelectElement) {
              copy.value = control.value;
              Array.from(copy.options).forEach(option => { option.selected = option.value === control.value; });
            } else if (control instanceof HTMLTextAreaElement && copy instanceof HTMLTextAreaElement) {
              copy.value = control.value;
              copy.textContent = control.value;
            }
          });
          temporaryStage.appendChild(clone);
        }
        document.body.appendChild(temporaryStage);
        captureRoot = temporaryStage;
      } else {
        paper.classList.add('pdf-capture');
      }

      await document.fonts.ready;
      const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const canvas = await toCanvas(captureRoot, {
        backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true,
        width: isSummary ? 1050 : undefined,
        style: isSummary ? { width: '1050px', maxWidth: '1050px', background: '#ffffff' } : undefined,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const margin = 8;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const scale = printableWidth / canvas.width;
      const sliceHeight = Math.max(1, Math.floor(printableHeight / scale));
      let sourceY = 0;
      let pageIndex = 0;
      while (sourceY < canvas.height) {
        const height = Math.min(sliceHeight, canvas.height - sourceY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = height;
        const context = pageCanvas.getContext('2d');
        if (!context) throw new Error('Could not create PDF page');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(canvas, 0, sourceY, canvas.width, height, 0, 0, canvas.width, height);
        if (pageIndex > 0) pdf.addPage();
        const image = pageCanvas.toDataURL('image/jpeg', 0.94);
        pdf.addImage(image, 'JPEG', margin, margin, printableWidth, height * scale, undefined, 'FAST');
        sourceY += height;
        pageIndex += 1;
      }

      const filename = `${isSummary ? 'monthly-summary' : 'monthly-report'}-${currentMonth}.pdf`;
      const url = URL.createObjectURL(pdf.output('blob'));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      if (viewer && !viewer.closed) viewer.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
      setToast(viewer ? 'PDF ডাউনলোড হয়েছে এবং নতুন ট্যাবে খুলেছে' : 'PDF ডাউনলোড হয়েছে, ফাইলটি খুলুন');
    } catch (error) {
      viewer?.close();
      console.error('PDF export failed:', error);
      setToast('PDF তৈরি করা যায়নি, আবার চেষ্টা করুন');
    } finally {
      paper.classList.remove('pdf-capture');
      temporaryStage?.remove();
      setCreatingPdf(false);
    }
  }
  function downloadReport() {
    const text = page !== 'notes' ? reportText : `আমার ব্যক্তিগত\nপ্রয়োজনীয় নোট\nমাস: ${monthName(month)} ${bengali(month.getFullYear())}\n\n${groups.map(group => `${group.title}\n${Array.from({ length: group.count }, (_, i) => { const row = notes[group.key]?.[i]; return `${bengali(i + 1)}। ${row?.name || ''} | ${displayDate(row?.assigned || '')} | ${row?.contacted || ''}`; }).join('\n')}`).join('\n\n')}\nদায়িত্বশীলের মন্তব্য: ${notesComment}\nস্বাক্ষর: ${signature}\nতারিখ: ${displayDate(signatureDates[currentMonth] || '')}`;
    const url = URL.createObjectURL(new Blob(['\ufeff', text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${page === 'notes' ? 'notes' : 'monthly-report'}-${currentMonth}.txt`; a.click(); URL.revokeObjectURL(url);
    setToast('ফাইল ডাউনলোড হয়েছে'); setMenuOpen(false);
  }
  async function installApp() {
    if (installPrompt) { await installPrompt.prompt(); setInstallPrompt(null); }
    else setInstallHelp(true);
    setMenuOpen(false);
  }

  if (!cloudConfigured && (!auth || !loggedIn)) return <main className="auth-screen"><div className="auth-panel"><div className="auth-brand"><span className="brand-mark"><span /><span /><span /><span /></span><span>রিপোর্টবই</span></div><span className="section-kicker">শুধু আপনার জন্য</span><h1>{auth ? 'আবার স্বাগতম।' : 'নিজের প্রোফাইল তৈরি করুন।'}</h1><p>{auth ? 'আপনার ব্যক্তিগত রিপোর্টে যেতে লগ ইন করুন।' : 'একজন ব্যবহারকারীর জন্য এই ডিভাইসে ব্যক্তিগত প্রোফাইল ও রিপোর্ট রাখুন।'}</p><form onSubmit={handleAuthSubmit}><label>ইউজার নেম<input required autoComplete="username" value={authUsername} onChange={event => setAuthUsername(event.target.value)} placeholder="আপনার ইউজার নেম" /></label><label>পাসওয়ার্ড<input required type="password" autoComplete={auth ? 'current-password' : 'new-password'} value={authPassword} onChange={event => setAuthPassword(event.target.value)} placeholder={auth ? 'পাসওয়ার্ড লিখুন' : 'অন্তত ৬ অক্ষর'} /></label>{!auth && <label>পাসওয়ার্ড নিশ্চিত করুন<input required type="password" autoComplete="new-password" value={authConfirm} onChange={event => setAuthConfirm(event.target.value)} placeholder="পাসওয়ার্ড আবার লিখুন" /></label>}{authError && <div className="auth-error" role="alert">{authError}</div>}<button type="submit" disabled={authBusy}>{authBusy ? 'অপেক্ষা করুন...' : auth ? 'লগ ইন করুন' : 'প্রোফাইল তৈরি করুন'} <ArrowRight size={18} /></button></form><small>তথ্য ও পাসওয়ার্ড এই ব্রাউজারেই থাকে। পাসওয়ার্ড ভুলে গেলে অনলাইনে পুনরুদ্ধারের ব্যবস্থা নেই।</small></div><div className="auth-art" aria-hidden="true"><div className="auth-grid" /><span>প্রতিদিনের কাজ,<br />নিজের মতো করে।</span></div></main>;

  return <div className="app-shell sheet-app">
    <header className="site-header"><div className="header-inner">
      <button className="brand" onClick={() => setPage('report')} aria-label="রিপোর্ট বই"><span className="brand-mark"><span /><span /><span /><span /></span><span>রিপোর্ট<span className="brand-light">বই</span></span></button>
      <nav className="desktop-nav" aria-label="পৃষ্ঠা"><button className={page === 'report' ? 'nav-active' : ''} onClick={() => setPage('report')}>মাসিক রিপোর্ট</button><button className={page === 'summary' ? 'nav-active' : ''} onClick={() => setPage('summary')}>সংক্ষিপ্ত রিপোর্ট</button><button className={page === 'notes' ? 'nav-active' : ''} onClick={() => setPage('notes')}>প্রয়োজনীয় নোট</button></nav>
      <div className="header-actions"><button className="user-header-button" onClick={() => { setProfileDraft({ ...profile }); setProfileEditorOpen(true); }} aria-label="আমার প্রোফাইল খুলুন">{profile.photo ? <img className="header-avatar" src={profile.photo} alt="" /> : <UserRound size={18} />}<span>{profile.name || profile.username || 'আমার প্রোফাইল'}</span></button><button className="reminder-header-button" onClick={() => setReminderSettingsOpen(true)} aria-label={`রিপোর্টের এলার্ম, ${bengali(reminders.length)}টি সেট করা আছে`}><Bell size={19} />{reminders.length > 0 && <span>{bengali(reminders.length)}</span>}</button><button className="header-share" onClick={copyLink}><Link2 size={17} /><span>লিংক কপি</span></button><button className="icon-button header-more" onClick={() => setMenuOpen(!menuOpen)} aria-label="আরও অপশন"><span className="more-dots">•••</span></button>{menuOpen && <div className="dropdown">{accountRole === 'admin' || accountRole === 'developer' ? <button onClick={() => { setPage('admin'); setMenuOpen(false); }}><UserRound size={17} /> অ্যাডমিন ড্যাশবোর্ড</button> : null}{accountRole === 'admin' || accountRole === 'developer' ? <button onClick={() => { setPage('developer'); setMenuOpen(false); }}><ShieldIcon /> ডেভেলপার মেনু</button> : null}<button onClick={copyLink}><Copy size={17} /> অ্যাপের লিংক কপি</button><button onClick={() => { setMenuOpen(false); sharePdf(); }}><Share2 size={17} /> {page === 'summary' ? 'সংক্ষিপ্ত রিপোর্ট PDF' : 'পুরো রিপোর্ট PDF'}</button><button onClick={downloadReport}><Download size={17} /> টেক্সট ডাউনলোড</button><button onClick={() => { setMenuOpen(false); shareReport(); }}><Copy size={17} /> রিপোর্টের লেখা শেয়ার</button><button onClick={() => { window.print(); setMenuOpen(false); }}><Printer size={17} /> প্রিন্ট করুন</button><button onClick={installApp}><Smartphone size={17} /> হোম স্ক্রিনে রাখুন</button></div>}</div>
    </div></header>
    <main className="sheet-main">
      {cloudConfigured && <div className="cloud-status" role="status"><span className={cloudStatus.includes('ত্রুটি') ? 'cloud-dot error' : 'cloud-dot'} />{cloudStatus}{cloudStatus.includes('ত্রুটি') && <button type="button" onClick={() => window.location.reload()}>আবার চেষ্টা করুন</button>}</div>}
      <div className="sheet-toolbar"><div><span className="section-kicker">আমার ব্যক্তিগত</span><h1>{page === 'report' ? 'মাসিক রিপোর্ট' : page === 'summary' ? 'সংক্ষিপ্ত রিপোর্ট' : page === 'notes' ? 'প্রয়োজনীয় নোট' : page === 'admin' ? 'অ্যাডমিন ড্যাশবোর্ড' : 'ডেভেলপার কন্ট্রোল'}</h1><p>{page === 'report' ? 'মূল রিপোর্ট বইয়ের মতো একই ছকে প্রতিদিনের তথ্য লিখুন।' : page === 'summary' ? 'প্রতিটি কলামের মাসিক মোট এক নজরে দেখুন।' : 'টার্গেটের নাম, তারিখ ও মন্তব্য এখানে লিখুন।'}</p></div><div className="toolbar-actions"><div className="month-controls"><button onClick={() => changeMonth(-1)} aria-label="আগের মাস"><ChevronLeft size={20} /></button><span>{monthName(month)} {bengali(month.getFullYear())}</span><button onClick={() => changeMonth(1)} aria-label="পরের মাস"><ChevronRight size={20} /></button></div>{(page === 'report' || page === 'summary' || page === 'notes') && <button className="toolbar-share" onClick={page === 'notes' ? downloadReport : sharePdf} disabled={creatingPdf}>{page === 'notes' ? <Download size={17} /> : <Share2 size={17} />}{creatingPdf ? 'PDF তৈরি হচ্ছে...' : page === 'notes' ? 'নোট সংরক্ষণ' : page === 'summary' ? 'সংক্ষিপ্ত রিপোর্ট PDF' : 'পুরো রিপোর্ট PDF'}</button>}</div></div>
      {page === 'report' && <button className="quick-entry-trigger" onClick={openQuickEntry}><span><FileText size={18} /> দ্রুত দৈনিক রিপোর্ট লিখুন</span><ArrowRight size={17} /></button>}
      {(page === 'report' || page === 'summary' || page === 'notes') && <div className="sheet-tabs" role="tablist" aria-label="রিপোর্ট বইয়ের পাতা"><button role="tab" aria-selected={page === 'report'} className={page === 'report' ? 'active' : ''} onClick={() => setPage('report')}><FileText size={17} /> মাসিক রিপোর্ট</button><button role="tab" aria-selected={page === 'summary'} className={page === 'summary' ? 'active' : ''} onClick={() => setPage('summary')}><FileText size={17} /> সংক্ষিপ্ত রিপোর্ট</button><button role="tab" aria-selected={page === 'notes'} className={page === 'notes' ? 'active' : ''} onClick={() => setPage('notes')}><NotebookPen size={17} /> প্রয়োজনীয় নোট</button></div>}
      {(page === 'report' || page === 'summary') && <section id="full-report-paper" className={`paper report-paper ${page === 'summary' ? 'pdf-source' : ''}`} aria-label="মাসিক রিপোর্টের ছক"><div className="paper-header"><div className="profile-box"><label>নাম- <input aria-label="নাম" value={profile.name} onChange={event => setProfile(previous => ({ ...previous, name: event.target.value }))} /></label><label>ইউনিট- <input aria-label="ইউনিটের নাম" value={profile.unit} onChange={event => setProfile(previous => ({ ...previous, unit: event.target.value }))} /></label><label>ওয়ার্ড- <input aria-label="ওয়ার্ডের নাম" value={profile.ward} onChange={event => setProfile(previous => ({ ...previous, ward: event.target.value }))} /></label></div><h2>আমার ব্যক্তিগত</h2><h3>{candidateType} রিপোর্ট</h3><div className="paper-meta"><span>মাস: <strong>{monthName(month)}</strong></span><span>সন: <strong>{bengali(month.getFullYear())}</strong></span><label className="candidate-label">পরিচয়: <select aria-label="প্রার্থীর ধরন নির্বাচন" value={candidateType} onChange={event => setCandidateType(event.target.value)}><option value="সদস্য (রুকন)">সদস্য (রুকন)</option><option value="সদস্য (রুকন) প্রার্থী">সদস্য (রুকন) প্রার্থী</option></select></label></div></div><p className="scroll-hint">সব ১৭টি কলাম দেখতে ডানে-বামে সরান <ArrowRight size={14} /></p><div className="table-scroll"><table className="report-table"><colgroup>{columns.map(column => <col key={column.key} className={column.key === 'remarks' ? 'remarks-col' : 'standard-col'} />)}</colgroup><thead><tr>{columns.map((column, index) => <th key={column.key} scope="col" className={index === 0 || index === 16 ? 'plain-head' : ''}>{index === 0 || index === 16 ? column.label : <span className="vertical-label">{column.label}</span>}</th>)}</tr></thead><tbody>{Array.from({ length: 31 }, (_, index) => { const day = index + 1; const valid = day <= days; const row = monthlyRows[index]; const weekday = new Date(month.getFullYear(), month.getMonth(), day).getDay(); return <tr key={day} className={!valid ? 'unused-day' : weekday === 5 ? 'friday-row' : weekday === 6 ? 'saturday-row' : ''}><th scope="row">{bengali(day)}</th>{columns.slice(1).map(column => <td key={column.key} className={column.kind === 'check' ? 'check-cell' : ''}>{valid && (column.kind === 'check' ? <button className={`grid-check ${row[column.key] ? 'marked' : ''}`} onClick={() => updateCell(day, column.key, row[column.key] ? '' : '✓')} aria-label={`${bengali(day)} তারিখ ${column.label}`} aria-pressed={!!row[column.key]}>{row[column.key] ? '✓' : ''}</button> : visitGroups[column.key] ? <button type="button" className="visit-cell-button" aria-label={`${bengali(day)} তারিখ ${column.label}, নাম নির্বাচন করুন`} onClick={() => setVisitPicker({ day, group: column.key })}>{row[column.key] || <span className="visit-placeholder">+</span>}</button> : <input type="text" inputMode={column.kind === 'number' ? 'numeric' : 'text'} aria-label={`${bengali(day)} তারিখ ${column.label}`} value={row[column.key] || ''} onChange={event => updateCell(day, column.key, reportInputValue(column, event.target.value))} />)}</td>)}</tr>; })}</tbody><tfoot><tr><th>মোট</th>{columns.slice(1).map((column, index) => <td key={column.key}>{column.key === 'remarks' ? '' : bengali(totals[index + 1])}</td>)}</tr></tfoot></table></div><div className="paper-footer"><label>মাসিক ইয়ানত আদায় <input value={dues[currentMonth] || ''} onChange={event => setDues(previous => ({ ...previous, [currentMonth]: event.target.value }))} aria-label="মাসিক ইয়ানত আদায়" /></label><label>তারিখ: <DateField label="মাসিক ইয়ানত আদায়ের তারিখ" value={duesDates[currentMonth] || ''} onChange={value => setDuesDates(previous => ({ ...previous, [currentMonth]: value }))} /></label><span>মাস: {monthName(month)}</span><span>সন: {bengali(month.getFullYear())}</span></div></section>
      }{page === 'summary' && <section className="paper report-paper summary-form" aria-label="সংক্ষিপ্ত মাসিক রিপোর্ট"><div className="paper-header"><div className="profile-box"><label>নাম- <input aria-label="সংক্ষিপ্ত রিপোর্টে নাম" value={profile.name} onChange={event => setProfile(previous => ({ ...previous, name: event.target.value }))} /></label><label>ইউনিট- <input aria-label="সংক্ষিপ্ত রিপোর্টে ইউনিট" value={profile.unit} onChange={event => setProfile(previous => ({ ...previous, unit: event.target.value }))} /></label><label>ওয়ার্ড- <input aria-label="সংক্ষিপ্ত রিপোর্টে ওয়ার্ড" value={profile.ward} onChange={event => setProfile(previous => ({ ...previous, ward: event.target.value }))} /></label></div><h2>আমার ব্যক্তিগত</h2><h3>{candidateType} রিপোর্ট</h3><div className="paper-meta"><span>মাস: <strong>{monthName(month)}</strong></span><span>সন: <strong>{bengali(month.getFullYear())}</strong></span><label className="candidate-label">পরিচয়: <select aria-label="সংক্ষিপ্ত রিপোর্টে প্রার্থীর ধরন" value={candidateType} onChange={event => setCandidateType(event.target.value)}><option value="সদস্য (রুকন)">সদস্য (রুকন)</option><option value="সদস্য (রুকন) প্রার্থী">সদস্য (রুকন) প্রার্থী</option></select></label></div></div><p className="scroll-hint">সব ১৭টি কলাম দেখতে ডানে-বামে সরান <ArrowRight size={14} /></p><div className="table-scroll"><table className="report-table"><colgroup>{columns.map((column, index) => <col key={column.key} className={index === 0 ? 'month-col' : column.key === 'remarks' ? 'remarks-col' : 'standard-col'} />)}</colgroup><thead><tr>{columns.map((column, index) => <th key={column.key} scope="col" className={index === 0 || index === 16 ? 'plain-head' : ''}>{index === 0 ? 'মাস ও সাল' : index === 16 ? column.label : <span className="vertical-label">{column.label}</span>}</th>)}</tr></thead><tbody><tr><th scope="row">{monthName(month)}<br />{bengali(month.getFullYear())}</th>{columns.slice(1).map((column, index) => <td key={column.key}>{column.key === 'remarks' ? <span className="summary-dues-cell">মাসিক ইয়ানত আদায়: {dues[currentMonth] || '—'}<br />আদায়ের তারিখ: {displayDate(duesDates[currentMonth] || '') || '—'}<br />মাস: {monthName(month)}<br />সন: {bengali(month.getFullYear())}</span> : bengali(totals[index + 1])}</td>)}</tr></tbody></table></div></section>}
      {page === 'summary' && <section className="benchmark-section" aria-labelledby="benchmark-title"><div className="benchmark-heading"><div><span className="section-kicker">মাসিক পর্যালোচনা</span><h2 id="benchmark-title">মানদণ্ড অনুযায়ী অগ্রগতি</h2><p>২০ ও ২৫ তারিখ রাত ৮টায় মানের দিনের আনুপাতিক লক্ষ্য অনুযায়ী পর্যালোচনা হবে।</p></div><button onClick={enableReviewNotifications}><Bell size={16} /> নোটিফিকেশন চালু করুন</button></div><div className="benchmark-scroll"><table className="benchmark-table"><thead><tr><th>ক্র নং</th><th>বিষয়</th><th>মান</th><th>সাধারণ মান</th><th>বিপদসীমা</th><th>এ পর্যন্ত</th><th>এখনকার লক্ষ্য</th><th>পর্যালোচনা</th></tr></thead><tbody>{benchmarks.map((standard, index) => { const result = assessment[index]; return <tr key={standard.key}><td>{bengali(index + 1)}.</td><th scope="row">{standard.label}</th><td>{bengali(standard.target)}{standard.mode === 'percent' ? '%' : ''}</td><td>{bengali(standard.ordinary)}{standard.mode === 'percent' ? '%' : ''}</td><td>{bengali(standard.danger)}{standard.mode === 'percent' ? '%' : ''}</td><td>{standard.mode === 'percent' ? <label className="benchmark-percent"><input aria-label={`${standard.label} শতাংশ`} inputMode="numeric" value={benchmarkExtras[currentMonth]?.[standard.key] || ''} onChange={event => updateBenchmarkExtra(standard.key, event.target.value)} placeholder="০" />%</label> : bengali(result.actual || 0)}</td><td>{elapsed ? `${bengali(result.expected)}${standard.mode === 'percent' ? '%' : ''}` : '—'}</td><td><span className={`benchmark-status ${result.status}`}>{result.status === 'good' ? 'ধরে রাখুন' : result.status === 'ordinary' ? 'আরও ভালো করুন' : result.status === 'low' ? 'উন্নতি করুন' : result.status === 'danger' ? 'বিপদসীমার নিচে' : result.status === 'missing' ? 'তথ্য দিন' : 'সময় হয়নি'}</span></td></tr>; })}<tr className="benchmark-rule"><td>১৬.</td><td colSpan={7}>মাসিক ইয়ানত প্রতি মাসের প্রথম সপ্তাহে নিয়মিত আদায় করতে হবে। ৩ মাস বাকি রাখা যাবে না। ইয়ানত আয়ের অন্তত ৫% হওয়া উচিত।</td></tr></tbody></table></div><div className="benchmark-income"><label>মাসিক আয় (ঐচ্ছিক, ৫% যাচাইয়ের জন্য) <input inputMode="numeric" value={benchmarkExtras[currentMonth]?.income || ''} onChange={event => updateBenchmarkExtra('income', event.target.value)} placeholder="পরিমাণ লিখুন" /></label><span>আয়ের তথ্য শুধু এই ব্রাউজারে সংরক্ষিত থাকে।</span></div><div className="benchmark-review"><span className="section-kicker">{currentMonth < monthKey(now) ? 'স্বয়ংক্রিয় মাসিক মন্তব্য' : 'এ মাসের অগ্রগতি'}</span>{currentMonth < monthKey(now) ? <><h3>{finalReview.comment}</h3><p><strong>পরবর্তী মাসের পরামর্শ:</strong> {finalReview.advice} {duesAdvice}</p></> : <><h3>{elapsed ? reviewMessage(assessment).comment : 'এই মাস এখনও শুরু হয়নি।'}</h3><p>{elapsed ? `${reviewMessage(assessment).advice} ${duesAdvice}` : 'মাস শুরু হলে অগ্রগতি দেখা যাবে।'} মাস শেষ হলে এখানে চূড়ান্ত মন্তব্য ও পরবর্তী মাসের পরামর্শ থাকবে।</p></>}</div><p className="benchmark-limitation">নোটিফিকেশন পেতে অনুমতি দিন। অ্যাপ খোলা না থাকলে ওয়েব অ্যাপ থেকে নির্ভরযোগ্যভাবে সময়মতো নোটিফিকেশন পাঠানো যায় না।</p></section>}
      {page === 'notes' && <section className="paper notes-paper" aria-label="প্রয়োজনীয় নোটের পাতা"><h2>প্রয়োজনীয় নোট</h2><p className="notes-month-label">মাস: {monthName(month)} &nbsp; সন: {bengali(month.getFullYear())}</p><p className="notes-entry-hint">যোগাযোগের তারিখে শুধু এই মাসের দিন লিখুন, যেমন: ৪, ৫, ৩০</p><div className="notes-table-scroll"><table className="notes-table"><colgroup><col style={{ width: '8%' }} /><col style={{ width: '45%' }} /><col style={{ width: '23%' }} /><col style={{ width: '24%' }} /></colgroup><thead><tr><th></th><th>নাম</th><th>টার্গেটভুক্তকরণের<br />তারিখ</th><th>যোগাযোগের তারিখ</th></tr></thead><tbody>{groups.map(group => <Fragment key={group.key}><tr className="group-row"><th colSpan={4}>{group.title}</th></tr>{Array.from({ length: group.count }, (_, index) => <tr key={`${group.key}-${index}`}><th scope="row">{bengali(index + 1)}।</th>{(['name', 'assigned', 'contacted'] as const).map(field => <td key={field}>{field === 'assigned' ? <DateField label={`${group.title} ${bengali(index + 1)} টার্গেটভুক্তকরণের তারিখ`} value={notes[group.key]?.[index]?.assigned || ''} onChange={value => updateNote(group.key, index, 'assigned', value)} /> : <input type="text" inputMode={field === 'contacted' ? 'numeric' : undefined} placeholder={field === 'contacted' ? '৪, ৫, ৩০' : undefined} aria-label={`${group.title} ${bengali(index + 1)} ${field === 'name' ? 'নাম' : 'যোগাযোগের দিন'}`} value={notes[group.key]?.[index]?.[field] || ''} onChange={event => updateNote(group.key, index, field, field === 'contacted' ? event.target.value.replace(/[^0-9০-৯,，،\s]/g, '') : event.target.value)} onBlur={event => { if (field === 'contacted') updateNote(group.key, index, field, validContactDays(event.target.value, days)); }} />}</td>)}</tr>)}</Fragment>)}</tbody></table></div><div className="notes-bottom"><label>দায়িত্বশীলের মন্তব্য:<textarea rows={4} value={notesComment} onChange={event => setNotesComment(event.target.value)} /></label><div className="signature-fields"><label>স্বাক্ষর <input value={signature} onChange={event => setSignature(event.target.value)} /></label><label>তারিখ <DateField label="স্বাক্ষরের তারিখ" value={signatureDates[currentMonth] || ''} onChange={value => setSignatureDates(previous => ({ ...previous, [currentMonth]: value }))} /></label></div></div></section>}
      <div className="below-paper"><span><Check size={15} /> আপনার তথ্য এই ফোনের ব্রাউজারেই সংরক্ষিত থাকে</span><button onClick={installApp}><Smartphone size={16} /> হোম স্ক্রিনে রাখুন <ArrowRight size={16} /></button></div>
      {page === 'admin' && (accountRole === 'admin' || accountRole === 'developer') && <section className="paper admin-panel"><div className="benchmark-heading"><div><span className="section-kicker">সিস্টেম পরিচালনা</span><h2>অ্যাডমিন ড্যাশবোর্ড</h2><p>নিবন্ধিত অ্যাকাউন্ট এবং তাদের ভূমিকা পরিচালনা করুন।</p></div><button onClick={async () => { setAdminLoading(true); setAdminError(''); try { setAdminUsers(await cloudAdminUsers()); } catch (error) { setAdminError(error instanceof Error ? error.message : 'তালিকা আনা যায়নি'); } finally { setAdminLoading(false); } }}>তালিকা রিফ্রেশ</button></div>{adminError && <p className="auth-error">{adminError}</p>}<div className="admin-stats"><div><strong>{adminUsers.length}</strong><span>দেখানো অ্যাকাউন্ট</span></div><div><strong>{adminUsers.filter(user => user.role === 'admin').length}</strong><span>অ্যাডমিন</span></div><div><strong>{adminUsers.filter(user => user.role === 'developer').length}</strong><span>ডেভেলপার</span></div></div>{adminLoading ? <p>লোড হচ্ছে…</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ইমেইল</th><th>ভূমিকা</th><th>যোগদানের তারিখ</th></tr></thead><tbody>{adminUsers.map(user => <tr key={user.id}><td>{user.email}</td><td><select value={user.role} onChange={async event => { const role = event.target.value; try { await cloudUpdateUserRole(user.id, role); setAdminUsers(items => items.map(item => item.id === user.id ? { ...item, role } : item)); } catch (error) { setAdminError(error instanceof Error ? error.message : 'ভূমিকা পরিবর্তন ব্যর্থ'); } }}><option value="user">user</option><option value="admin">admin</option><option value="developer">developer</option></select></td><td>{new Date(user.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}<p className="admin-note">প্রাথমিক অ্যাডমিন তৈরি করতে Supabase SQL Editor-এ DEPLOYMENT.md-এর নির্দেশনা অনুসরণ করুন।</p></section>}
      {page === 'developer' && (accountRole === 'admin' || accountRole === 'developer') && <section className="paper admin-panel"><span className="section-kicker">রক্ষণাবেক্ষণ ও ডায়াগনস্টিক</span><h2>ডেভেলপার কন্ট্রোল সেন্টার</h2><p>অ্যাপের অবস্থা পরীক্ষা, ডেটা ব্যাকআপ ও পুনরুদ্ধার করুন। গোপন API key এখানে দেখানো হয় না।</p><div className="developer-grid"><div><strong>ক্লাউড সংযোগ</strong><span>{cloudStatus}</span></div><div><strong>অ্যাকাউন্ট ভূমিকা</strong><span>{accountRole}</span></div><div><strong>ডেটা স্টোরেজ</strong><span>Supabase + local browser cache</span></div><div><strong>অ্যাপ সংস্করণ</strong><span>2.0.0</span></div></div><div className="developer-actions"><button onClick={() => { const payload = { exportedAt: new Date().toISOString(), report, monthlyNotes, visits, dues, duesDates, profile, candidateType, notesComment, signature, signatureDates, reminders, submittedDays, benchmarkExtras }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = `my-daily-report-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(href); }}><Download size={17}/> JSON ব্যাকআপ ডাউনলোড</button><label className="developer-upload">ব্যাকআপ পুনরুদ্ধার<input type="file" accept="application/json" onChange={event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result)); if (!data || typeof data !== 'object' || !data.report) throw new Error('অবৈধ ব্যাকআপ ফাইল'); if (!window.confirm('বর্তমান রিপোর্ট ডেটা ব্যাকআপ দিয়ে প্রতিস্থাপন করবেন?')) return; setReport(data.report); setMonthlyNotes(data.monthlyNotes || {}); setVisits(data.visits || {}); setDues(data.dues || {}); setDuesDates(data.duesDates || {}); setProfile(data.profile || emptyProfile); setCandidateType(data.candidateType || 'সদস্য (রুকন)'); setNotesComment(data.notesComment || ''); setSignature(data.signature || ''); setSignatureDates(data.signatureDates || {}); setReminders(data.reminders || []); setSubmittedDays(data.submittedDays || {}); setBenchmarkExtras(data.benchmarkExtras || {}); setToast('ব্যাকআপ পুনরুদ্ধার হয়েছে'); } catch (error) { setToast(error instanceof Error ? error.message : 'ব্যাকআপ পড়া যায়নি'); } }; reader.readAsText(file); event.target.value = ''; }}/></label></div><p className="admin-note">গুরুত্বপূর্ণ: এই JSON ফাইল সংবেদনশীল ব্যক্তিগত রিপোর্ট তথ্য ধারণ করতে পারে। নিরাপদ স্থানে রাখুন।</p></section>}
    </main>
    <nav className="mobile-nav"><button className={page === 'report' ? 'active' : ''} onClick={() => { setPage('report'); window.scrollTo(0, 0); }}><FileText size={21} /><span>মাসিক রিপোর্ট</span></button><button className={page === 'summary' ? 'active' : ''} onClick={() => { setPage('summary'); window.scrollTo(0, 0); }}><FileText size={21} /><span>সংক্ষিপ্ত রিপোর্ট</span></button><button className={page === 'notes' ? 'active' : ''} onClick={() => { setPage('notes'); window.scrollTo(0, 0); }}><NotebookPen size={21} /><span>প্রয়োজনীয় নোট</span></button></nav>
    {quickEntryOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setQuickEntryOpen(false); }}><div className="modal quick-entry-modal" role="dialog" aria-modal="true" aria-labelledby="quick-title"><div className="modal-head"><div><span className="section-kicker">{monthName(month)} {bengali(month.getFullYear())}</span><h2 id="quick-title">দ্রুত দৈনিক রিপোর্ট</h2></div><button className="icon-button" onClick={() => setQuickEntryOpen(false)} aria-label="বন্ধ করুন"><X size={21} /></button></div><label className="quick-day-label">তারিখ <select value={quickDay} onChange={event => setQuickDay(Number(event.target.value))}>{Array.from({ length: days }, (_, index) => <option key={index + 1} value={index + 1}>{bengali(index + 1)} {monthName(month)}</option>)}</select></label><div className="quick-fields">{columns.slice(1).map(column => { const value = monthlyRows[quickDay - 1]?.[column.key] || ''; return <div className="quick-field" key={column.key}><span>{column.label}</span>{column.kind === 'check' ? <button type="button" className={value ? 'quick-check marked' : 'quick-check'} onClick={() => updateCell(quickDay, column.key, value ? '' : '✓')} aria-pressed={!!value}>{value ? '✓' : 'টিক দিন'}</button> : visitGroups[column.key] ? <button type="button" className="quick-visit" onClick={() => { setQuickEntryOpen(false); setVisitPicker({ day: quickDay, group: column.key }); }}>{value || 'নাম বাছুন'} <ArrowRight size={14} /></button> : <input type="text" inputMode={column.kind === 'number' ? 'numeric' : 'text'} value={value} onChange={event => updateCell(quickDay, column.key, reportInputValue(column, event.target.value))} aria-label={`${bengali(quickDay)} তারিখ ${column.label}`} placeholder={column.kind === 'number' ? '০' : 'লিখুন'} />}</div>; })}</div><button className="visit-done" onClick={() => { setSubmittedDays(previous => ({ ...previous, [`${currentMonth}-${String(quickDay).padStart(2, '0')}`]: true })); setQuickEntryOpen(false); setToast('দৈনিক রিপোর্ট সংরক্ষিত হয়েছে'); }}>রিপোর্ট সম্পন্ন <Check size={17} /></button></div></div>}
    {visitPicker && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setVisitPicker(null); }}><div className="modal visit-modal" role="dialog" aria-modal="true" aria-labelledby="visit-title"><div className="modal-head"><div><span className="section-kicker">{bengali(visitPicker.day)} {monthName(month)} {bengali(month.getFullYear())}</span><h2 id="visit-title">{groups.find(group => group.key === visitPicker.group)?.title} সাক্ষাত</h2></div><button className="icon-button" onClick={() => setVisitPicker(null)} aria-label="বন্ধ করুন"><X size={21} /></button></div><p className="visit-instruction">যার সঙ্গে সাক্ষাত হয়েছে, তার পাশে কতবার হয়েছে তা লিখুন। দিনটি প্রয়োজনীয় নোটে নিজে থেকেই যোগ হবে।</p>{(notes[visitPicker.group] || []).some(row => row?.name?.trim()) ? <div className="visit-list">{(notes[visitPicker.group] || []).map((row, index) => row?.name?.trim() ? <div className="visit-person" key={index}><div><strong>{row.name}</strong><small>{row.assigned ? `টার্গেটভুক্ত: ${displayDate(row.assigned)}` : 'প্রয়োজনীয় নোটে তালিকাভুক্ত'}</small></div><div className="visit-stepper"><button type="button" onClick={() => changeVisit(visitPicker.day, visitPicker.group, index, -1)} disabled={!visits[`${currentMonth}-${String(visitPicker.day).padStart(2, '0')}`]?.[visitPicker.group]?.[index]} aria-label={`${row.name} একবার কমান`}>−</button><span>{bengali(visits[`${currentMonth}-${String(visitPicker.day).padStart(2, '0')}`]?.[visitPicker.group]?.[index] || 0)}</span><button type="button" onClick={() => changeVisit(visitPicker.day, visitPicker.group, index, 1)} aria-label={`${row.name} একবার বাড়ান`}>+</button></div></div> : null)}</div> : <div className="visit-empty"><p>এই বিভাগে এখনও কোনো নাম নেই। আগে প্রয়োজনীয় নোটে নাম লিখুন।</p><button className="primary-button" onClick={() => { setVisitPicker(null); setPage('notes'); }}>প্রয়োজনীয় নোট খুলুন <ArrowRight size={17} /></button></div>}<button className="visit-done" onClick={() => setVisitPicker(null)}>সম্পন্ন <Check size={17} /></button></div></div>}
    {profileEditorOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setProfileEditorOpen(false); }}><div className="modal personal-profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-head"><div><span className="section-kicker">শুধু আপনার জন্য</span><h2 id="profile-title">আমার প্রোফাইল</h2></div><button className="icon-button" onClick={() => setProfileEditorOpen(false)} aria-label="বন্ধ করুন"><X size={21} /></button></div><form onSubmit={saveProfile}><div className="profile-photo-row"><div className="profile-photo-preview">{profileDraft.photo ? <img src={profileDraft.photo} alt="আপনার প্রোফাইল ছবি" /> : <UserRound size={32} />}</div><div><label className="photo-upload">ছবি যোগ / পরিবর্তন<input type="file" accept="image/*" onChange={handlePhotoUpload} /></label>{profileDraft.photo && <button type="button" className="photo-remove" onClick={() => setProfileDraft(previous => ({ ...previous, photo: '' }))}>ছবি সরান</button>}<small>ছবি শুধু এই ডিভাইসে থাকবে।</small></div></div><div className="profile-form-grid"><label>ইউজার নেম <span>*</span><input required value={profileDraft.username} onChange={event => setProfileDraft(previous => ({ ...previous, username: event.target.value }))} /></label><label>নিজের নাম<input value={profileDraft.name} onChange={event => setProfileDraft(previous => ({ ...previous, name: event.target.value }))} placeholder="পুরো নাম" /></label><label>মোবাইল নং<input type="tel" value={profileDraft.phone} onChange={event => setProfileDraft(previous => ({ ...previous, phone: event.target.value }))} placeholder="মোবাইল নম্বর" /></label><label>ইমেইল<input type="email" value={profileDraft.email} onChange={event => setProfileDraft(previous => ({ ...previous, email: event.target.value }))} placeholder="name@example.com" /></label><label>পেশা<input value={profileDraft.occupation} onChange={event => setProfileDraft(previous => ({ ...previous, occupation: event.target.value }))} placeholder="আপনার পেশা" /></label><label>ইউনিট<input value={profileDraft.unit} onChange={event => setProfileDraft(previous => ({ ...previous, unit: event.target.value }))} /></label><label>ওয়ার্ড<input value={profileDraft.ward} onChange={event => setProfileDraft(previous => ({ ...previous, ward: event.target.value }))} /></label></div><label>ঠিকানা<textarea rows={2} value={profileDraft.address} onChange={event => setProfileDraft(previous => ({ ...previous, address: event.target.value }))} placeholder="আপনার ঠিকানা" /></label><label>পারিবারিক তথ্য<textarea rows={3} value={profileDraft.family} onChange={event => setProfileDraft(previous => ({ ...previous, family: event.target.value }))} placeholder="পরিবার সম্পর্কে প্রয়োজনীয় তথ্য" /></label><label>নতুন অ্যাকাউন্ট পাসওয়ার্ড <small>(পরিবর্তন না করলে ফাঁকা রাখুন)</small><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder={cloudConfigured ? "অন্তত ৮ অক্ষর" : "অন্তত ৬ অক্ষর"} /></label><button className="primary-button form-submit" type="submit">প্রোফাইল সংরক্ষণ <Check size={17} /></button></form><button type="button" className="profile-logout" onClick={logout}>লগ আউট করুন <ArrowRight size={16} /></button></div></div>}
    {reviewNotice && <div className="modal-backdrop"><div className="modal review-notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="review-notice-title"><div className="modal-head"><div><span className="section-kicker">স্বয়ংক্রিয় পর্যালোচনা</span><h2 id="review-notice-title">{reviewNotice.title}</h2></div><button className="icon-button" onClick={() => setReviewNotice(null)} aria-label="বন্ধ করুন"><X size={21} /></button></div><p>{reviewNotice.message}</p><button className="primary-button form-submit" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setPage('summary'); setReviewNotice(null); }}>মানদণ্ড দেখুন <ArrowRight size={17} /></button></div></div>}
    {reminderSettingsOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setReminderSettingsOpen(false); }}><div className="modal reminder-modal" role="dialog" aria-modal="true" aria-labelledby="reminder-title"><div className="modal-head"><div><span className="section-kicker">দৈনিক রিপোর্ট</span><h2 id="reminder-title">এলার্ম সেট করুন</h2></div><button className="icon-button" onClick={() => setReminderSettingsOpen(false)} aria-label="বন্ধ করুন"><X size={21} /></button></div><p className="reminder-description">এক বা একাধিক সময় যোগ করুন। নির্ধারিত সময়ের আগে ওই দিনের রিপোর্ট লেখা থাকলে এলার্ম বাজবে না।</p><div className="reminder-add"><label>এলার্মের সময়<input type="time" value={reminderDraft} onChange={event => setReminderDraft(event.target.value)} /></label><button onClick={addReminder}><Plus size={17} /> যোগ করুন</button></div><div className="reminder-list">{reminders.length ? reminders.map(time => <div className="reminder-row" key={time}><AlarmClock size={19} /><strong>{time.replace(/[0-9]/g, digit => bengali(Number(digit)))}</strong><span>প্রতিদিন</span><button aria-label={`${time} এর এলার্ম মুছুন`} onClick={() => setReminders(previous => previous.filter(item => item !== time))}><Trash2 size={17} /></button></div>) : <p className="reminder-empty">এখনও কোনো এলার্ম সেট করা হয়নি।</p>}</div><p className="reminder-caveat">অ্যাপ খোলা থাকলে এলার্ম ও নোটিফিকেশন কাজ করবে। ব্রাউজার বন্ধ থাকলে বা ফোন ঘুমে থাকলে ওয়েব অ্যাপ থেকে নির্ভরযোগ্যভাবে এলার্ম বাজানো যায় না।</p><button className="visit-done" onClick={() => setReminderSettingsOpen(false)}>ঠিক আছে <Check size={17} /></button></div></div>}
    {ringingReminder && <div className="modal-backdrop"><div className="modal ringing-modal" role="alertdialog" aria-modal="true" aria-labelledby="ring-title"><div className="ring-icon"><Bell size={26} /></div><span className="section-kicker">{ringingReminder.replace(/[0-9]/g, digit => bengali(Number(digit)))}</span><h2 id="ring-title">আজকের রিপোর্ট লেখার সময়</h2><p>আজকের রিপোর্ট এখনও লেখা হয়নি। এখনই লিখে রাখুন।</p><div className="ring-actions"><button onClick={() => setRingingReminder(null)}>পরে লিখব</button><button onClick={() => { const now = new Date(); setRingingReminder(null); setReminderSettingsOpen(false); setPage('report'); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setQuickDay(now.getDate()); setQuickEntryOpen(true); }}>রিপোর্ট লিখুন <ArrowRight size={17} /></button></div></div></div>}
    {installHelp && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setInstallHelp(false); }}><div className="modal install-modal" role="dialog" aria-modal="true" aria-labelledby="install-title"><div className="modal-head"><div><span className="section-kicker">অ্যাপ স্টোর ছাড়াই</span><h2 id="install-title">হোম স্ক্রিনে রাখুন</h2></div><button className="icon-button" onClick={() => setInstallHelp(false)} aria-label="বন্ধ করুন"><X size={21} /></button></div><p>ব্রাউজারের Share বা ⋮ মেনুতে গিয়ে Add to Home Screen / Install app বেছে নিন।</p><button className="primary-button form-submit" onClick={() => setInstallHelp(false)}>বুঝেছি <Check size={18} /></button></div></div>}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>;
}

export default function App() { return <CloudAuthGate />; }
