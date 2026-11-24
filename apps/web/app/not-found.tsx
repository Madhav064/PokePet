import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-pp py-24 text-center flex flex-col items-center gap-4">
      <p className="font-display text-5xl">404</p>
      <p className="text-muted">That pet wandered off.</p>
      <Link href="/" className="chip">Back to all pets</Link>
    </div>
  );
}
