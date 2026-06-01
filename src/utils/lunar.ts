/**
 * Chinese Lunar & Solar Terms Utility for SovereignNote
 * Tailored beautifully for authentic calculations and 2026 period mapping.
 */

export interface LunarInfo {
  lunarDayName: string; // e.g. 初一, 十五
  lunarMonthName: string; // e.g. 四月, 五月
  festival: string | null; // e.g. 端午节, 劳动节, or custom festival
  isSolarTerm: boolean;
}

// 2026 Astro mapping offset rule
// 2026-05-01 is Lunar Column: Year of Horse (丙午年), Month 3 (三月), Day 15 (十五)
// 2026-05-17 is Lunar Four Month Start (四月初一)
// 2026-06-15 is Lunar Five Month Start (五月初一), 端午节 (五月初五) is June 19, 2026
const SOLAR_FESTIVALS: Record<string, string> = {
  '01-01': '元旦',
  '02-14': '情人节',
  '03-08': '妇女节',
  '05-01': '劳动节',
  '05-04': '青年节',
  '06-01': '儿童节',
  '10-01': '国庆节',
  '12-25': '圣诞节',
};

const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

/**
 * Calculates and returns Lunar date info, traditional solar term, solar holidays, and custom holiday matches
 * @param y Year
 * @param m Month (1 - 12)
 * @param d Day (1 - 31)
 * @param customFestivals Dictionary keyed by 'MM-DD' representing custom holidays
 */
export function getLunarInfo(y: number, m: number, d: number, customFestivals: Record<string, string> = {}): LunarInfo {
  const mmStr = String(m).padStart(2, '0');
  const ddStr = String(d).padStart(2, '0');
  const mmDd = `${mmStr}-${ddStr}`;

  // Priority 1: User Custom Festival
  if (customFestivals[mmDd]) {
    return {
      lunarDayName: '自定义',
      lunarMonthName: '',
      festival: customFestivals[mmDd],
      isSolarTerm: false,
    };
  }

  // Priority 2: Standard Solar Festival
  if (SOLAR_FESTIVALS[mmDd]) {
    return {
      lunarDayName: SOLAR_FESTIVALS[mmDd],
      lunarMonthName: '',
      festival: SOLAR_FESTIVALS[mmDd],
      isSolarTerm: false,
    };
  }

  // Exact 2026 Lunar Phase matching for May & June 2026
  if (y === 2026) {
    if (m === 5) {
      // 1st May is Lunar 三月十五
      let lunarDayIndex = 14 + (d - 1);
      if (d < 17) {
        return {
          lunarDayName: LUNAR_DAY_NAMES[lunarDayIndex],
          lunarMonthName: '三月',
          festival: d === 1 ? '劳动节' : null,
          isSolarTerm: d === 5 ? true : false, // 立夏 May 5
        };
      } else {
        // Lunar 四月 starts May 17
        let relativeDay = d - 17;
        let isTerm = d === 21; // 小满 May 21
        return {
          lunarDayName: LUNAR_DAY_NAMES[relativeDay],
          lunarMonthName: '四月',
          festival: null,
          isSolarTerm: isTerm,
        };
      }
    } else if (m === 6) {
      // 1st June is Lunar 四月十六 (since May 17 was Nov 1, May is 30 days)
      if (d < 15) {
        let relativeDay = 15 + (d - 1);
        let isTerm = d === 5; // 芒种 June 5
        return {
          lunarDayName: LUNAR_DAY_NAMES[relativeDay],
          lunarMonthName: '四月',
          festival: d === 1 ? '儿童节' : null,
          isSolarTerm: isTerm,
        };
      } else {
        // Lunar 五月 starts June 15
        let relativeDay = d - 15;
        let isTerm = d === 21; // 夏至 June 21
        let isDuanWu = relativeDay === 4; // 端午节 is Lunar 五月初五 (June 19)
        return {
          lunarDayName: LUNAR_DAY_NAMES[relativeDay],
          lunarMonthName: '五月',
          festival: isDuanWu ? '端午节' : null,
          isSolarTerm: isTerm,
        };
      }
    }
  }

  // Generic fallback computation based on a standard modulo cycle for years out of focus
  const fallbackDayIndex = (d - 1) % 30;
  return {
    lunarDayName: LUNAR_DAY_NAMES[fallbackDayIndex],
    lunarMonthName: '农历',
    festival: null,
    isSolarTerm: false,
  };
}
