import { FiAlertCircle, FiCheckCircle, FiX } from "react-icons/fi";

export type ToastMessage = {
  id: number;
  title: string;
  detail?: string;
  variant: "success" | "error";
};

export function Toast({
  message,
  dismiss,
}: {
  message: ToastMessage | null;
  dismiss: () => void;
}) {
  if (!message) return null;

  const success = message.variant === "success";
  const Symbol = success ? FiCheckCircle : FiAlertCircle;

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[70] flex justify-center sm:inset-x-auto sm:right-6 sm:justify-end"
      aria-live={success ? "polite" : "assertive"}
    >
      <div
        key={message.id}
        role={success ? "status" : "alert"}
        className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-[#e9dde2] bg-white p-3.5 pr-2 shadow-[0_18px_50px_rgba(45,25,43,.18)] motion-safe:animate-[toast-enter_.28s_ease-out]"
      >
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl ${success ? "bg-[#e9f7ef] text-[#26794e]" : "bg-[#fff0ee] text-[#bd5261]"}`}
        >
          <Symbol size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-extrabold text-[#392137]">
            {message.title}
          </p>
          {message.detail && (
            <p className="mt-0.5 text-xs leading-relaxed text-[#796d78]">
              {message.detail}
            </p>
          )}
        </div>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-[#847680] hover:bg-[#f8f0f2]"
          onClick={dismiss}
          aria-label="Tutup notifikasi"
        >
          <FiX size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
