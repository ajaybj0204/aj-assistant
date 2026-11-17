export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <div className="backdrop" aria-hidden>
        <div className="glow warm" />
        <div className="glow tide" />
        <div className="stars" />
        <div className="grain" />
      </div>
      <div className="login">
        <div className="login-avatar" role="img" aria-label="AJ" />
        <span className="eyebrow mono"><i className="dot" /> Private · only for Ajay</span>
        <h1>
          Welcome back, <span className="tide">Master.</span>
        </h1>
        <p>Your personal assistant. Sign in to continue.</p>
        {error === "not_allowed" && <p className="error">This Google account isn&apos;t allowed.</p>}
        {error && error !== "not_allowed" && <p className="error">Sign-in failed. Please try again.</p>}
        <a className="button pill solid" href="/api/auth/login">Sign in with Google →</a>
      </div>
    </>
  );
}
