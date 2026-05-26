/**
 * Region detection from node display names.
 *
 * Strategy:
 *   1. emoji flag heuristics (🇭🇰 -> HK)
 *   2. keyword regex table
 *   3. fallback "UNKNOWN"
 *
 * Country code conversion: a 4-byte regional indicator emoji like 🇭🇰
 * encodes ISO-3166-1 alpha-2 letters offset by 0x1F1E6.
 */

const REGION_PATTERNS: Array<[RegExp, string]> = [
  [/(香港|港|HK\b|Hong\s*Kong|HKG)/i, 'HK'],
  [/(台湾|台|TW\b|Tai\s*wan|TPE)/i, 'TW'],
  [/(日本|日|JP\b|Japan|Tokyo|Osaka|NRT|HND|KIX)/i, 'JP'],
  [/(韩国|韩|KR\b|Korea|Seoul|ICN)/i, 'KR'],
  [/(新加坡|狮城|SG\b|Singapore|SIN)/i, 'SG'],
  [/(美国|美|US\b|USA|United\s*States|LA|SF|Seattle|NewYork|LAX|SFO|JFK|SEA)/i, 'US'],
  [/(英国|英|UK\b|GB\b|United\s*Kingdom|London|LHR)/i, 'GB'],
  [/(德国|德|DE\b|Germany|Frankfurt|FRA)/i, 'DE'],
  [/(法国|法|FR\b|France|Paris|CDG)/i, 'FR'],
  [/(俄罗斯|俄|RU\b|Russia|Moscow)/i, 'RU'],
  [/(加拿大|加|CA\b|Canada|Toronto|YYZ)/i, 'CA'],
  [/(澳大利亚|澳|AU\b|Australia|Sydney|SYD)/i, 'AU'],
  [/(印度|印|IN\b|India|Mumbai|BOM)/i, 'IN'],
  [/(土耳其|土|TR\b|Turkey|Istanbul|IST)/i, 'TR'],
  [/(荷兰|NL\b|Netherlands|Amsterdam|AMS)/i, 'NL'],
  [/(意大利|IT\b|Italy|Milan|MXP)/i, 'IT'],
  [/(巴西|BR\b|Brazil|Sao\s*Paulo|GRU)/i, 'BR'],
  [/(阿根廷|AR\b|Argentina)/i, 'AR'],
  [/(越南|VN\b|Vietnam|Saigon|SGN)/i, 'VN'],
  [/(泰国|TH\b|Thailand|Bangkok|BKK)/i, 'TH'],
  [/(马来|MY\b|Malaysia|Kuala\s*Lumpur|KUL)/i, 'MY'],
  [/(菲律宾|PH\b|Philippines|Manila|MNL)/i, 'PH'],
  [/(印尼|ID\b|Indonesia|Jakarta|CGK)/i, 'ID'],
  [/(阿联酋|AE\b|UAE|Dubai|DXB)/i, 'AE'],
  [/(以色列|IL\b|Israel|TLV)/i, 'IL'],
  [/(南非|ZA\b|South\s*Africa|Johannesburg|JNB)/i, 'ZA'],
  [/(西班牙|ES\b|Spain|Madrid|MAD)/i, 'ES'],
  [/(瑞士|CH\b|Switzerland|Zurich|ZRH)/i, 'CH'],
  [/(瑞典|SE\b|Sweden|Stockholm|ARN)/i, 'SE'],
  [/(挪威|NO\b|Norway|Oslo|OSL)/i, 'NO'],
  [/(波兰|PL\b|Poland|Warsaw|WAW)/i, 'PL'],
  [/(乌克兰|UA\b|Ukraine|Kyiv|KBP)/i, 'UA'],
  [/(墨西哥|MX\b|Mexico)/i, 'MX'],
  [/(智利|CL\b|Chile)/i, 'CL'],
  [/(澳门|MO\b|Macao|Macau)/i, 'MO'],
]

const flagToCC = (s: string): string | undefined => {
  // Look for two consecutive regional indicator symbols (U+1F1E6 ~ U+1F1FF)
  const re = /[\u{1F1E6}-\u{1F1FF}]{2}/u
  const m = s.match(re)
  if (!m) return undefined
  const cps = [...m[0]]
  if (cps.length < 2) return undefined
  const a = cps[0]!.codePointAt(0)! - 0x1f1e6
  const b = cps[1]!.codePointAt(0)! - 0x1f1e6
  return String.fromCharCode(0x41 + a, 0x41 + b)
}

export const detectRegion = (label: string): string => {
  const flag = flagToCC(label)
  if (flag) return flag
  for (const [re, code] of REGION_PATTERNS) {
    if (re.test(label)) return code
  }
  return 'UNKNOWN'
}
