export type Benchmark = {
  key: string;
  label: string;
  target: number;
  ordinary: number;
  danger: number;
  source?: string;
  mode: 'count' | 'days' | 'percent';
};

export const benchmarks: Benchmark[] = [
  { key: 'quran', label: 'কুরআন অধ্যয়ন (দিন)', target: 30, ordinary: 25, danger: 20, source: 'quran', mode: 'days' },
  { key: 'hadith', label: 'হাদীস অধ্যয়ন (সংখ্যা)', target: 30, ordinary: 25, danger: 20, source: 'hadith', mode: 'count' },
  { key: 'book', label: 'ইসলামী সাহিত্য অধ্যয়ন (পৃষ্ঠা)', target: 300, ordinary: 200, danger: 100, source: 'book', mode: 'count' },
  { key: 'prayer', label: 'জামায়াতে নামাজ (ওয়াক্ত সংখ্যা)', target: 150, ordinary: 125, danger: 100, source: 'literature', mode: 'count' },
  { key: 'dawah', label: 'দাওয়াতি টার্গেট সাক্ষাত (কতবার)', target: 5, ordinary: 3, danger: 2, source: 'dawah', mode: 'count' },
  { key: 'worker', label: 'কর্মী টার্গেট সাক্ষাত (কতবার)', target: 4, ordinary: 3, danger: 2, source: 'worker', mode: 'count' },
  { key: 'member', label: 'সদস্য (রুকন) টার্গেট সাক্ষাত (কতবার)', target: 6, ordinary: 3, danger: 2, source: 'member', mode: 'count' },
  { key: 'contact', label: 'কর্মী যোগাযোগ (কতবার)', target: 3, ordinary: 2, danger: 1, source: 'contact', mode: 'count' },
  { key: 'family', label: 'পারিবারিক বৈঠক (সংখ্যা)', target: 4, ordinary: 2, danger: 1, source: 'papersGiven', mode: 'days' },
  { key: 'social', label: 'সামাজিক কাজ (দিন)', target: 30, ordinary: 20, danger: 10, source: 'social', mode: 'days' },
  { key: 'time', label: 'সময় দান (ঘণ্টা)', target: 90, ordinary: 75, danger: 60, source: 'time', mode: 'count' },
  { key: 'meetings', label: 'সাংগঠনিক বৈঠকাদিতে যোগদান', target: 100, ordinary: 75, danger: 50, mode: 'percent' },
  { key: 'programs', label: 'ময়দানের কর্মসূচিতে উপস্থিতি', target: 100, ordinary: 75, danger: 50, mode: 'percent' },
  { key: 'report', label: 'রিপোর্ট সংরক্ষণ (দিন)', target: 30, ordinary: 25, danger: 20, source: 'report', mode: 'days' },
  { key: 'reflection', label: 'আত্মসমালোচনা (দিন)', target: 30, ordinary: 25, danger: 20, source: 'regular', mode: 'days' },
];

export type Result = Benchmark & { actual: number | null; expected: number; status: 'good' | 'ordinary' | 'low' | 'danger' | 'missing' | 'future' };

const toNumber = (value: string) => Number(value.replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))) || 0;

export function evaluateBenchmarks(month: Date, elapsedDays: number, report: Record<string, Record<string, string>>, extras: Record<string, string>): Result[] {
  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
  const rows = Array.from({ length: elapsedDays }, (_, index) => report[`${key}${String(index + 1).padStart(2, '0')}`] || {});
  return benchmarks.map(item => {
    const actual = item.mode === 'percent'
      ? (extras[item.key] === undefined || extras[item.key] === '' ? null : toNumber(extras[item.key]))
      : item.mode === 'days'
        ? rows.filter(row => { const value = row[item.source || '']; return item.source === 'social' ? toNumber(value || '') > 0 : Boolean(value); }).length
        : rows.reduce((sum, row) => sum + toNumber(row[item.source || ''] || ''), 0);
    const expected = item.mode === 'percent' ? item.target : Math.ceil(item.target * elapsedDays / 30);
    const ordinary = item.mode === 'percent' ? item.ordinary : Math.ceil(item.ordinary * elapsedDays / 30);
    const danger = item.mode === 'percent' ? item.danger : Math.ceil(item.danger * elapsedDays / 30);
    const status = elapsedDays === 0 ? 'future' : actual === null ? 'missing' : actual >= expected ? 'good' : actual >= ordinary ? 'ordinary' : actual >= danger ? 'low' : 'danger';
    return { ...item, actual, expected, status };
  });
}

export function reviewMessage(results: Result[], final = false): { comment: string; advice: string } {
  const good = results.filter(item => item.status === 'good');
  const low = results.filter(item => ['ordinary', 'low', 'danger'].includes(item.status));
  const missing = results.filter(item => item.status === 'missing');
  const comment = low.length
    ? `${low.map(item => item.label).join(', ')} বিষয়ে ${final ? 'মাসিক' : 'এ পর্যন্ত'} মানের আনুপাতিক লক্ষ্যের চেয়ে কম হয়েছে।`
    : good.length ? `নথিভুক্ত বিষয়গুলোতে ${final ? 'মাসিক' : 'এ পর্যন্ত'} মানের আনুপাতিক লক্ষ্য পূরণ হয়েছে।` : 'পর্যালোচনার জন্য এখনও রিপোর্টের তথ্য নেই।';
  const advice = low.length
    ? `পরবর্তী সময়ে ${low.map(item => item.label).join(', ')} বিষয়ে নিয়মিত কাজ বাড়ান।${good.length ? ` ${good.map(item => item.label).join(', ')}-এর বর্তমান গতি মাসের শেষ পর্যন্ত ধরে রাখুন।` : ''}`
    : 'এই গতি মাসের শেষ পর্যন্ত ধরে রাখুন।';
  return { comment, advice: missing.length ? `${advice} ${missing.map(item => item.label).join(', ')}-এর তথ্য যোগ করলে পর্যালোচনা সম্পূর্ণ হবে।` : advice };
}