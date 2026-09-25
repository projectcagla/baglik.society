import ui from '@/components/ui/ui.module.css';

type Common = { name: string; label: string; hint?: string; required?: boolean };

export function Text({
  name,
  label,
  hint,
  required,
  defaultValue,
  type = 'text',
  maxLength,
  placeholder,
  inputMode,
}: Common & {
  defaultValue?: string | number | null;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = `f-${name}`;
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        className={ui.input}
        defaultValue={defaultValue ?? ''}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        inputMode={inputMode}
      />
      {hint && <p className={ui.hint}>{hint}</p>}
    </div>
  );
}

export function Area({ name, label, hint, required, defaultValue, rows = 5, maxLength }: Common & { defaultValue?: string | null; rows?: number; maxLength?: number }) {
  const id = `f-${name}`;
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <textarea id={id} name={name} className={ui.textarea} defaultValue={defaultValue ?? ''} required={required} rows={rows} maxLength={maxLength} />
      {hint && <p className={ui.hint}>{hint}</p>}
    </div>
  );
}

export function Select({
  name,
  label,
  hint,
  options,
  defaultValue,
}: Common & { options: readonly (readonly [string, string])[]; defaultValue?: string | null }) {
  const id = `f-${name}`;
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <select id={id} name={name} className={ui.select} defaultValue={defaultValue ?? options[0]?.[0]}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {hint && <p className={ui.hint}>{hint}</p>}
    </div>
  );
}

export function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className={ui.check}>
      <input type="checkbox" name={name} value="1" defaultChecked={defaultChecked} /> {label}
    </label>
  );
}
