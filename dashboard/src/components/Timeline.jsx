import React from 'react';
import { Check } from 'lucide-react';

const STEPS = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'joining', label: 'Joining' },
  { id: 'recording', label: 'Recording' },
  { id: 'transcribing', label: 'Transcribing' },
  { id: 'diarizing', label: 'Diarizing' },
  { id: 'generating_mom', label: 'MOM Gen' },
  { id: 'completed', label: 'Completed' },
];

export default function Timeline({ status, currentStage }) {
  const getStepIndex = (st, stage) => {
    const combined = (stage || st || '').toLowerCase();
    if (combined === 'completed' || combined === 'delivered') return 6;
    if (combined === 'generating_mom' || combined === 'mom_ready') return 5;
    if (combined === 'diarizing' || combined === 'diarized' || combined === 'merging' || combined === 'merged') return 4;
    if (combined === 'transcribing' || combined === 'transcribed' || combined === 'processing') return 3;
    if (combined === 'recording' || combined === 'recorded') return 2;
    if (combined === 'joining' || combined === 'waiting_for_admission') return 1;
    return 0;
  };

  const activeIndex = getStepIndex(status, currentStage);
  const isFailed = (status || '').toLowerCase() === 'failed';

  return (
    <div style={{ margin: '20px 0', padding: '16px 20px', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '16px' }}>
        Pipeline Lifecycle
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        {/* Connecting Line */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '14px',
            right: '14px',
            height: '1px',
            backgroundColor: 'var(--border)',
            zIndex: 0,
          }}
        />

        {STEPS.map((step, index) => {
          const isCompleted = !isFailed && index < activeIndex;
          const isCurrent = !isFailed && index === activeIndex;
          const isStepFailed = isFailed && index === activeIndex;

          let borderColor = 'var(--border)';
          let bgColor = 'var(--bg-surface)';
          let textColor = 'var(--text-muted)';

          if (isCompleted) {
            borderColor = 'var(--status-success)';
            bgColor = 'var(--status-success)';
            textColor = '#FFFFFF';
          } else if (isCurrent) {
            borderColor = 'var(--brand-blue)';
            bgColor = 'var(--brand-blue)';
            textColor = '#FFFFFF';
          } else if (isStepFailed) {
            borderColor = 'var(--status-error)';
            bgColor = 'var(--status-error)';
            textColor = '#FFFFFF';
          }

          return (
            <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', position: 'relative', zIndex: 1 }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                  backgroundColor: bgColor,
                  border: `1px solid ${borderColor}`,
                  color: textColor,
                }}
              >
                {isCompleted ? (
                  <Check size={12} strokeWidth={2.5} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: isCurrent ? 600 : 500,
                  color: isCurrent ? 'var(--text-primary)' : isStepFailed ? 'var(--status-error)' : 'var(--text-secondary)',
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
