import { Link } from 'react-router-dom';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/" aria-label="Anteraja, beranda">
      <img src="/anteraja-logo.png" alt="Anteraja" />
    </Link>
  );
}
