/** 已確認的人員簡稱；僅用於人員欄位，不替換雇主、工人或自由文字。 */
const staffNameAliases: Readonly<Record<string, string>> = {
  宇均: '魏宇均',
  宇鈞: '魏宇均',
  魏宇鈞: '魏宇均',
  嘉陽: '徐嘉陽',
  佩珊: '蔡佩珊',
  若儀: '蘇若儀',
  奕君: '郭奕君',
  莞莞: '林莞',
  詩涵: '劉詩涵',
  晏婷: '胡晏婷',
  芸瑄: '許芸瑄',
  淑娥: '陳淑娥',
  明書: '黃明書'
};

export function staffFullName(value: string | null | undefined): string {
  const name = String(value ?? '').trim();
  return Object.prototype.hasOwnProperty.call(staffNameAliases, name) ? staffNameAliases[name] : name;
}

/** 姓名搜尋同時保留歷史簡稱，例如「莞莞」仍可找到「林莞」。 */
export function staffSearchNames(value: string | null | undefined): string[] {
  const fullName = staffFullName(value);
  return [fullName, ...Object.keys(staffNameAliases).filter((alias) => staffNameAliases[alias] === fullName)];
}
