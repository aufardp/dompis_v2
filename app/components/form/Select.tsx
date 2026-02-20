import React, { useEffect, useMemo, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  options: Option[];
  placeholder?: string;
  onChange: (value: string) => void;
  className?: string;
  defaultValue?: string;
  value?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
}

const Select: React.FC<SelectProps> = ({
  options,
  placeholder = 'Select an option',
  onChange,
  className = '',
  defaultValue = '',
  value,
  allowEmpty = true,
  disabled = false,
}) => {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(defaultValue);

  useEffect(() => {
    if (!isControlled) setInternalValue(defaultValue);
  }, [defaultValue, isControlled]);

  const selectedValue = isControlled ? value : internalValue;

  const computedOptions = useMemo(() => {
    if (!allowEmpty) return options;
    return [{ value: '', label: placeholder }, ...options];
  }, [allowEmpty, options, placeholder]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!isControlled) setInternalValue(value);
    onChange(value); // Trigger parent handler
  };

  return (
    <select
      className={`shadow-theme-xs focus:border-brand-300 focus:ring-brand-500/10 dark:focus:border-brand-800 h-11 w-full appearance-none rounded-lg border border-gray-300 px-4 py-2.5 pr-11 text-sm placeholder:text-gray-400 focus:ring-3 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 ${
        selectedValue
          ? 'text-gray-800 dark:text-white/90'
          : 'text-gray-400 dark:text-gray-400'
      } ${className}`}
      value={selectedValue}
      onChange={handleChange}
      disabled={disabled}
    >
      {/* Map over options */}
      {computedOptions.map((option) => (
        <option
          key={option.value}
          value={option.value}
          className='text-gray-700 dark:bg-gray-900 dark:text-gray-400'
        >
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default Select;
