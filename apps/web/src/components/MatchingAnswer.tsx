'use client';

import { useState } from 'react';

type Props = {
  left: string[];
  options: string[];
  images?: Record<string, string>;
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
};

export default function MatchingAnswer({
  left,
  options,
  images,
  value,
  onChange,
  disabled,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  function connect(right: string) {
    if (selected === null || disabled) return;
    const next = Array.from({ length: left.length }, (_, index) => value[index] ?? '');
    const previous = next.indexOf(right);
    if (previous !== -1) next[previous] = '';
    next[selected] = right;
    onChange(next);
    setMessage(`وصلت ${left[selected]} بـ ${right}.`);
    setSelected(null);
  }

  return (
    <div className="matching-answer">
      <p>اختر عنصرًا من العمود الأول، ثم اختر ما يقابله. يمكنك تغيير الوصلة قبل التسليم.</p>
      <div className="matching-columns">
        <div aria-label="العناصر" className="matching-column">
          {left.map((label, index) => (
            <button
              key={index}
              type="button"
              className="matching-item"
              aria-pressed={selected === index}
              disabled={disabled}
              onClick={() => {
                setSelected(index);
                setMessage(`اختر المقابل لـ ${label}.`);
              }}
            >
              <span>{label}</span>
              {value[index] && <small>↔ {value[index]}</small>}
            </button>
          ))}
        </div>
        <div aria-label="المقابلات" className="matching-column">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className="matching-item"
              disabled={disabled || selected === null}
              onClick={() => connect(option)}
              aria-label={`وصل بـ ${option}`}
            >
              {images?.[option] && (
                // The API only accepts images assigned to this lesson by the admin.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[option]} alt={option} loading="lazy" />
              )}
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="matching-status">
        {message || `وصلت ${value.filter(Boolean).length} من ${left.length}.`}
      </p>
    </div>
  );
}
