import { useMemo, useState } from 'react'
import { CircleOffIcon, PlusIcon, RadarIcon, SearchIcon, TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/src/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/src/components/ui/input-group'
import { ScrollArea } from '@/src/components/ui/scroll-area'
import { Skeleton } from '@/src/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/src/components/ui/tooltip'
import type { AccessRule } from '../../../src/domain/types'

function targetSummary(rule: AccessRule): string {
  const schemes = rule.target.schemes.length === 2 ? 'http(s)' : rule.target.schemes[0] ?? 'https'
  const host = rule.target.includeSubdomains ? `*.${rule.target.host}` : rule.target.host
  return `${schemes}://${host}${rule.target.path}`
}

interface RuleRailProps {
  rules: AccessRule[]
  selectedId: string | undefined
  conflicts: Set<string>
  loading: boolean
  onSelect: (id: string) => void
  onAdd: () => void
}

export function RuleRail({ rules, selectedId, conflicts, loading, onSelect, onAdd }: RuleRailProps) {
  const [query, setQuery] = useState('')
  const filteredRules = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return rules
    return rules.filter((rule) => `${rule.name} ${targetSummary(rule)}`.toLocaleLowerCase().includes(needle))
  }, [query, rules])

  return (
    <aside className="rule-rail" aria-label="访问规则">
      <div className="rail-heading">
        <div>
          <span className="kicker">FLIGHT PLANS</span>
          <h2>访问规则</h2>
        </div>
        <Button size="icon" onClick={onAdd} aria-label="新建规则"><PlusIcon /></Button>
      </div>
      <InputGroup>
        <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索航线" />
        <InputGroupAddon><SearchIcon /></InputGroupAddon>
      </InputGroup>
      <ScrollArea className="rule-scroll">
        <div className="rule-stack">
          {loading ? Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          )) : null}
          {!loading && filteredRules.map((rule, index) => (
            <Button
              key={rule.id}
              variant={rule.id === selectedId ? 'secondary' : 'ghost'}
              className="h-auto w-full justify-start"
              onClick={() => onSelect(rule.id)}
            >
              <span className="rule-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="rule-copy">
                <strong>{rule.name}</strong>
                <small>{targetSummary(rule)}</small>
              </span>
              {conflicts.has(rule.id) ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="conflict-icon" aria-label="与其他规则可能重叠"><TriangleAlertIcon /></span>
                  </TooltipTrigger>
                  <TooltipContent>与其他规则可能重叠</TooltipContent>
                </Tooltip>
              ) : (
                <Badge variant={rule.enabled ? 'default' : 'outline'}>{rule.enabled ? '在线' : '停用'}</Badge>
              )}
            </Button>
          ))}
          {!loading && filteredRules.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{rules.length === 0 ? <RadarIcon /> : <CircleOffIcon />}</EmptyMedia>
                <EmptyTitle>{rules.length === 0 ? '尚未部署航线' : '没有匹配规则'}</EmptyTitle>
                <EmptyDescription>{rules.length === 0 ? '创建第一条访问规则。' : '尝试其他关键词。'}</EmptyDescription>
              </EmptyHeader>
              {rules.length === 0 ? <EmptyContent><Button onClick={onAdd}><PlusIcon data-icon="inline-start" />新建规则</Button></EmptyContent> : null}
            </Empty>
          ) : null}
        </div>
      </ScrollArea>
      <div className="rail-footer">
        <span>NODE 01</span>
        <span>{rules.filter((rule) => rule.enabled).length} ACTIVE</span>
      </div>
    </aside>
  )
}
