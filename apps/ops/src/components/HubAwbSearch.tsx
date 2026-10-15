import { useId, useMemo, useState } from 'react';
import { FiSearch, FiX } from 'react-icons/fi';

type Props = {
  value: string;
  onChange: (value: string) => void;
  awbs?: string[];
  placeholder?: string;
};

export function HubAwbSearch({ value, onChange, awbs = [], placeholder = 'Cari nomor resi…' }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const suggestions = useMemo(() => [...new Set(awbs.filter((awb) => /^\d{14}$/.test(awb)))]
    .filter((awb) => awb.includes(value.trim()))
    .slice(0, 8), [awbs, value]);
  const showSuggestions = open && awbs.length > 0;

  return <div className="relative w-full sm:max-w-sm" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <FiSearch size={18} className="pointer-events-none absolute left-3.5 top-[22px] -translate-y-1/2 text-[#9a8b98]" aria-hidden="true" />
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onChange={(event) => { onChange(event.target.value); setOpen(true); }}
      onFocus={() => setOpen(true)}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
      placeholder={placeholder}
      aria-label="Cari nomor resi"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={showSuggestions}
      aria-controls={showSuggestions ? listId : undefined}
      className="min-h-11 w-full rounded-xl border border-[#e8dfe6] bg-white pl-10 pr-10 text-sm outline-none focus:border-[#d62280] focus:ring-2 focus:ring-[#fce1ef]"
    />
    {value ? <button type="button" onClick={() => { onChange(''); setOpen(true); }} aria-label="Hapus pencarian" className="absolute right-2 top-[22px] grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#8a7d88] hover:bg-[#fff0f7]"><FiX size={16} /></button> : null}
    {showSuggestions ? <div id={listId} role="listbox" aria-label="Resi yang tersedia" className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-[#eadce5] bg-white p-1.5 shadow-xl shadow-[#513344]/10">
      {suggestions.length ? suggestions.map((awb) => <button key={awb} type="button" role="option" aria-selected={awb === value} onClick={() => { onChange(awb); setOpen(false); }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left font-mono text-sm text-[#49323f] hover:bg-[#fff0f7] focus:bg-[#fff0f7] focus:outline-none"><FiSearch size={14} className="shrink-0 text-[#c3337b]" />{awb}</button>) : <p className="m-0 px-3 py-2 text-sm text-[#8b7b86]">Tidak ada resi yang cocok.</p>}
    </div> : null}
  </div>;
}
