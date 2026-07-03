"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  Lock,
  Mail,
  Play,
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
  const [step, setStep] = useState<1 | 2>(1);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then((response) => {
        if (response.ok) router.replace("/");
      })
      .catch(() => {});

    fetch("/api/admin/auth/businesses")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load communities.");
        return body.businesses as BusinessOption[];
      })
      .then((items) => {
        setBusinesses(items);
        setSelectedBusinessId(items[0]?.id ?? "");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load communities."))
      .finally(() => setLoadingBusinesses(false));
  }, [router]);

  const visibleBusinesses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return businesses;
    return businesses.filter((business) =>
      `${business.name} ${business.companyName} ${business.alias ?? ""}`.toLowerCase().includes(normalized)
    );
  }, [businesses, query]);

  const selectedBusiness = businesses.find((business) => business.id === selectedBusinessId) ?? null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: selectedBusinessId,
          email,
          password,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Sign in failed.");
      window.location.assign("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}><Play size={15} fill="currentColor" /></span>
            <span>
              <strong>Tour</strong>
              <small>Leasing workspace</small>
            </span>
          </div>
          <span className={styles.stepLabel}>Step {step} of 2</span>
        </header>

        <div className={styles.progress} aria-hidden="true">
          <span data-active />
          <span data-active={step === 2 ? "true" : undefined} />
        </div>

        <section className={styles.content}>
          {step === 1 ? (
            <div className={styles.businessStep}>
              <div className={styles.intro}>
                <span className={styles.eyebrow}>Business</span>
                <h1>Where are you touring today?</h1>
                <p>Choose a community to open its sessions, calendar, materials, and rubrics.</p>
              </div>

              <label className={styles.search}>
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search communities"
                  aria-label="Search communities"
                />
              </label>

              <div className={styles.businessList}>
                {loadingBusinesses && <div className={styles.empty}>Loading communities...</div>}
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
                  <div className={styles.empty}>No matching communities.</div>
                )}
              </div>

              <button
                type="button"
                className={styles.primaryButton}
                disabled={!selectedBusinessId}
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
              >
                Continue <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <form className={styles.signInStep} onSubmit={submit}>
              <button type="button" className={styles.backButton} onClick={() => {
                setError(null);
                setStep(1);
              }}>
                <ArrowLeft size={16} /> Change community
              </button>

              <div className={styles.selectedBusiness}>
                <span className={styles.selectedIcon}><Building2 size={18} /></span>
                <span>
                  <strong>{selectedBusiness?.name}</strong>
                  <small>{selectedBusiness?.companyName}</small>
                </span>
              </div>

              <div className={styles.intro}>
                <span className={styles.eyebrow}>Team access</span>
                <h1>Sign in to your workspace</h1>
                <p>Use the credentials associated with your Tour account.</p>
              </div>

              <label className={styles.field}>
                <span>Email</span>
                <div><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus /></div>
              </label>
              <label className={styles.field}>
                <span>Password</span>
                <div><Lock size={16} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div>
              </label>

              {error && <div className={styles.error}>{error}</div>}

              <button type="submit" className={styles.primaryButton} disabled={!email.trim() || !password || submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </button>
              <p className={styles.security}><ShieldCheck size={15} /> Access is checked against your community membership.</p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
