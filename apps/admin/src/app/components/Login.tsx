import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  Check,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Play,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import { useAdminAuth } from "../data/AdminAuthContext";

type BusinessOption = {
  id: string;
  name: string;
  companyName: string;
  gmbId: string | null;
  alias: string | null;
  calendarConnected: boolean;
};

type DiscoveredBusiness = {
  placeId: string;
  name: string;
  formattedAddress: string;
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  existingTeam: {
    communityId: string;
    communityName: string;
    companyName: string;
  } | null;
};

type SignupStep = "business" | "team" | "account" | "otp";

function apiUrl(path: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${path}`;
}

async function responseJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed with ${response.status}.`);
  return body;
}

export function Login() {
  const { login, startSignup, verifySignup, resendSignupOtp } = useAdminAuth();
  const [journey, setJourney] = useState<"signin" | "signup">("signin");

  const [signInStep, setSignInStep] = useState<1 | 2>(1);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [communityQuery, setCommunityQuery] = useState("");
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);

  const [signupStep, setSignupStep] = useState<SignupStep>("business");
  const [businessQuery, setBusinessQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredBusiness[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<DiscoveredBusiness | null>(null);
  const [signupMode, setSignupMode] = useState<"join" | "create" | null>(null);
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [requestId, setRequestId] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resent, setResent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/api/admin/auth/businesses"), { cache: "no-store" })
      .then(responseJson)
      .then((body) => {
        const items = body.businesses as BusinessOption[];
        setBusinesses(items);
        setSelectedBusinessId(items[0]?.id ?? "");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load businesses."))
      .finally(() => setLoadingBusinesses(false));
  }, []);

  const visibleBusinesses = useMemo(() => {
    const value = communityQuery.trim().toLowerCase();
    return value
      ? businesses.filter((business) =>
          `${business.name} ${business.companyName} ${business.alias ?? ""}`.toLowerCase().includes(value)
        )
      : businesses;
  }, [businesses, communityQuery]);

  const selectedBusiness = businesses.find((business) => business.id === selectedBusinessId) ?? null;
  const signupStepNumber = { business: 1, team: 2, account: 3, otp: 4 }[signupStep];

  function switchJourney(next: "signin" | "signup") {
    setJourney(next);
    setError(null);
  }

  async function submitSignIn(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password, communityId: selectedBusinessId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function searchBusinesses(event: React.FormEvent) {
    event.preventDefault();
    if (businessQuery.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/admin/auth/signup/discover?q=${encodeURIComponent(businessQuery.trim())}`),
        { cache: "no-store" }
      );
      const body = await responseJson(response);
      setDiscovered(body.businesses as DiscoveredBusiness[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Business search failed.");
    } finally {
      setSearching(false);
    }
  }

  function choosePlace(place: DiscoveredBusiness) {
    setSelectedPlace(place);
    setSignupMode(place.existingTeam ? "join" : "create");
    setCompanyName(place.existingTeam?.companyName ?? place.name);
    setSignupStep("team");
    setError(null);
  }

  async function submitRegistration(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPlace || !signupMode) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await startSignup({
        email,
        password,
        fullName,
        mode: signupMode,
        placeId: selectedPlace.placeId,
        communityId: selectedPlace.existingTeam?.communityId ?? null,
        companyName: signupMode === "create" ? companyName : null,
      });
      if (!result.verified) {
        setRequestId(result.requestId);
        setVerificationEmail(result.email);
        setSignupStep("otp");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitOtp(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifySignup({ requestId, email: verificationEmail, token: otp });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendOtp() {
    setSubmitting(true);
    setError(null);
    setResent(false);
    try {
      await resendSignupOtp({ requestId, email: verificationEmail });
      setResent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resend the code.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-5 py-8 sm:px-8 sm:py-10" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Play className="h-4 w-4 fill-white text-white" />
            </div>
            <div>
              <div className="font-bold leading-none text-foreground">Tour</div>
              <div className="mt-1 text-xs text-muted-foreground">Community workspace</div>
            </div>
          </div>
          <div className="flex rounded-md border border-border bg-white p-1">
            {(["signin", "signup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => switchJourney(item)}
                className={`rounded px-3 py-1.5 text-xs font-bold ${
                  journey === item ? "bg-primary text-white" : "text-muted-foreground"
                }`}
              >
                {item === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
        </header>

        <div className={`mt-7 grid gap-2 ${journey === "signin" ? "grid-cols-2" : "grid-cols-4"}`} aria-hidden="true">
          {Array.from({ length: journey === "signin" ? 2 : 4 }).map((_, index) => (
            <div
              key={index}
              className={`h-1 rounded-full ${
                index < (journey === "signin" ? signInStep : signupStepNumber) ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        <main className="flex flex-1 items-center py-8">
          {journey === "signin" ? (
            signInStep === 1 ? (
              <section className="w-full">
                <PageTitle eyebrow="Workspace" title="Choose your community" />
                <SearchInput value={communityQuery} onChange={setCommunityQuery} placeholder="Search communities" />
                <div className="mt-3 max-h-[45vh] overflow-y-auto border-y border-border bg-white">
                  {loadingBusinesses && <EmptyLine>Loading communities...</EmptyLine>}
                  {!loadingBusinesses && visibleBusinesses.map((business) => (
                    <BusinessRow
                      key={business.id}
                      name={business.name}
                      detail={business.companyName}
                      selected={selectedBusinessId === business.id}
                      connected={business.calendarConnected}
                      onClick={() => setSelectedBusinessId(business.id)}
                    />
                  ))}
                  {!loadingBusinesses && visibleBusinesses.length === 0 && <EmptyLine>No matching communities.</EmptyLine>}
                </div>
                <PrimaryButton disabled={!selectedBusinessId} onClick={() => setSignInStep(2)}>
                  Continue <ArrowRight className="h-4 w-4" />
                </PrimaryButton>
              </section>
            ) : (
              <form onSubmit={submitSignIn} className="mx-auto w-full max-w-md">
                <BackButton onClick={() => setSignInStep(1)}>Change community</BackButton>
                {selectedBusiness && (
                  <SelectedBusiness name={selectedBusiness.name} detail={selectedBusiness.companyName} />
                )}
                <PageTitle eyebrow="Welcome back" title="Sign in to your workspace" />
                <AccountFields
                  email={email}
                  password={password}
                  onEmail={setEmail}
                  onPassword={setPassword}
                />
                <ErrorMessage message={error} />
                <SubmitButton disabled={!email.trim() || !password || submitting}>
                  {submitting ? "Signing in..." : "Sign in"}
                </SubmitButton>
              </form>
            )
          ) : signupStep === "business" ? (
            <section className="w-full">
              <PageTitle eyebrow="Find your business" title="Search Google Business" />
              <form onSubmit={searchBusinesses} className="flex gap-2">
                <SearchInput value={businessQuery} onChange={setBusinessQuery} placeholder="Business name and city" />
                <button
                  type="submit"
                  disabled={businessQuery.trim().length < 2 || searching}
                  className="rounded-md bg-primary px-4 text-sm font-bold text-white disabled:opacity-40"
                >
                  {searching ? "Searching..." : "Search"}
                </button>
              </form>
              <div className="mt-3 max-h-[45vh] overflow-y-auto border-y border-border bg-white">
                {discovered.map((business) => (
                  <BusinessRow
                    key={business.placeId}
                    name={business.name}
                    detail={business.formattedAddress}
                    badge={business.existingTeam ? "Team available" : "Create workspace"}
                    onClick={() => choosePlace(business)}
                  />
                ))}
                {!searching && discovered.length === 0 && <EmptyLine>Search for the business you represent.</EmptyLine>}
              </div>
              <ErrorMessage message={error} />
            </section>
          ) : signupStep === "team" && selectedPlace ? (
            <section className="w-full">
              <BackButton onClick={() => setSignupStep("business")}>Change business</BackButton>
              <SelectedBusiness name={selectedPlace.name} detail={selectedPlace.formattedAddress} />
              <PageTitle eyebrow="Team" title={selectedPlace.existingTeam ? "Join the existing team" : "Create your workspace"} />
              {selectedPlace.existingTeam ? (
                <ChoiceButton
                  selected={signupMode === "join"}
                  icon={<UsersRound className="h-5 w-5" />}
                  title={selectedPlace.existingTeam.companyName}
                  detail={selectedPlace.existingTeam.communityName}
                  onClick={() => setSignupMode("join")}
                />
              ) : (
                <ChoiceButton
                  selected={signupMode === "create"}
                  icon={<Building2 className="h-5 w-5" />}
                  title="Create a new team"
                  detail={selectedPlace.name}
                  onClick={() => setSignupMode("create")}
                />
              )}
              <PrimaryButton disabled={!signupMode} onClick={() => setSignupStep("account")}>
                Continue <ArrowRight className="h-4 w-4" />
              </PrimaryButton>
            </section>
          ) : signupStep === "account" && selectedPlace && signupMode ? (
            <form onSubmit={submitRegistration} className="mx-auto w-full max-w-md">
              <BackButton onClick={() => setSignupStep("team")}>Change team</BackButton>
              <PageTitle
                eyebrow={signupMode === "join" ? "Join team" : "New workspace"}
                title="Create your account"
              />
              <div className="space-y-4">
                <Field label="Full name" icon={<UserRound className="h-4 w-4" />}>
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" autoComplete="name" required />
                </Field>
                {signupMode === "create" && (
                  <Field label="Company or team name" icon={<Building2 className="h-4 w-4" />}>
                    <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" autoComplete="organization" required />
                  </Field>
                )}
                <AccountFields email={email} password={password} onEmail={setEmail} onPassword={setPassword} />
              </div>
              <ErrorMessage message={error} />
              <SubmitButton disabled={!fullName.trim() || !email.trim() || password.length < 8 || submitting}>
                {submitting ? "Sending code..." : "Send verification code"}
              </SubmitButton>
            </form>
          ) : (
            <form onSubmit={submitOtp} className="mx-auto w-full max-w-md">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
                <KeyRound className="h-6 w-6" />
              </div>
              <PageTitle eyebrow="Email verification" title="Enter your verification code" />
              <p className="-mt-3 mb-5 text-sm text-muted-foreground">{verificationEmail}</p>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">One-time code</span>
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="mt-1 w-full rounded-md border border-border bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.35em] outline-none focus:ring-2 focus:ring-ring"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />
              </label>
              <ErrorMessage message={error} />
              <SubmitButton disabled={otp.length < 6 || submitting}>
                {submitting ? "Verifying..." : "Verify and continue"}
              </SubmitButton>
              <button
                type="button"
                onClick={resendOtp}
                disabled={submitting}
                className="mt-3 w-full text-center text-sm font-semibold text-primary disabled:opacity-40"
              >
                {resent ? "A new code was sent" : "Resend code"}
              </button>
              <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                Your community access is created only after verification.
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}

function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-bold uppercase text-primary">{eyebrow}</div>
      <h1 className="mt-2 text-2xl font-extrabold text-foreground sm:text-3xl">{title}</h1>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-white px-3 py-2.5">
      <Search className="h-4 w-4 text-muted-foreground" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        placeholder={placeholder}
      />
    </label>
  );
}

function BusinessRow({
  name,
  detail,
  selected,
  connected,
  badge,
  onClick,
}: {
  name: string;
  detail: string;
  selected?: boolean;
  connected?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left last:border-b-0 ${
        selected ? "bg-primary/8" : "hover:bg-secondary/40"
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${selected ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>
        <MapPin className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {badge && <span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{badge}</span>}
      {connected && <CalendarCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />}
      {selected && <Check className="h-4 w-4 text-primary" />}
    </button>
  );
}

function SelectedBusiness({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="mb-6 flex items-center gap-3 border-y border-border bg-white px-3 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-white">
        <Building2 className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </div>
  );
}

function ChoiceButton({ selected, icon, title, detail, onClick }: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 border px-4 py-4 text-left ${selected ? "border-primary bg-primary/5" : "border-border bg-white"}`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-md ${selected ? "bg-primary text-white" : "bg-secondary text-muted-foreground"}`}>{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
      </span>
      {selected && <Check className="h-5 w-5 text-primary" />}
    </button>
  );
}

function AccountFields({ email, password, onEmail, onPassword }: {
  email: string;
  password: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Email" icon={<Mail className="h-4 w-4" />}>
        <input value={email} onChange={(event) => onEmail(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" icon={<Lock className="h-4 w-4" />}>
        <input value={password} onChange={(event) => onPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" type="password" autoComplete="current-password" minLength={8} required />
      </Field>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2.5 text-muted-foreground">
        {icon}
        {children}
      </div>
    </label>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> {children}
    </button>
  );
}

function PrimaryButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
      {children}
    </button>
  );
}

function SubmitButton({ disabled, children }: { disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={disabled} className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
      {children}
    </button>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div> : null;
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{children}</div>;
}
