import { Badge } from '@/components/ui/badge';
import type { AgentStage } from '@/lib/types';

export function stageLabel(stage: AgentStage): string {
  switch (stage) {
    case 'receiving_context':
      return 'Контекст получен';
    case 'planning':
      return 'Планирую ответ';
    case 'tooling':
      return 'Использую инструменты';
    case 'drafting':
      return 'Формирую ответ';
    case 'streaming':
      return 'Поток ответа';
    case 'done':
      return 'Готово';
    case 'error':
      return 'Ошибка';
    default:
      return stage;
  }
}

export function ChatStageBadge({ stage }: { stage: AgentStage }) {
  const variant = stage === 'error' ? 'destructive' : stage === 'done' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{stageLabel(stage)}</Badge>;
}
