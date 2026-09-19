export default function SignInCard({ href, checking = false, failed = false }: { href?: string; checking?: boolean; failed?: boolean }) {
  return <>
    <p>Your writing, one sign-in away.</p>
    <p className="writer-help">Sign in with your GitHub account. No token to copy or paste.</p>
    {checking ? <p role="status" className="writer-help">Checking your session…</p> : href
      ? <a className="writer-primary writer-sign-in" href={href}>Sign in with GitHub ↗</a>
      : <><button className="writer-primary" disabled>Sign in with GitHub ↗</button><p className="writer-help">GitHub sign-in is being set up. Local writing is still available.</p></>}
    {failed && <p className="writer-error" role="alert">Sign-in was cancelled or could not be completed. Check the GitHub App installation, then try again.</p>}
    <p className="writer-help">Only MingyuanRen can write here. This browser stays signed in for up to 30 days, unless you sign out or revoke access. Public pages stay on mingyuanren.github.io.</p>
  </>;
}
