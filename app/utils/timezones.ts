export interface TimezoneOption {
  value: string
  label: string
}

export const COMMON_TIMEZONES: TimezoneOption[] = [
  { value: 'Asia/Shanghai', label: 'UTC+8 中国标准时间' },
  { value: 'Asia/Tokyo', label: 'UTC+9 日本标准时间' },
  { value: 'Asia/Seoul', label: 'UTC+9 韩国标准时间' },
  { value: 'Asia/Singapore', label: 'UTC+8 新加坡时间' },
  { value: 'Asia/Hong_Kong', label: 'UTC+8 香港时间' },
  { value: 'Asia/Taipei', label: 'UTC+8 台北时间' },
  { value: 'Asia/Bangkok', label: 'UTC+7 泰国时间' },
  { value: 'Asia/Jakarta', label: 'UTC+7 印尼西部时间' },
  { value: 'Asia/Kolkata', label: 'UTC+5:30 印度标准时间' },
  { value: 'Asia/Dubai', label: 'UTC+4 阿联酋时间' },
  { value: 'America/New_York', label: 'UTC-5/-4 美国东部时间' },
  { value: 'America/Chicago', label: 'UTC-6/-5 美国中部时间' },
  { value: 'America/Denver', label: 'UTC-7/-6 美国山地时间' },
  { value: 'America/Los_Angeles', label: 'UTC-8/-7 美国太平洋时间' },
  { value: 'America/Vancouver', label: 'UTC-8/-7 加拿大太平洋时间' },
  { value: 'America/Toronto', label: 'UTC-5/-4 加拿大东部时间' },
  { value: 'America/Sao_Paulo', label: 'UTC-3 巴西时间' },
  { value: 'Europe/London', label: 'UTC+0/+1 英国时间' },
  { value: 'Europe/Paris', label: 'UTC+1/+2 中欧时间' },
  { value: 'Europe/Berlin', label: 'UTC+1/+2 德国时间' },
  { value: 'Europe/Moscow', label: 'UTC+3 莫斯科时间' },
  { value: 'Australia/Sydney', label: 'UTC+10/+11 澳大利亚东部时间' },
  { value: 'Australia/Perth', label: 'UTC+8 澳大利亚西部时间' },
  { value: 'Pacific/Auckland', label: 'UTC+12/+13 新西兰时间' },
  { value: 'Pacific/Honolulu', label: 'UTC-10 夏威夷时间' },
  { value: 'Africa/Cairo', label: 'UTC+2 埃及时间' },
  { value: 'Africa/Johannesburg', label: 'UTC+2 南非时间' },
]

const commonTimezoneValues = new Set(COMMON_TIMEZONES.map((timezone) => timezone.value))
const commonTimezoneLabelByValue = new Map(COMMON_TIMEZONES.map((timezone) => [timezone.value, timezone.label] as const))

type IntlWithSupportedValuesOf = typeof Intl & {
  supportedValuesOf?: (key: 'timeZone') => string[]
}

const intlWithSupportedValuesOf = Intl as IntlWithSupportedValuesOf

export function getSupportedTimezones(): string[] {
  const supportedTimezones = intlWithSupportedValuesOf.supportedValuesOf?.('timeZone') ?? []
  return Array.from(new Set(supportedTimezones)).sort((a, b) => a.localeCompare(b))
}

export function getOtherTimezones(): string[] {
  return getSupportedTimezones().filter((timezone) => !commonTimezoneValues.has(timezone))
}

export function getTimezoneLabel(timezone: string): string {
  return commonTimezoneLabelByValue.get(timezone) ?? timezone
}

