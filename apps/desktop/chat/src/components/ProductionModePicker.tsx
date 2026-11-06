import React from 'react';
import { Clapperboard, Code2, Layers, WandSparkles } from 'lucide-react';
import { PRODUCTION_LABELS, PRODUCTION_MODES, type ProductionMode } from '@/lib/production-mode';
import { Tooltip } from './Tooltip';

const ICONS = { auto: WandSparkles, quick: Code2, drama: Clapperboard, mixed: Layers };
const TOOLTIP: Record<ProductionMode, string> = {
  auto: '自动选择适合当前需求的制作方式',
  quick: '快速创作：OpenFilm 原生动画、文字动效和现有素材剪辑',
  drama: 'AI 剧情：剧本、人物资产、分镜审核和 AI 镜头',
  mixed: '混合制作：原生剪辑与 AI 剧情镜头',
};

export function ProductionModePicker({ value, disabled, onChange }: {
  value: ProductionMode;
  disabled: boolean;
  onChange: (mode: ProductionMode) => void;
}) {
  return (
    <div role="group" aria-label="制作模式" className="mb-2 grid w-full min-w-0 grid-cols-4 gap-0.5 rounded-md border border-[var(--border)] p-0.5">
      {PRODUCTION_MODES.map((mode) => {
        const Icon = ICONS[mode];
        return (
          <Tooltip key={mode} label={TOOLTIP[mode]}>
            <button type="button" aria-label={PRODUCTION_LABELS[mode]} aria-pressed={value === mode}
              disabled={disabled} onClick={() => onChange(mode)}
              className={`flex min-h-8 min-w-0 items-center justify-center gap-1 rounded px-1 text-[12px] disabled:opacity-50 ${value === mode ? 'bg-[var(--bg-hover)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}`}>
              <Icon size={13} className="shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{PRODUCTION_LABELS[mode]}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
