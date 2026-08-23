import type { ChangeEvent, ReactNode } from 'react';

type NativeOption = {
  id: string;
  label: string;
  disabled?: boolean;
};

type NativeSelectProps = {
  label: string;
  value: string;
  options: NativeOption[];
  onChange: (value: string) => void;
  hideLabel?: boolean;
  className?: string;
};

export function NativeSelect({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  className = '',
}: NativeSelectProps) {
  return (
    <label className={`bardo-native-field ${className}`.trim()}>
      {!hideLabel && <span className="bardo-native-label">{label}</span>}
      <select
        className="bardo-native-select"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

type NativeOverlaySelectProps = {
  label: string;
  value: string;
  options: NativeOption[];
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
};

export function NativeOverlaySelect({
  label,
  value,
  options,
  onChange,
  children,
  className = '',
}: NativeOverlaySelectProps) {
  return (
    <div className={`bardo-native-overlay-select ${className}`.trim()}>
      <div className="bardo-native-overlay-visual" aria-hidden="true">{children}</div>
      <select
        className="bardo-native-overlay-control"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type NativeActionSelectProps = {
  label: string;
  options: NativeOption[];
  onAction: (value: string) => void;
  children: ReactNode;
  className?: string;
};

export function NativeActionSelect({
  label,
  options,
  onAction,
  children,
  className = '',
}: NativeActionSelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (!value) return;
    onAction(value);
    event.target.value = '';
  };

  return (
    <div className={`bardo-native-overlay-select ${className}`.trim()}>
      <div className="bardo-native-overlay-visual" aria-hidden="true">{children}</div>
      <select
        className="bardo-native-overlay-control"
        aria-label={label}
        defaultValue=""
        onChange={handleChange}
      >
        <option value="" disabled>Opciones</option>
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
