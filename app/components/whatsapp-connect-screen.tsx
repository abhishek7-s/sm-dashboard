import type { WhatsAppConnection } from "@/lib/whatsapp/connection";

const steps = [
  "Open WhatsApp on your phone",
  "Tap Settings (iPhone) or the ⋮ menu (Android)",
  "Tap Linked devices, then Link a device",
  "Point your phone at this QR code",
];

/** Full-page prompt shown until a WhatsApp number is linked. */
export function WhatsAppConnectScreen({ connection }: { connection: WhatsAppConnection }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-slate-50 p-4 md:p-8">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        {connection.state === "needs_qr" && connection.qrDataUrl ? (
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-800">
                Link your WhatsApp
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Use the phone with the WhatsApp number you want to manage here.
              </p>
              <ol className="mt-6 space-y-4">
                {steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3 text-[15px] text-slate-700">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-xs text-slate-400">
                The code refreshes automatically. Your chats will start appearing a few seconds after linking.
              </p>
            </div>
            <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
              <img
                src={connection.qrDataUrl}
                alt="WhatsApp link QR code"
                width={264}
                height={264}
                className="size-[232px] md:size-[264px]"
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-md text-center">
            <div
              className={`mx-auto mb-5 grid size-14 place-items-center rounded-full text-2xl ${
                connection.state === "worker_offline" ? "bg-rose-50" : "bg-amber-50"
              }`}
              aria-hidden
            >
              {connection.state === "worker_offline" ? "⚠️" : "⏳"}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-800">
              {connection.state === "worker_offline"
                ? "WhatsApp service is not running"
                : "Getting WhatsApp ready…"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              {connection.state === "worker_offline"
                ? "To link a WhatsApp number, the WhatsApp service needs to be running. Ask your administrator to start it with npm run whatsapp:worker. This page updates on its own."
                : "A QR code to link your phone will appear here in a few seconds."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
