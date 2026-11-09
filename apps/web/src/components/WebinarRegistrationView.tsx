import React, { useState } from 'react';
import type { WebinarState } from '@meetit/protocol';
import {
  registerForWebinarApi,
  simulatePayment,
  type PaymentSimulationResult,
} from '../lib/webinarStore';

interface WebinarRegistrationViewProps {
  roomCode: string;
  webinar?: WebinarState;
  onRegistered?: (token: string) => void;
  onJoinDirectly?: (token: string) => void;
}

export const WebinarRegistrationView: React.FC<
  WebinarRegistrationViewProps
> = ({
  roomCode,
  webinar = {
    enabled: true,
    practiceMode: true,
    isLive: false,
    registrationRequired: true,
    registrationFields: [],
    autoApproveRegistrations: true,
    maxViewers: 1000,
    branding: {
      headline: 'Exclusive Webinar Registration',
      description:
        'Register now to secure your pass and receive your unique direct access link.',
      speakerBios: [],
    },
  },
  onRegistered,
  onJoinDirectly,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<'free' | 'vip'>('free');
  const [selectedProvider, setSelectedProvider] = useState<
    'stripe' | 'paystack' | 'flutterwave'
  >('paystack');
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>(
    {},
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentResult, setPaymentResult] =
    useState<PaymentSimulationResult | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const branding = webinar.branding ?? {
    headline: 'Exclusive Webinar Registration',
    description:
      'Register now to secure your pass and receive your unique direct access link.',
    speakerBios: [],
  };

  const ticketPrice = webinar.ticketPriceCents
    ? webinar.ticketPriceCents / 100
    : 20;
  const currency = webinar.currency || 'USD';

  const handleCustomFieldChange = (fieldId: string, val: string) => {
    setCustomAnswers((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Please provide your name and email address.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      let txRef: string | undefined = undefined;
      let paymentStatus: 'free' | 'paid' = 'free';

      if (selectedTicket === 'vip') {
        const payRes = await simulatePayment(
          selectedProvider,
          ticketPrice,
          currency,
        );
        setPaymentResult(payRes);
        txRef = payRes.transactionRef;
        paymentStatus = 'paid';
      }

      const res = await registerForWebinarApi(roomCode, {
        name,
        email,
        role: 'viewer',
        paymentProvider: selectedTicket === 'vip' ? selectedProvider : 'free',
        paymentStatus,
        ticketPrice: selectedTicket === 'vip' ? ticketPrice : 0,
        currency,
        ...(txRef ? { transactionRef: txRef } : {}),
        responses: customAnswers,
      });

      setJoinToken(res.joinToken);
      onRegistered?.(res.joinToken);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Registration failed. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const uniqueJoinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/room/${roomCode}?webinarToken=${joinToken}`
      : `/room/${roomCode}?webinarToken=${joinToken}`;

  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(uniqueJoinUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto my-8 p-6 md:p-10 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl">
      {/* Header with branding */}
      <div className="text-center mb-8">
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt="Logo"
            className="h-14 mx-auto mb-4 object-contain"
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 mx-auto mb-4 flex items-center justify-center font-black text-2xl text-white shadow-lg shadow-indigo-500/20">
            W
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
          {branding.headline || 'Webinar Registration'}
        </h1>
        <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto">
          {branding.description ||
            'Fill out the form below to register and obtain your pass.'}
        </p>
      </div>

      {/* Speaker preview if present */}
      {branding.speakerBios && branding.speakerBios.length > 0 && (
        <div className="mb-8 p-4 rounded-xl bg-slate-800/50 border border-slate-750">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Featured Speakers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {branding.speakerBios.map((s, idx) => (
              <div key={idx} className="flex items-center gap-3">
                {s.avatarUrl ? (
                  <img
                    src={s.avatarUrl}
                    alt={s.name}
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-indigo-900 text-indigo-300 font-bold flex items-center justify-center text-sm">
                    {s.name[0]}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-slate-200">
                    {s.name}
                  </div>
                  <div className="text-xs text-indigo-400">
                    {s.role} {s.company ? `• ${s.company}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registration Form or Confirmation Screen */}
      {!joinToken ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Custom form fields if configured */}
          {webinar.customFields && webinar.customFields.length > 0 && (
            <div className="space-y-4 pt-2">
              {webinar.customFields.map((field) => (
                <div key={field.id}>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {field.label} {field.required ? '*' : ''}
                  </label>
                  {field.type === 'select' && field.options ? (
                    <select
                      required={field.required}
                      value={customAnswers[field.id] || ''}
                      onChange={(e) =>
                        handleCustomFieldChange(field.id, e.target.value)
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select an option...</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type === 'email' ? 'email' : 'text'}
                      required={field.required}
                      value={customAnswers[field.id] || ''}
                      onChange={(e) =>
                        handleCustomFieldChange(field.id, e.target.value)
                      }
                      placeholder={`Enter your ${field.label.toLowerCase()}`}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Ticketing Options (Paid Webinar Simulation) */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Ticket Access Tier
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div
                onClick={() => setSelectedTicket('free')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedTicket === 'free'
                    ? 'bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-sm text-white">
                    General Admission
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                    Free
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Standard attendee pass to watch live and participate in polls.
                </p>
              </div>

              <div
                onClick={() => setSelectedTicket('vip')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedTicket === 'vip'
                    ? 'bg-indigo-600/10 border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-sm text-white">
                    VIP Pass + On-Demand Replay
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
                    {currency} {ticketPrice}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Priority Q&A moderation queue, recording download, and replay
                  access.
                </p>
              </div>
            </div>
          </div>

          {/* Payment gateway selection when VIP is selected */}
          {selectedTicket === 'vip' && (
            <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700 space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Payment Processor Gateway (Simulated)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['paystack', 'stripe', 'flutterwave'] as const).map(
                  (prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setSelectedProvider(prov)}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize transition-colors ${
                        selectedProvider === prov
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {prov}
                    </button>
                  ),
                )}
              </div>
              <p className="text-xs text-slate-400">
                Secure checkout via {selectedProvider}. Demo environment will
                complete payment automatically.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                <span>Processing Registration...</span>
              </>
            ) : (
              <span>
                {selectedTicket === 'vip'
                  ? `Pay ${currency} ${ticketPrice} & Register`
                  : 'Complete Free Registration'}
              </span>
            )}
          </button>
        </form>
      ) : (
        /* Confirmation & Direct Access Link Card */
        <div className="text-center py-6 space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center text-3xl">
            ✓
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">
              You are officially registered!
            </h2>
            <p className="text-slate-400 text-sm">
              Your personalized webinar pass has been issued and stored.
            </p>
          </div>

          {paymentResult && (
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-750 text-xs text-slate-300 inline-block text-left">
              <div className="font-semibold text-emerald-400 mb-1">
                Payment Confirmed
              </div>
              <div>
                Transaction Ref:{' '}
                <span className="font-mono text-slate-200">
                  {paymentResult.transactionRef}
                </span>
              </div>
              <div>
                Gateway:{' '}
                <span className="capitalize">{paymentResult.provider}</span> (
                {paymentResult.currency} {paymentResult.amount})
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-slate-800 border border-slate-750 text-left">
            <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1.5 font-semibold">
              Your Unique Join Link
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={uniqueJoinUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-white whitespace-nowrap transition-colors"
              >
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={() => onJoinDirectly?.(joinToken)}
              className="py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm text-white shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              Enter Webinar Room Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
