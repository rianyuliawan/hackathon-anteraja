import { useEffect, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiBox, FiCheckCircle, FiPackage, FiSearch, FiTruck, FiX } from 'react-icons/fi';
import { get, unwrap } from '../lib/api';
import type { TrackingPreview } from '../lib/types';
import { Badge, Button, dateTime, Loading } from '../ui';

const MAX_AWBS = 10;
const AWB_PATTERN = /^\d{14}$/;
type Result = { awb: string; preview?: TrackingPreview; error?: string };

export function TrackingPage({ awb = '' }: { awb?: string }) {
  const navigate = useNavigate();
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchRetry, setSearchRetry] = useState(0);

  useEffect(() => {
    const next = [...new Set(awb.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))].slice(0, MAX_AWBS);
    setChips(next);
    setDraft('');
    setInputError('');
  }, [awb]);

  useEffect(() => {
    const numbers = [...new Set(awb.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))].slice(0, MAX_AWBS);
    if (!numbers.length) {
      setResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    setResults([]);
    Promise.all(numbers.map(async (number): Promise<Result> => {
      try {
        const preview = unwrap<TrackingPreview>(await get<unknown>(`/api/v1/tracking/${encodeURIComponent(number)}/preview`));
        return { awb: number, preview };
      } catch (cause) {
        return { awb: number, error: cause instanceof Error ? cause.message : 'Resi tidak dapat dimuat.' };
      }
    })).then((loaded) => {
      if (active) setResults(loaded);
    }).finally(() => {
      if (active) setSearching(false);
    });
    return () => { active = false; };
  }, [awb, searchRetry]);

  const append = (candidates: string[], base = chips) => {
    const clean = candidates.map((value) => value.trim()).filter(Boolean);
    const invalid = clean.find((value) => !AWB_PATTERN.test(value));
    if (invalid) {
      setInputError(`Format ${invalid} belum sesuai. Masukkan 14 angka seperti 11004099490272.`);
      return false;
    }
    const next = [...new Set([...base, ...clean])];
    if (next.length > MAX_AWBS) {
      setInputError(`Maksimal ${MAX_AWBS} nomor resi dalam satu pencarian.`);
      return false;
    }
    setChips(next);
    setInputError('');
    return true;
  };

  const changeDraft = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!/[,;\s]/.test(value)) {
      setDraft(value);
      setInputError('');
      return;
    }
    const parts = value.split(/[,;\s]+/);
    const tail = /[,;\s]$/.test(value) ? '' : parts.pop() || '';
    if (append(parts)) setDraft(tail);
  };

  const pasteAwbs = (event: ClipboardEvent<HTMLInputElement>) => {
    const value = event.clipboardData.getData('text');
    if (!/[,;\s]/.test(value)) return;
    event.preventDefault();
    if (append([...draft.split(/[,;\s]+/), ...value.split(/[,;\s]+/)])) setDraft('');
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !draft && chips.length) {
      setChips((current) => current.slice(0, -1));
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = [...new Set([...chips, ...draft.split(/[,;\s]+/).map((value) => value.trim()).filter(Boolean)])];
    if (!next.length) {
      setInputError('Masukkan minimal satu nomor resi.');
      return;
    }
    if (!append(next, [])) return;
    setDraft('');
    const value = next.join(',');
    if (awb === value) setSearchRetry((current) => current + 1);
    else navigate(`/tracking?awb=${encodeURIComponent(value)}`);
  };

  const previews = results.filter((result) => result.preview);
  const failed = results.filter((result) => result.error);

  return (
    <div className="page mx-auto max-w-6xl">
      <section className="relative isolate overflow-hidden rounded-[1.5rem] bg-[#ffda62] px-5 py-7 text-[#3c2935] sm:px-8 sm:py-9">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#ffe898]" aria-hidden="true" />
        <div className="absolute -bottom-24 right-28 h-44 w-44 rounded-full bg-[#ffb7d5]/70" aria-hidden="true" />
        <div className="relative grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_160px]">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-[#aa216c]">
              <FiPackage aria-hidden="true" /> Pelacakan paket
            </span>
            <h1 className="mb-2 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-3xl">Paketmu sampai mana?</h1>
            <p className="mb-0 max-w-xl text-sm leading-6 text-[#654955]">
              Cek posisi paketmu dengan nomor resi. Kamu bisa melacak hingga 10 paket sekaligus.
            </p>
          </div>
          <div className="relative hidden h-32 items-center justify-center md:flex" aria-hidden="true">
            <span className="absolute left-1 top-2 h-9 w-9 rounded-full bg-white/70" />
            <span className="absolute bottom-1 right-2 h-7 w-7 rounded-full bg-[#ec1688]/20" />
            <span className="relative grid h-28 w-28 -rotate-6 place-items-center rounded-[1.75rem] border-4 border-white bg-[#ec1688] text-white shadow-[0_12px_26px_rgba(165,32,100,.2)]">
              <FiTruck size={48} />
            </span>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-[1.5rem] border border-[#f0e1e8] bg-white p-4 shadow-[0_10px_30px_rgba(109,38,74,.06)] sm:p-6">
        <form role="search" onSubmit={submit}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <label htmlFor="tracking-awbs" className="text-sm font-bold text-[#3a2936]">Nomor resi / AWB</label>
            <span className="rounded-full bg-[#fff0f7] px-2.5 py-1 text-xs font-bold text-[#b42370]">{chips.length}/{MAX_AWBS} resi</span>
          </div>
          <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-[#e8dce4] bg-[#fffafd] p-2 focus-within:border-[#e82d8e] focus-within:ring-2 focus-within:ring-[#ffdfed]">
            <FiSearch className="ml-2 shrink-0 text-[#cb2679]" size={19} aria-hidden="true" />
            {chips.map((number) => (
              <span key={number} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#e92788] py-1 pl-3 pr-1 font-mono text-xs font-bold text-white">
                {number}
                <button type="button" aria-label={`Hapus resi ${number}`} onClick={() => { setChips((current) => current.filter((value) => value !== number)); setInputError(''); }} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/20">
                  <FiX size={14} />
                </button>
              </span>
            ))}
            <input id="tracking-awbs" className="min-w-36 flex-1 bg-transparent px-2 py-1 text-sm text-[#302433] outline-none placeholder:text-[#a597a2]" value={draft} onChange={changeDraft} onPaste={pasteAwbs} onKeyDown={keyDown} placeholder="Ketik resi, pisahkan dengan koma" autoComplete="off" inputMode="numeric" aria-invalid={Boolean(inputError)} aria-describedby="awb-help" disabled={chips.length >= MAX_AWBS} />
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p id="awb-help" role="status" className={`mb-0 text-xs leading-5 ${inputError ? 'font-semibold text-[#b32255]' : 'text-[#897b88]'}`}>
              {inputError || 'Pisahkan dengan koma untuk membuat chip resi.'}
            </p>
            <Button type="submit" className="min-h-11 shrink-0 justify-center rounded-xl! px-6">Cari paket <FiArrowRight size={17} /></Button>
          </div>
        </form>
      </section>

      {searching ? <Loading label="Mencari paket di database…" /> : null}

      {!searching && previews.length ? (
        <section className="mt-7" aria-label="Preview paket">
          <div className="mb-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-[.14em] text-[#b42370]">Hasil pencarian</p>
            <h2 className="mb-0 text-xl font-extrabold text-[#392b37]">Preview paket</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {previews.map(({ awb: number, preview }) => preview && (
              <article key={number} className="flex flex-col rounded-[1.4rem] border border-[#f0e2e9] bg-white p-5 shadow-[0_10px_30px_rgba(109,38,74,.05)] sm:p-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff0f7] text-[#d6237e]"><FiBox size={22} /></span>
                  <Badge status={preview.status} />
                </div>
                <p className="mb-1 text-xs font-semibold text-[#867b85]">Nomor resi</p>
                <strong className="break-all font-mono text-lg tracking-[.035em] text-[#382c36]">{preview.awb}</strong>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-3 rounded-2xl bg-[#fff9ed] p-3 text-xs">
                  <div className="min-w-0"><span className="block text-[#8b7c71]">Dari</span><strong className="mt-1 block text-[#463741]">{preview.origin || 'Pengirim'}</strong></div>
                  <FiArrowRight className="mt-3 text-[#cf9d3f]" aria-hidden="true" />
                  <div className="min-w-0"><span className="block text-[#8b7c71]">Ke</span><strong className="mt-1 block text-[#463741]">{preview.destination || 'Tujuan'}</strong></div>
                </div>
                <p className="mb-4 mt-3 text-xs text-[#897b88]">Pembaruan terakhir: {dateTime(preview.latest_update)}</p>
                <Link to={`/tracking/${encodeURIComponent(number)}?from=${encodeURIComponent(awb)}`} className="mt-auto flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ec1688] px-4 text-sm font-bold text-white transition hover:bg-[#c91470] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ec1688]">
                  Detail paket <FiArrowRight size={17} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!searching && failed.length ? (
        <div className="mt-4 grid gap-2" role="status">
          {failed.map((result) => (
            <p key={result.awb} className="mb-0 rounded-xl border border-[#f2d6de] bg-[#fff5f6] px-4 py-3 text-sm text-[#9d3455]">
              <strong className="font-mono">{result.awb}</strong> · {result.error}
            </p>
          ))}
        </div>
      ) : null}

      {!awb && !searching ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-[#fff0f7] p-5"><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white text-[#cf2778]"><FiBox size={20} /></span><strong className="block text-sm">Ketik nomor resi</strong><p className="mb-0 mt-1 text-xs leading-5 text-[#806d7b]">Salin AWB dari toko atau pengirim.</p></div>
          <div className="rounded-2xl bg-[#fff4d9] p-5"><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white text-[#c58408]"><FiTruck size={20} /></span><strong className="block text-sm">Lihat statusnya</strong><p className="mb-0 mt-1 text-xs leading-5 text-[#806d7b]">Dapatkan preview paket yang cocok.</p></div>
          <div className="rounded-2xl bg-[#eaf8f5] p-5"><span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white text-[#2e907c]"><FiCheckCircle size={20} /></span><strong className="block text-sm">Buka detail</strong><p className="mb-0 mt-1 text-xs leading-5 text-[#806d7b]">Ikuti perjalanan dan lihat foto buktinya.</p></div>
        </div>
      ) : null}
    </div>
  );
}
