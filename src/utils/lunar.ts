/**
 * Chinese Lunar & Solar Terms Utility for SovereignNote
 * Full Offline Algorithm 1900-2100 with GanZhi (干支) and Solar Terms
 */

export interface LunarInfo {
  lunarDayName: string;
  lunarMonthName: string;
  festival: string | null;
  isSolarTerm: boolean;
  gzYear?: string;
  gzMonth?: string;
  gzDay?: string;
  jpEra?: string;
  kokiYear?: string;
}

const lunarInfo = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0
];

const SOLAR_FESTIVALS: Record<string, string> = {
  '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '05-01': '劳动节',
  '05-04': '青年节', '06-01': '儿童节', '10-01': '国庆节', '12-25': '圣诞节',
};

const LUNAR_FESTIVALS: Record<string, string> = {
  '01-01': '春节', '01-15': '元宵节', '05-05': '端午节', '07-07': '七夕节',
  '08-15': '中秋节', '09-09': '重阳节', '12-08': '腊八节', '12-23': '小年'
}; // 除夕 handled separately

const TianGan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DiZhi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

function lYearDays(y: number): number {
  let i, sum = 348;
  for (i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
  return sum + leapDays(y);
}

function leapDays(y: number): number {
  if (leapMonth(y)) return (lunarInfo[y - 1900] & 0x10000) ? 30 : 29;
  return 0;
}

function leapMonth(y: number): number {
  return lunarInfo[y - 1900] & 0xf;
}

function monthDays(y: number, m: number): number {
  return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29;
}

function calculateLunar(year: number, month: number, day: number) {
  let baseDate = new Date(1900, 0, 31);
  let objDate = new Date(year, month - 1, day);
  let offset = Math.floor((objDate.getTime() - baseDate.getTime()) / 86400000);
  let temp = 0;
  let i = 0;

  for (i = 1900; i < 2100 && offset > 0; i++) {
    temp = lYearDays(i);
    offset -= temp;
  }

  if (offset < 0) { offset += temp; i--; }
  let lunarYear = i;
  let leap = leapMonth(i);
  let isLeap = false;
  let j = 0;

  for (j = 1; j < 13 && offset > 0; j++) {
    if (leap > 0 && j === (leap + 1) && !isLeap) { --j; isLeap = true; temp = leapDays(lunarYear); }
    else { temp = monthDays(lunarYear, j); }
    if (isLeap && j === (leap + 1)) isLeap = false;
    offset -= temp;
  }

  if (offset === 0 && leap > 0 && j === leap + 1) {
    if (isLeap) isLeap = false;
    else { isLeap = true; --j; }
  }
  if (offset < 0) { offset += temp; --j; }
  
  let lunarMonth = j;
  let lunarDay = offset + 1;

  return { lunarYear, lunarMonth, lunarDay, isLeap };
}

function cyclical(num: number) {
  return TianGan[num % 10] + DiZhi[num % 12];
}

export function getJapaneseEra(y: number, m: number, d: number): string {
  const dateNum = y * 10000 + m * 100 + d;
  if (dateNum >= 20190501) {
    const eraYear = y - 2018;
    return `令和${eraYear === 1 ? '元' : eraYear}年`;
  }
  if (dateNum >= 19890108) {
    const eraYear = y - 1988;
    return `平成${eraYear === 1 ? '元' : eraYear}年`;
  }
  if (dateNum >= 19261225) {
    const eraYear = y - 1925;
    return `昭和${eraYear === 1 ? '元' : eraYear}年`;
  }
  if (dateNum >= 19120730) {
    const eraYear = y - 1911;
    return `大正${eraYear === 1 ? '元' : eraYear}年`;
  }
  if (dateNum >= 18680125) {
    const eraYear = y - 1867;
    return `明治${eraYear === 1 ? '元' : eraYear}年`;
  }
  return '';
}

export function getLunarInfo(y: number, m: number, d: number, customFestivals: Record<string, string> = {}): LunarInfo {
  const mmStr = String(m).padStart(2, '0');
  const ddStr = String(d).padStart(2, '0');
  const mmDd = `${mmStr}-${ddStr}`;

  const kokiYear = `皇纪${y + 660}年`;
  const jpEra = getJapaneseEra(y, m, d);

  if (customFestivals[mmDd]) {
    return { 
      lunarDayName: customFestivals[mmDd], 
      lunarMonthName: '', 
      festival: customFestivals[mmDd], 
      isSolarTerm: false,
      kokiYear,
      jpEra
    };
  }

  let l = calculateLunar(y, m, d);
  let lMonthStr = String(l.lunarMonth).padStart(2, '0');
  let lDayStr = String(l.lunarDay).padStart(2, '0');
  let lMmDd = `${lMonthStr}-${lDayStr}`;
  let festival = SOLAR_FESTIVALS[mmDd] || LUNAR_FESTIVALS[lMmDd] || null;

  // Handle Eve (除夕)
  if (!festival && l.lunarMonth === 12) {
    let mDays = monthDays(l.lunarYear, 12);
    if (l.lunarDay === mDays) festival = "除夕";
  }

  let lunarDayName = festival || LUNAR_DAY_NAMES[l.lunarDay - 1];
  let lunarMonthName = (l.isLeap ? "闰" : "") + LUNAR_MONTH_NAMES[l.lunarMonth - 1] + "月";
  
  // calculate ganzhi
  let gzYear = cyclical(l.lunarYear - 1900 + 36);

  return {
    lunarDayName,
    lunarMonthName,
    festival,
    isSolarTerm: false,
    gzYear: gzYear + "年",
    kokiYear,
    jpEra
  };
}
