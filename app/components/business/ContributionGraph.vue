<script setup lang="ts">
import type { ChallengerContribution, ContributionDay } from '~/types/progress'

interface Props {
  contributions: ChallengerContribution[]
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  unit: string
  myRole: 'CHALLENGER' | 'SUPERVISOR'
  myMemberId: number
  targetValue: number
}

const props = defineProps<Props>()

const expandedMemberIds = ref<Set<number>>(new Set())

function toggleExpand(memberId: number) {
  const next = new Set(expandedMemberIds.value)
  if (next.has(memberId)) {
    next.delete(memberId)
  } else {
    next.add(memberId)
  }
  expandedMemberIds.value = next
}

function isExpanded(memberId: number): boolean {
  return expandedMemberIds.value.has(memberId)
}

// 挑战者默认展开自己的，监督者展开所有
onMounted(() => {
  if (props.myRole === 'SUPERVISOR') {
    expandedMemberIds.value = new Set(props.contributions.map(c => c.memberId))
  } else {
    const mine = props.contributions.find(c => c.memberId === props.myMemberId)
    if (mine) {
      expandedMemberIds.value = new Set([mine.memberId])
    }
  }
})

// 生成日期范围内所有日期
function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const current = new Date(start + 'T00:00:00Z')
  const endDate = new Date(end + 'T00:00:00Z')
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]!)
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

// 按周排列（周一开始）
function groupByWeeks(dates: string[]): string[][] {
  if (dates.length === 0) return []
  const weeks: string[][] = []
  let currentWeek: string[] = []

  // 填充第一周前面的空位
  const firstDay = new Date(dates[0]! + 'T00:00:00Z')
  const firstDayOfWeek = (firstDay.getUTCDay() + 6) % 7 // 0=Mon
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push('')
  }

  for (const date of dates) {
    currentWeek.push(date)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }
  return weeks
}

const allDates = computed(() => generateDateRange(props.startDate, props.endDate))
const weeks = computed(() => groupByWeeks(allDates.value))
const dailyAvg = computed(() => {
  const totalDays = allDates.value.length
  return totalDays > 0 ? props.targetValue / totalDays : 1
})

const cellSize = 14
const cellGap = 3
const labelWidth = 20

const svgWidth = computed(() => labelWidth + weeks.value.length * (cellSize + cellGap))
const svgHeight = 7 * (cellSize + cellGap) + 20 // +20 for month labels

const weekDayLabels = ['一', '', '三', '', '五', '', '日']

function buildDayMap(days: ContributionDay[]): Map<string, ContributionDay> {
  const map = new Map<string, ContributionDay>()
  for (const d of days) {
    map.set(d.date, d)
  }
  return map
}

function getCellColor(day: ContributionDay | undefined): string {
  if (!day) return '#ebedf0'

  const hasConfirmed = day.confirmedValue > 0
  const hasPending = day.pendingValue > 0
  const hasDisputed = day.disputedValue > 0

  if (hasConfirmed) {
    const avg = dailyAvg.value
    const ratio = day.confirmedValue / avg
    // 同色相 #0D9488 的四级深浅（25%/50%/75%/100% 不透明度预混白底）
    if (ratio >= 1.5) return '#0D9488'  // 100%
    if (ratio >= 1) return '#4aafa6'    // 75%
    if (ratio >= 0.5) return '#86c9c4'  // 50%
    return '#c2e4e2'                     // 25%
  }
  if (hasPending) return '#fbbf24' // amber-400
  if (hasDisputed) return '#f87171' // red-400

  return '#ebedf0'
}

function getCellBorder(day: ContributionDay | undefined): string {
  if (!day) return 'none'
  // 如果同时有多种状态，加边框提示
  const states = [day.confirmedValue > 0, day.pendingValue > 0, day.disputedValue > 0].filter(Boolean).length
  if (states > 1) return '1px solid rgba(0,0,0,0.15)'
  return 'none'
}

function getTooltipText(date: string, day: ContributionDay | undefined): string {
  if (!day) return `${date}: 无数据`
  const parts = [date]
  if (day.confirmedValue > 0) parts.push(`已确认: ${day.confirmedValue}`)
  if (day.pendingValue > 0) parts.push(`待审核: ${day.pendingValue}`)
  if (day.disputedValue > 0) parts.push(`质疑: ${day.disputedValue}`)
  if (day.confirmedValue === 0 && day.pendingValue === 0 && day.disputedValue === 0) {
    parts.push('无数据')
  }
  return parts.join(' | ')
}

// 月份标签
function getMonthLabels(): { text: string; x: number }[] {
  const labels: { text: string; x: number }[] = []
  let lastMonth = -1
  for (let wi = 0; wi < weeks.value.length; wi++) {
    const week = weeks.value[wi]!
    for (const date of week) {
      if (!date) continue
      const month = new Date(date + 'T00:00:00Z').getUTCMonth()
      if (month !== lastMonth) {
        lastMonth = month
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
        labels.push({
          text: monthNames[month]!,
          x: labelWidth + wi * (cellSize + cellGap),
        })
        break
      }
    }
  }
  return labels
}

const monthLabels = computed(() => getMonthLabels())

// Tooltip state
const tooltip = ref<{ show: boolean; text: string; x: number; y: number }>({
  show: false, text: '', x: 0, y: 0,
})

function showTooltip(event: MouseEvent, text: string) {
  tooltip.value = {
    show: true,
    text,
    x: event.clientX,
    y: event.clientY,
  }
}

function hideTooltip() {
  tooltip.value.show = false
}
</script>

<template>
  <div class="bg-white rounded-2xl shadow-lg p-6">
    <h3 class="text-lg font-semibold text-foreground mb-5 flex items-center gap-1.5">
      <Icon name="lucide:calendar" class="w-5 h-5 text-primary" />
      打卡贡献图
    </h3>

    <!-- 图例 -->
    <div class="flex items-center gap-4 mb-4 text-xs text-gray-500">
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-sm" style="background: #c2e4e2" />
        <span class="w-3 h-3 rounded-sm" style="background: #86c9c4" />
        <span class="w-3 h-3 rounded-sm" style="background: #4aafa6" />
        <span class="w-3 h-3 rounded-sm" style="background: #0D9488" />
        <span class="ml-1">已确认</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-sm" style="background: #fbbf24" />
        <span>待审核</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-sm" style="background: #f87171" />
        <span>质疑</span>
      </div>
      <div class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-sm" style="background: #ebedf0" />
        <span>无数据</span>
      </div>
    </div>

    <!-- 每个挑战者的贡献图 -->
    <div class="space-y-3">
      <div
        v-for="contrib in contributions"
        :key="contrib.memberId"
        class="border border-gray-100 rounded-xl overflow-hidden"
      >
        <!-- 折叠头 -->
        <button
          class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
          @click="toggleExpand(contrib.memberId)"
        >
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <span class="text-xs font-medium text-primary">{{ contrib.nickname[0] }}</span>
            </div>
            <span class="text-sm font-medium text-foreground">{{ contrib.nickname }}</span>
          </div>
          <Icon
            name="lucide:chevron-down"
            :class="['w-4 h-4 text-gray-400 transition-transform', isExpanded(contrib.memberId) ? 'rotate-180' : '']"
          />
        </button>

        <!-- 贡献图内容 -->
        <div v-show="isExpanded(contrib.memberId)" class="px-4 pb-4 overflow-x-auto">
          <div class="relative inline-block" :style="{ minWidth: svgWidth + 'px' }">
            <svg :width="svgWidth" :height="svgHeight" class="block">
              <!-- 月份标签 -->
              <text
                v-for="label in monthLabels"
                :key="label.text + label.x"
                :x="label.x"
                :y="10"
                class="fill-gray-400"
                font-size="10"
              >
                {{ label.text }}
              </text>

              <!-- 星期标签 -->
              <text
                v-for="(label, di) in weekDayLabels"
                :key="'day-' + di"
                :x="0"
                :y="20 + di * (cellSize + cellGap) + cellSize - 2"
                class="fill-gray-400"
                font-size="9"
              >
                {{ label }}
              </text>

              <!-- 格子 -->
              <template v-for="(week, wi) in weeks" :key="'w-' + wi">
                <rect
                  v-for="(date, di) in week"
                  :key="'c-' + wi + '-' + di"
                  :x="labelWidth + wi * (cellSize + cellGap)"
                  :y="20 + di * (cellSize + cellGap)"
                  :width="cellSize"
                  :height="cellSize"
                  rx="2"
                  :fill="date ? getCellColor(buildDayMap(contrib.days).get(date)) : 'transparent'"
                  :style="{ outline: date ? getCellBorder(buildDayMap(contrib.days).get(date)) : 'none' }"
                  class="cursor-pointer"
                  @mouseenter="date && showTooltip($event, getTooltipText(date, buildDayMap(contrib.days).get(date)))"
                  @mouseleave="hideTooltip"
                />
              </template>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Tooltip (teleported to body to avoid clipping) -->
    <Teleport to="body">
      <div
        v-show="tooltip.show"
        class="fixed pointer-events-none bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-50"
        :style="{ left: tooltip.x + 'px', top: (tooltip.y - 36) + 'px', transform: 'translateX(-50%)' }"
      >
        {{ tooltip.text }}
      </div>
    </Teleport>
  </div>
</template>
