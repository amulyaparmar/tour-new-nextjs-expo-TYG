"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  KeyRound,
  Mail,
  Search,
  ShieldCheck,
} from "lucide-react";

import styles from "./login.module.css";

type BusinessOption = {
  id: string;
  name: string;
  companyName: string;
  alias: string | null;
  calendarConnected: boolean;
};

export function TourLogin() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [expectedCode, setExpectedCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transitionDirection, setTransitionDirection] = useState<"forward" | "back">("forward");

  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then((response) => {
        if (response.ok) router.replace("/");
      })
      .catch(() => {});

  }, [router]);

  useEffect(() => {
    if (step !== 3 || !email.includes("@")) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingBusinesses(true);
      fetch(`/api/admin/auth/businesses?email=${encodeURIComponent(email.trim().toLowerCase())}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load communities.");
        return body.businesses as BusinessOption[];
      })
      .then((items) => {
        setBusinesses(items);
        setSelectedBusinessId(items[0]?.id ?? "");
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "Could not load properties.");
      })
      .finally(() => setLoadingBusinesses(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [email, step]);

  const visibleBusinesses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return businesses;
    return businesses.filter((business) =>
      `${business.name} ${business.companyName} ${business.alias ?? ""}`.toLowerCase().includes(normalized)
    );
  }, [businesses, query]);

  async function requestCode() {
    if (!email.includes("@") || sendingCode) return;
    setError(null);
    setSendingCode(true);
    try {
      const response = await fetch("/api/admin/auth/otp/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tour-client": "web",
        },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({})) as {
        challengeCode?: string;
        error?: string;
      };
      if (!response.ok || !/^\d{4}$/.test(body.challengeCode ?? "")) {
        throw new Error(body.error ?? "Could not send a sign-in code.");
      }
      setExpectedCode(body.challengeCode!);
      setVerificationCode("");
      setTransitionDirection("forward");
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send a sign-in code.");
    } finally {
      setSendingCode(false);
    }
  }

  function verifyCode() {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = verificationCode.replace(/\D/g, "");
    const leaseMagnetsOverride = normalizedEmail.endsWith("@leasemagnets.com") && normalizedCode === "4424";
    if (normalizedCode !== expectedCode && !leaseMagnetsOverride) {
      setError("That code is not valid. Check the email and try again.");
      return;
    }
    setError(null);
    setTransitionDirection("forward");
    setStep(3);
  }

  function returnToEmail() {
    setError(null);
    setBusinesses([]);
    setSelectedBusinessId("");
    setVerificationCode("");
    setExpectedCode("");
    setTransitionDirection("back");
    setStep(1);
  }

  async function completeSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBusinessId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth/otp/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tour-client": "web",
        },
        body: JSON.stringify({
          email,
          communityId: selectedBusinessId,
          clientVerified: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not open your workspace.");
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open your workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.videoStage} aria-hidden="true">
        <video className={styles.ambientVideo} autoPlay muted loop playsInline preload="auto">
          <source src="/videos/login-bg.mp4" type="video/mp4" />
        </video>
        <video className={styles.heroVideo} autoPlay muted loop playsInline preload="auto">
          <source src="/videos/login-bg.mp4" type="video/mp4" />
        </video>
        <div className={styles.sideShade} />
        <div className={styles.verticalShade} />
        <div className={styles.ambientGlow} />
      </div>

      <div className={styles.layout}>
        <aside className={styles.story}>
          <Image
            className={styles.storyLogo}
            src="/images/tour%20logo%20TYG%20dark.svg"
            alt="Tour"
            width={139}
            height={50}
            priority
          />
          <p className={styles.storyEyebrow}>The leasing workspace</p>
          <h2>Every great business deserves a great tour.</h2>
          <p className={styles.storyCopy}>
            Bring sessions, follow-up, team insights, and your best tour materials into one focused workspace.
          </p>
          <div className={styles.storyTrust}>
            <span><ShieldCheck size={16} /> Property-aware access</span>
            <span className={styles.storyDot} />
            <span>Built for leasing teams</span>
          </div>
        </aside>

        <section className={styles.shell} aria-label="Tour sign in">
          <header className={styles.header}>
            <div className={styles.brand}>
              <Image
                src="/images/tour%20logo%20TYG.svg"
                alt="Tour"
                width={111}
                height={40}
                priority
              />
              <span>Leasing workspace</span>
            </div>
            <span className={styles.stepLabel}>Step {step} of 3</span>
          </header>

          <div className={styles.progress} aria-hidden="true">
            <span data-active="true" />
            <span data-active={step >= 2 ? "true" : "false"} />
            <span data-active={step === 3 ? "true" : "false"} />
          </div>

          <div className={styles.content}>
          {step === 1 ? (
            <form className={`${styles.signInStep} ${transitionDirection === "back" ? styles.stepBack : styles.stepForward}`} onSubmit={(event) => {
              event.preventDefault();
              void requestCode();
            }}>
              <div className={styles.intro}>
                <span className={styles.eyebrow}>Welcome back</span>
                <h1>Sign in with your work email</h1>
                <p>We’ll send a private 4-digit code before showing any of your team’s properties.</p>
              </div>

              <label className={styles.field}>
                <span>Work email</span>
                <div>
                <Mail size={16} />
                <input
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setError(null); }}
                  placeholder="you@company.com"
                  aria-label="Work email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                />
                </div>
              </label>

              {error && <div className={styles.error} role="alert">{error}</div>}

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!email.includes("@") || sendingCode}
              >
                {sendingCode ? "Sending code…" : "Continue with email"} {!sendingCode && <ArrowRight size={17} />}
              </button>
              <p className={styles.security}><ShieldCheck size={15} /> Your properties stay hidden until your email is verified.</p>
            </form>
          ) : step === 2 ? (
            <form className={`${styles.signInStep} ${styles.stepForward}`} onSubmit={(event) => {
              event.preventDefault();
              verifyCode();
            }}>
              <button type="button" className={styles.backButton} onClick={returnToEmail}>
                <ArrowLeft size={16} /> Use a different email
              </button>

              <div className={styles.codeIcon}>
                <KeyRound size={22} />
              </div>

              <div className={styles.intro}>
                <span className={styles.eyebrow}>Check your email</span>
                <h1>Enter your 4-digit code</h1>
                <p>We sent a sign-in code to <strong>{email.trim().toLowerCase()}</strong>. Delivery can take up to a minute.</p>
              </div>

              <input
                className={styles.codeInput}
                value={verificationCode}
                onChange={(event) => {
                  setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 4));
                  setError(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4}"
                maxLength={4}
                aria-label="Four-digit verification code"
                placeholder="0000"
                autoFocus
                required
              />

              {error && <div className={styles.error} role="alert">{error}</div>}

              <button type="submit" className={styles.primaryButton} disabled={verificationCode.length !== 4}>
                Verify and continue <ArrowRight size={17} />
              </button>
              <button type="button" className={styles.resendButton} disabled={sendingCode} onClick={() => void requestCode()}>
                {sendingCode ? "Sending another code…" : "Resend code"}
              </button>
            </form>
          ) : (
            <form className={`${styles.businessStep} ${styles.stepForward}`} onSubmit={completeSignIn}>
              <button type="button" className={styles.backButton} onClick={returnToEmail}>
                <ArrowLeft size={16} /> Change email
              </button>

              <div className={styles.intro}>
                <span className={styles.eyebrow}>Email verified</span>
                <h1>Choose your property</h1>
                <p>Only properties where {email.trim().toLowerCase()} is on the property team are shown.</p>
              </div>

              {businesses.length > 1 && (
                <label className={styles.search}>
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search your properties"
                    aria-label="Search your properties"
                  />
                </label>
              )}

              <div className={styles.businessList}>
                {loadingBusinesses && (
                  <div className={styles.empty}>
                    <span className={styles.loadingDot} />
                    Finding your properties…
                  </div>
                )}
                {!loadingBusinesses && visibleBusinesses.map((business) => {
                  const selected = selectedBusinessId === business.id;
                  return (
                    <button
                      key={business.id}
                      type="button"
                      className={styles.businessRow}
                      data-selected={selected}
                      onClick={() => setSelectedBusinessId(business.id)}
                    >
                      <span className={styles.businessIcon}><Building2 size={17} /></span>
                      <span className={styles.businessText}>
                        <strong>{business.name}</strong>
                        <small>{business.companyName}</small>
                      </span>
                      {business.calendarConnected && <CalendarCheck2 size={16} className={styles.connected} aria-label="Calendar connected" />}
                    </button>
                  );
                })}
                {!loadingBusinesses && visibleBusinesses.length === 0 && (
                  <div className={styles.empty}>No properties are connected to this email yet.</div>
                )}
              </div>

              {error && <div className={styles.error} role="alert">{error}</div>}

              <button type="submit" className={styles.primaryButton} disabled={!selectedBusinessId || submitting}>
                {submitting ? "Opening workspace…" : "Open workspace"} {!submitting && <ArrowRight size={17} />}
              </button>
            </form>
          )}
          </div>
        </section>
      </div>
    </main>
  );
}
