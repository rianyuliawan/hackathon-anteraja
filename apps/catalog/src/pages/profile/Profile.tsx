import { useState, type FormEvent } from "react";
import { api } from "../../services/catalog.service";
import type { Buyer } from "../../types/catalog";
import Icon from "../../components/Icon";
import { errorText } from "../../utils/format";

export function Profile({
  user,
  onUser,
  logout,
}: {
  user: Buyer;
  onUser: (user: Buyer) => void;
  logout: () => void;
}) {
  const [form, setForm] = useState({
    name: user.name || "",
    phone: user.phone || "",
    default_address: user.default_address || "",
    default_postcode: user.default_postcode || "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      onUser(await api.updateProfile(form));
      setMessage("Profil berhasil diperbarui.");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell profile-page">
      <div className="page-heading">
        <span className="eyebrow dark">AKUN FASHIONAJA</span>
        <h1>Profil saya</h1>
        <p>Data ini membantu mengisi formulir checkout berikutnya.</p>
      </div>
      <div className="mx-auto max-w-2xl">
        <form className="surface-card profile-card" onSubmit={save}>
          <div className="card-title">
            <span className="title-icon">
              <Icon name="user" size={22} />
            </span>
            <div>
              <h2>Informasi akun</h2>
              <p>Perubahan profil tidak mengubah data pada pesanan lama.</p>
            </div>
          </div>
          <div className="field-grid">
            <label>
              Nama lengkap
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label>
              Nomor telepon
              <input
                required
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </label>
            <label className="wide">
              Alamat default
              <textarea
                required
                rows={4}
                value={form.default_address}
                onChange={(event) =>
                  setForm({ ...form, default_address: event.target.value })
                }
              />
            </label>
            <label>
              Kode pos
              <input
                required
                inputMode="numeric"
                minLength={5}
                maxLength={5}
                pattern="[0-9]{5}"
                title="Masukkan 5 digit kode pos"
                value={form.default_postcode}
                onChange={(event) =>
                  setForm({ ...form, default_postcode: event.target.value })
                }
              />
            </label>
            <label>
              Email
              <input readOnly value={user.email} className="readonly-input" />
            </label>
          </div>
          <button
            className="button button-primary"
            disabled={busy}
            type="submit"
          >
            Simpan perubahan <Icon name="check" size={18} />
          </button>
        </form>
        <button
          className="button button-soft full-width mobile-logout mt-5"
          onClick={logout}
        >
          Keluar dari akun
        </button>
        {message && (
          <p className="inline-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error mt-5" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
