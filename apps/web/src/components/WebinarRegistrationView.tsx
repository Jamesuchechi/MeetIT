import React, { useState } from 'react';
import type { WebinarState } from '@meetit/protocol';
import {
  registerForWebinarApi,
  simulatePayment,
  type PaymentSimulationResult,
} from '../lib/webinarStore';
import { Ticket, Check, Copy, Lock, ArrowRight, Radio } from 'lucide-react';

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
    setError(null);
    setIsSubmitting(true);

    try {
      let transactionRef: string | undefined = undefined;
      let paymentStatus: 'free' | 'paid' = 'free';

      if (selectedTicket === 'vip') {
        const payRes = await simulatePayment(
          selectedProvider,
          ticketPrice,
          currency as 'USD' | 'NGN' | 'EUR' | 'GBP',
        );
        if (!payRes.success) {
          throw new Error('Payment processing simulation failed.');
        }
        setPaymentResult(payRes);
        transactionRef = payRes.transactionRef;
        paymentStatus = 'paid';
      }

      const res = await registerForWebinarApi(roomCode, {
        name,
        email,
        role: 'viewer',
        paymentProvider: selectedTicket === 'vip' ? selectedProvider : 'free',
        paymentStatus,
        ticketPrice: selectedTicket === 'vip' ? ticketPrice : 0,
        currency: currency as 'USD' | 'NGN' | 'EUR' | 'GBP',
        ...(transactionRef ? { transactionRef } : {}),
        responses: customAnswers,
      });

      setJoinToken(res.joinToken);
      if (onRegistered) onRegistered(res.joinToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const uniqueJoinUrl = joinToken
    ? `${origin}/m/${roomCode}?webinarToken=${encodeURIComponent(joinToken)}`
    : '';

  const handleCopyLink = () => {
    if (!uniqueJoinUrl) return;
    navigator.clipboard.writeText(uniqueJoinUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '40px auto',
        padding: '32px 24px',
        background: 'var(--surface)',
        borderRadius: '20px',
        border: '1px solid var(--line)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
        color: 'var(--ink)',
      }}
    >
      {/* Header and Branding */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt="Webinar Logo"
            style={{
              height: '56px',
              margin: '0 auto 16px',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            className="app-modal-icon"
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              margin: '0 auto 16px',
            }}
          >
            <Radio size={24} />
          </div>
        )}

        <h1
          style={{
            fontSize: '26px',
            fontWeight: 800,
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          {branding.headline || 'Webinar Registration'}
        </h1>
        <p
          style={{
            fontSize: '14.5px',
            color: 'var(--muted)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {branding.description ||
            'Fill out the form below to register and obtain your pass.'}
        </p>
      </div>

      {/* Speaker preview if present */}
      {branding.speakerBios && branding.speakerBios.length > 0 && (
        <div className="panel-card" style={{ marginBottom: '24px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--muted)',
            }}
          >
            Featured Speakers
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            {branding.speakerBios.map((s, idx) => (
              <div
                key={idx}
                style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
              >
                {s.avatarUrl ? (
                  <img
                    src={s.avatarUrl}
                    alt={s.name}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    className="app-modal-icon"
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    {s.name[0]}
                  </div>
                )}
                <div>
                  <strong
                    style={{
                      fontSize: '13px',
                      display: 'block',
                      color: 'var(--ink)',
                    }}
                  >
                    {s.name}
                  </strong>
                  <span style={{ fontSize: '11.5px', color: 'var(--accent)' }}>
                    {s.role} {s.company ? `· ${s.company}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registration Form or Confirmation Screen */}
      {!joinToken ? (
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
        >
          {error && (
            <div
              className="panel-card"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                color: 'var(--danger)',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '14px',
            }}
          >
            <div className="panel-form-group">
              <label htmlFor="reg-name-input">Full Name *</label>
              <input
                id="reg-name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="panel-input"
              />
            </div>

            <div className="panel-form-group">
              <label htmlFor="reg-email-input">Email Address *</label>
              <input
                id="reg-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="panel-input"
              />
            </div>
          </div>

          {/* Ticketing Options */}
          <div className="panel-form-group">
            <label>Select Ticket Access Tier</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '12px',
              }}
            >
              <div
                onClick={() => setSelectedTicket('free')}
                className="panel-card"
                style={{
                  cursor: 'pointer',
                  borderColor:
                    selectedTicket === 'free' ? 'var(--accent)' : 'var(--line)',
                  background:
                    selectedTicket === 'free'
                      ? 'var(--soft)'
                      : 'var(--surface)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
                    General Admission
                  </strong>
                  <span className="panel-badge active">Free</span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: 'var(--muted)',
                    lineHeight: 1.4,
                  }}
                >
                  Standard attendee pass to watch live and participate in polls.
                </p>
              </div>

              <div
                onClick={() => setSelectedTicket('vip')}
                className="panel-card"
                style={{
                  cursor: 'pointer',
                  borderColor:
                    selectedTicket === 'vip' ? 'var(--accent)' : 'var(--line)',
                  background:
                    selectedTicket === 'vip' ? 'var(--soft)' : 'var(--surface)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <strong style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
                    VIP Pass + Replay
                  </strong>
                  <span className="panel-badge live">
                    {currency} {ticketPrice}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: 'var(--muted)',
                    lineHeight: 1.4,
                  }}
                >
                  Priority Q&amp;A moderation queue, recording download, and
                  replay access.
                </p>
              </div>
            </div>
          </div>

          {/* Payment gateway selection when VIP is selected */}
          {selectedTicket === 'vip' && (
            <div className="panel-card" style={{ gap: '10px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 600 }}>
                Payment Processor Gateway (Simulated)
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                }}
              >
                {(['paystack', 'stripe', 'flutterwave'] as const).map(
                  (prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setSelectedProvider(prov)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        border: `1px solid ${selectedProvider === prov ? 'var(--accent)' : 'var(--line)'}`,
                        background:
                          selectedProvider === prov
                            ? 'var(--soft)'
                            : 'var(--surface)',
                        color:
                          selectedProvider === prov
                            ? 'var(--accent)'
                            : 'var(--ink)',
                        cursor: 'pointer',
                      }}
                    >
                      {prov}
                    </button>
                  ),
                )}
              </div>
              <p
                style={{ margin: 0, fontSize: '11.5px', color: 'var(--muted)' }}
              >
                Demo environment will complete payment simulation securely.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="panel-btn-primary"
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14.5px',
              marginTop: '6px',
            }}
          >
            {isSubmitting ? (
              <span>Processing Registration...</span>
            ) : selectedTicket === 'vip' ? (
              <>
                <Lock size={15} />
                Pay {currency} {ticketPrice} &amp; Complete Registration
              </>
            ) : (
              <>
                <Ticket size={15} />
                Complete Free Registration
              </>
            )}
          </button>
        </form>
      ) : (
        /* Confirmation & Direct Access Link Card */
        <div
          style={{
            textAlign: 'center',
            padding: '24px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            alignItems: 'center',
          }}
        >
          <div
            className="app-modal-icon"
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#22c55e',
            }}
          >
            <Check size={28} />
          </div>

          <div>
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 800,
                margin: '0 0 6px',
                color: 'var(--ink)',
              }}
            >
              You are officially registered!
            </h2>
            <p style={{ fontSize: '13.5px', color: 'var(--muted)', margin: 0 }}>
              Your personalized webinar pass has been issued and stored.
            </p>
          </div>

          {paymentResult && (
            <div
              className="panel-card"
              style={{
                textAlign: 'left',
                fontSize: '12px',
                maxWidth: '380px',
                width: '100%',
              }}
            >
              <strong
                style={{
                  color: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Check size={14} /> Payment Confirmed
              </strong>
              <div style={{ color: 'var(--muted)' }}>
                Transaction Ref:{' '}
                <span style={{ fontFamily: 'monospace', color: 'var(--ink)' }}>
                  {paymentResult.transactionRef}
                </span>
              </div>
              <div style={{ color: 'var(--muted)' }}>
                Gateway:{' '}
                <span
                  style={{ textTransform: 'capitalize', color: 'var(--ink)' }}
                >
                  {paymentResult.provider}
                </span>{' '}
                ({paymentResult.currency} {paymentResult.amount})
              </div>
            </div>
          )}

          <div
            className="panel-card"
            style={{ width: '100%', textAlign: 'left' }}
          >
            <label
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted)',
              }}
            >
              Your Unique Join Link
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <input
                type="text"
                readOnly
                value={uniqueJoinUrl}
                className="panel-input"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="panel-btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
              >
                {copiedLink ? (
                  <>
                    <Check size={14} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy Link
                  </>
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onJoinDirectly?.(joinToken)}
            className="panel-btn-primary"
            style={{ padding: '12px 28px', fontSize: '14.5px' }}
          >
            <span>Enter Webinar Room Now</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
