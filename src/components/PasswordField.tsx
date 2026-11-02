import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { isStrongPassword, passwordRequirements } from '../utils/passwordPolicy';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'current-password';
  showRequirements?: boolean;
  matches?: boolean;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({ label, value, onChange, autoComplete, showRequirements = false, matches }) => {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const valid = value.length > 0 && (matches ?? (showRequirements && isStrongPassword(value)));
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] text-content-2 uppercase mb-1">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={autoComplete === 'new-password' ? `new-password-${id}` : 'password'}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={event => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-describedby={showRequirements ? `${id}-requirements` : undefined}
          aria-invalid={matches === false && value.length > 0 ? true : undefined}
          className={`w-full px-3 py-2 pr-11 bg-surface-2 border rounded-xl text-xs text-content-1 focus:outline-none ${
            valid ? 'border-emerald-500 focus:border-emerald-500' : 'border-line focus:border-violet-500'
          }`}
        />
        <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}
          onClick={() => setVisible(value => !value)} className="absolute right-0 top-0 h-full px-3 text-content-2">
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {showRequirements && (
        <ul id={`${id}-requirements`} className="mt-2 space-y-1 text-[10px]" aria-label="Password requirements">
          {passwordRequirements(value).map(requirement => (
            <li key={requirement.label} className={requirement.met ? 'text-emerald-500' : 'text-content-2'}>
              {requirement.met ? 'Met: ' : 'Pending: '}{requirement.label}
            </li>
          ))}
        </ul>
      )}
      {matches === false && value && <p className="mt-1 text-[10px] text-red-400">Passwords do not match.</p>}
    </div>
  );
};
