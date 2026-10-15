// Display-only approximations. Ranking dates and day counts never use these bands.
export const PERIOD_ANALOGIES = [
  { from: 1, to: 2, lines: ['春夏秋冬を、まるっとひと回り。', 'カレンダーを一冊、めくり終えるくらい。'] },
  { from: 2, to: 3, lines: ['スマホの機種変更を考え始めるころ。', '映画の続編が待ち遠しくなるくらい。'] },
  { from: 3, to: 4, lines: ['中学に入学して、卒業するくらい。', '季節の景色を、三巡ほど見届けるくらい。'] },
  { from: 4, to: 5, lines: ['夏のオリンピックがひと巡り。', 'アメリカ大統領の任期、ひとつ分。'] },
  { from: 5, to: 6, lines: ['ハリウッドなら続編の予告が出てそう。', '手帳が本棚に、五冊ほど並ぶくらい。'] },
  { from: 6, to: 7, lines: ['小学校、入学から卒業まで。', '季節の景色を、六巡ほど見届けるくらい。'] },
  { from: 7, to: 8, lines: ['スーパーボウルが7回開催されるくらい。', '七年分のカレンダーが積み重なるくらい。'] },
  { from: 8, to: 9, lines: ['アメリカ大統領の任期、2期分。', '夏のオリンピックが、ふた巡り。'] },
  { from: 9, to: 10, lines: ['義務教育がまるごと終わるくらい。', '九年分の季節を見届けるくらい。'] },
  { from: 10, to: 12, lines: ['「10年ひと昔」が、本当にひと昔。', '十年分の思い出が、アルバムに並ぶくらい。'] },
  { from: 12, to: 14, lines: ['干支が一周して、さらにおまけ付き。', '春夏秋冬を、十二巡以上見届けるくらい。'] },
  { from: 14, to: 16, lines: ['ランドセルだった子が、もう二十歳。', '十四年分のカレンダーをめくるくらい。'] },
  { from: 16, to: 18, lines: ['夏のオリンピックを4大会分見届けるくらい。', '十六年分の思い出が積み重なるくらい。'] },
  { from: 18, to: 22, lines: ['生まれた子が成人するくらい。', '「10年ひと昔」を、ふたつ数えるころ。'] },
  { from: 22, to: Infinity, lines: ['生まれてから大学を卒業するより長い。', '二十年以上の季節を見届けるくらい。'] }
];

export function periodAnalogy(days, songId) {
  if (!Number.isFinite(days) || days < 365.25) return '';
  const years = days / 365.25;
  const band = PERIOD_ANALOGIES.find(item => years >= item.from && years < item.to);
  if (!band) return '';
  // Stable across A/B, scope changes, reloads and dates with the same duration.
  const seed = /^S\d+$/.test(songId) ? Number(songId.slice(1)) : 0;
  return band.lines[seed % band.lines.length];
}
